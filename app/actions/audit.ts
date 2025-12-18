"use server"

import { google } from "googleapis"
import axios from "axios"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

// --- CONFIGURACIÓN ACTUALIZADA ---
// 👇 Cambiamos el GID al final para apuntar a la hoja de "Agregados" (1236582105)
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv'
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
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` // 👈 Ajuste menor para asegurar que la imagen cargue bien
}

export async function getShipmentFolders() {
    try {
        const drive = getDriveClient()
        const res = await drive.files.list({
            q: `'${DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 20
        })
        return { success: true, folders: res.data.files || [] }
    } catch (error: any) {
        console.error("Error fetching folders:", error)
        return { success: false, error: error.message }
    }
}

export async function getAuditPendingItems(selectedEnvioName?: string) {
    try {
        const drive = getDriveClient()
        let envioFolderId = ""
        let envioId = selectedEnvioName || ""

        // 1. Buscar carpeta del envío
        let query = `'${DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        if (selectedEnvioName) {
            query += ` and name = '${selectedEnvioName}'`
        }

        const envioFolderRes = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            pageSize: 1
        })

        if (!envioFolderRes.data.files?.length) {
            return { error: `No se encontró la carpeta del envío: ${selectedEnvioName || 'Desconocido'}` }
        }

        const folderObj = envioFolderRes.data.files[0]
        envioFolderId = folderObj.id!
        envioId = folderObj.name! 

        // 2. Traer datos del Sheet (CON AGREGADOS)
        let sheetMap = new Map()
        try {
            console.log("Descargando CSV...")
            const response = await axios.get(GOOGLE_SHEET_CSV_URL)
            const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true })
            const sheetData = parsed.data as any[]
            
            sheetData.forEach(row => {
                // Buscamos columnas flexibles por si cambian el nombre exacto
                const keys = Object.keys(row)
                const itemId = row['ITEM ID'] || row['MLA'] || row[keys[0]] // Intenta buscar ITEM ID o usa la primera columna
                
                if (itemId) {
                    sheetMap.set(itemId.trim(), {
                        title: row['Nombre'] || row['Titulo'] || row['TITLE'] || '',
                        sku: row['SKU'] || '',
                        // 👇 ACÁ CAPTURAMOS LOS AGREGADOS
                        // Busca una columna que se llame 'Agregados', 'Extras' o 'Notas'
                        agregados: row['Agregados'] || row['Agregado'] || row['Notas'] || row['Observaciones'] || '' 
                    })
                }
            })
            console.log(`Sheet procesado. ${sheetMap.size} items en memoria.`)
        } catch (e) {
            console.warn("Error leyendo Sheet:", e)
        }

        // 3. Filtrar auditados (Base de Datos)
        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true }
        })
        const auditedSet = new Set(auditedItems.map(i => i.itemId))

        // 4. Listar carpetas REALES en Drive
        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000
        })

        const mlaFolders = mlaFoldersRes.data.files || []
        const pendingItems = []

        for (const folder of mlaFolders) {
            const folderName = folder.name || ""
            const mlaId = folderName.split(' ')[0].trim() 

            if (auditedSet.has(mlaId)) continue

            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id)',
                pageSize: 1
            })

            if (filesRes.data.files?.length) {
                const file = filesRes.data.files[0]
                const meta = sheetMap.get(mlaId) || {} // Cruzamos datos

                pendingItems.push({
                    itemId: mlaId,
                    title: meta.title || folderName,
                    sku: meta.sku || 'S/D',
                    agregados: meta.agregados || null, // 👈 Pasamos el dato al front
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
    // ... (El resto queda igual) ...
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
