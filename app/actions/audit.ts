"use server"

import { google } from "googleapis"
import axios from "axios"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

// --- CONFIGURACIÓN ---
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1q0qWmIcRAybrxQcYRhJd5s-A1xiEe_VenWEA84Xptso/export?format=csv&gid=1839169689'
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

const getPublicThumbnailLink = (fileId: string) => {
    return `https://lh3.googleusercontent.com/d/${fileId}=s1000?authuser=0`
}

// NUEVA: Listar carpetas de envíos disponibles (Carpetas dentro de la carpeta maestra)
export async function getShipmentFolders() {
    try {
        const drive = getDriveClient()
        const res = await drive.files.list({
            q: `'${DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc', // Los más recientes primero
            pageSize: 20
        })
        return { success: true, folders: res.data.files || [] }
    } catch (error: any) {
        console.error("Error fetching folders:", error)
        return { success: false, error: error.message }
    }
}

// MODIFICADA: Ahora recibe un envioId (Nombre de la carpeta)
export async function getAuditPendingItems(selectedEnvioName?: string) {
    try {
        const drive = getDriveClient()
        let envioFolderId = ""
        let envioId = selectedEnvioName || ""

        // 1. Si NO nos pasan ID, tratamos de adivinarlo del Sheet (Comportamiento antiguo o fallback)
        // O si nos pasan ID, buscamos su Folder ID real en Drive
        
        // Buscamos la carpeta específica del envío
        let query = `'${DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        if (selectedEnvioName) {
            query += ` and name = '${selectedEnvioName}'`
        }

        const envioFolderRes = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            pageSize: 1 // Si no especificamos, agarramos el primero (el más reciente o el que coincida)
        })

        if (!envioFolderRes.data.files?.length) {
            return { error: `No se encontró la carpeta del envío: ${selectedEnvioName || 'Desconocido'}` }
        }

        const folderObj = envioFolderRes.data.files[0]
        envioFolderId = folderObj.id!
        envioId = folderObj.name! // Aseguramos tener el nombre real

        // 2. Traer datos del Sheet (Opcional: solo para sacar Títulos y SKUs bonitos)
        let sheetMap = new Map()
        try {
            const response = await axios.get(GOOGLE_SHEET_CSV_URL)
            const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true })
            const sheetData = parsed.data as any[]
            
            // Mapeamos MLA -> Datos
            sheetData.forEach(row => {
                const keys = Object.keys(row)
                const itemId = row['ITEM ID'] || row[keys[0]]
                if (itemId) {
                    sheetMap.set(itemId, {
                        title: row['Nombre'] || row['Titulo'] || row[keys[1]],
                        sku: row['SKU'] || row[keys[2]]
                    })
                }
            })
        } catch (e) {
            console.warn("No se pudo leer el Sheet, se mostrarán nombres crudos.", e)
        }

        // 3. Buscar qué ya aprobamos en la Base de Datos para este envío
        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true }
        })
        const auditedSet = new Set(auditedItems.map(i => i.itemId))

        // 4. Listar lo que hay REALMENTE en Drive (La verdad absoluta del contenido)
        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000
        })

        const mlaFolders = mlaFoldersRes.data.files || []
        const pendingItems = []

        // 5. Iterar carpetas de Drive y armar la lista
        for (const folder of mlaFolders) {
            // El nombre de la carpeta suele ser "MLA123" o "MLA123 - Titulo"
            const folderName = folder.name || ""
            const mlaId = folderName.split(' ')[0].trim() // Extraemos el ID

            // A. ¿Ya lo auditamos?
            if (auditedSet.has(mlaId)) continue

            // B. Buscar foto dentro
            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id)',
                pageSize: 1
            })

            if (filesRes.data.files?.length) {
                const file = filesRes.data.files[0]
                
                // C. Intentar enriquecer con datos del Sheet
                const meta = sheetMap.get(mlaId) || {}

                pendingItems.push({
                    itemId: mlaId,
                    title: meta.title || folderName, // Si no hay Sheet, usamos el nombre de la carpeta
                    sku: meta.sku || 'S/D',
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

export async function auditItem(itemId: string, status: string, envioId: string, reason?: string) {
    try {
        await prisma.shipmentAudit.create({
            data: { itemId, envioId, status, reason, auditor: "Admin" }
        })
        return { success: true }
    } catch (error: any) {
        if (error.code === 'P2002') { 
             await prisma.shipmentAudit.update({
                where: { itemId_envioId: { itemId, envioId } },
                data: { status, reason }
             })
             return { success: true }
        }
        return { success: false, error: error.message }
    }
}
