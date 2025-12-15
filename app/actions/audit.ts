"use server"

import { google } from "googleapis"
import axios from "axios"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

// --- CONFIGURACIÓN ---
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1q0qWmIcRAybrxQcYRhJd5s-A1xiEe_VenWEA84Xptso/export?format=csv&gid=1839169689'
// ID de la carpeta donde se crean las carpetas de envíos (5422872, etc.)
const DRIVE_PARENT_FOLDER_ID = '1v-E638QF0AaPr7zywfH2luZvnHXtJujp' 

const getDriveClient = () => {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    )
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return google.drive({ version: 'v3', auth: oAuth2Client })
}

// Truco para ver fotos privadas de Drive sin login
const getPublicThumbnailLink = (fileId: string) => {
    return `https://lh3.googleusercontent.com/d/${fileId}=s1000?authuser=0`
}

// 1. TRAER PENDIENTES
export async function getAuditPendingItems() {
    try {
        // A. Leer el Sheet para sacar la "Llave Maestra" (ID Envío)
        const response = await axios.get(GOOGLE_SHEET_CSV_URL)
        const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true })
        const sheetData = parsed.data as any[]

        if (sheetData.length === 0) return { error: "El Sheet está vacío" }

        const firstRow = sheetData[0]
        const keys = Object.keys(firstRow)
        // Buscamos el ID del Envío en la columna correspondiente
        const envioId = firstRow['ID ENVIO'] || firstRow['ENVIO ID'] || firstRow[keys[18]] || 'SIN_ID'

        if (!envioId || envioId === 'SIN_ID') return { error: "No hay ID de Envío definido en el Sheet" }

        // B. Buscar qué ya aprobamos en la Base de Datos para este envío
        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true }
        })
        const auditedSet = new Set(auditedItems.map(i => i.itemId))

        // C. Buscar la Carpeta Maestra del Envío en Drive
        const drive = getDriveClient()
        // Importante: Buscamos carpeta con nombre EXACTO al envioId
        const envioFolderRes = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name = '${envioId.trim()}' and '${DRIVE_PARENT_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id, name)',
        })

        if (!envioFolderRes.data.files?.length) {
            return { error: `No se encontró en Drive la carpeta del envío: ${envioId}` }
        }
        
        const envioFolderId = envioFolderRes.data.files[0].id

        // D. Listar todas las carpetas de productos (MLAs) dentro de esa carpeta de envío
        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000
        })

        const mlaFolders = mlaFoldersRes.data.files || []
        
        // Mapa: "MLA123" -> "ID_Carpeta_Drive"
        const mlaFolderMap = new Map()
        mlaFolders.forEach(f => {
            // Asumimos que el nombre empieza con el MLA (ej: "MLA123 - Kit...") o es solo el MLA
            const mlaId = f.name?.split(' ')[0].trim() 
            if (mlaId) mlaFolderMap.set(mlaId, f.id)
        })

        // E. Cruzar datos: Sheet vs Drive vs DB
        const pendingItems = []

        for (const row of sheetData) {
            const itemId = row['ITEM ID'] || row[keys[0]] // El MLA real
            
            // 1. ¿Ya lo auditamos?
            if (auditedSet.has(itemId)) continue

            // 2. ¿Tiene carpeta en Drive?
            const folderId = mlaFolderMap.get(itemId)
            if (!folderId) continue // Si no hay carpeta, el operario no subió foto todavía

            // 3. Buscar la foto DENTRO de la carpeta del MLA
            const filesRes = await drive.files.list({
                q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id)',
                pageSize: 1 // Con una foto nos basta para mostrar
            })

            if (filesRes.data.files?.length) {
                const file = filesRes.data.files[0]
                pendingItems.push({
                    itemId: itemId, // MLA
                    title: row['Nombre'] || row['Titulo'] || row[keys[1]],
                    sku: row['SKU'] || row[keys[2]] || 'S/D',
                    imageUrl: getPublicThumbnailLink(file.id!),
                    envioId: envioId
                })
            }
        }

        return { success: true, data: pendingItems, envioId }

    } catch (error: any) {
        console.error("Error Audit:", error)
        return { error: "Error interno: " + error.message }
    }
}

// 2. GUARDAR AUDITORÍA (Aprobado/Rechazado)
export async function auditItem(itemId: string, status: string, envioId: string, reason?: string) {
    try {
        await prisma.shipmentAudit.create({
            data: {
                itemId,
                envioId,
                status,
                reason,
                auditor: "Admin" // Podrías poner el mail de la sesión aquí
            }
        })
        return { success: true }
    } catch (error: any) {
        // Si ya existe (unique constraint), actualizamos
        if (error.code === 'P2002') { 
             await prisma.shipmentAudit.update({
                where: {
                    itemId_envioId: { itemId, envioId }
                },
                data: { status, reason }
             })
             return { success: true }
        }
        return { success: false, error: error.message }
    }
          }
