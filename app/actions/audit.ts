"use server"

import { google } from "googleapis"
import axios from "axios"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

// --- CONFIGURACIÓN ---
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1q0qWmIcRAybrxQcYRhJd5s-A1xiEe_VenWEA84Xptso/export?format=csv&gid=1236582105'
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
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
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

        // 1. Buscar carpeta del envío en Drive
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

        // 2. Traer datos del Sheet
        let sheetMap = new Map()
        try {
            console.log("Descargando CSV desde:", GOOGLE_SHEET_CSV_URL)
            const response = await axios.get(GOOGLE_SHEET_CSV_URL)
            const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true })
            const sheetData = parsed.data as any[]
            
            sheetData.forEach(row => {
                const itemId = row['ITEM ID']
                if (itemId) {
                    // Lista de Agregados
                    const listaAgregados = [
                        row['AGREGADO 1'],
                        row['AGREGADO 2'],
                        row['AGREGADO 3'],
                        row['AGREGADO 4']
                    ].filter(texto => texto && texto.trim() !== "")

                    sheetMap.set(itemId.trim(), {
                        title: row['Nombre'] || row['Titulo'] || 'Producto sin nombre',
                        sku: row['SKU'] || '',
                        agregados: listaAgregados, // Array de strings
                        referenceImage: row['URL FOTO'] || '' // Foto del Excel (Columna R)
                    })
                }
            })
        } catch (e) {
            console.warn("Error leyendo Sheet:", e)
        }

        // 3. Obtener estados de auditoría (Map: itemId -> status)
        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true, status: true }
        })
        const statusMap = new Map()
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status))

        // 4. Listar carpetas REALES en Drive
        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000
        })

        const mlaFolders = mlaFoldersRes.data.files || []
        const allItems = []

        // Ordenamos alfabéticamente por nombre de carpeta
        mlaFolders.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))

        for (const folder of mlaFolders) {
            const folderName = folder.name || ""
            const mlaId = folderName.split(' ')[0].trim() 

            // Buscar foto dentro de la carpeta (Evidencia)
            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id)',
                pageSize: 1
            })

            if (filesRes.data.files?.length) {
                const file = filesRes.data.files[0]
                const meta = sheetMap.get(mlaId) || {} 

                // Determinamos estado
                let currentStatus = statusMap.get(mlaId) || 'PENDIENTE'

                allItems.push({
                    itemId: mlaId,
                    driveName: folderName, // Nombre exacto de Drive
                    title: meta.title || folderName,
                    sku: meta.sku || 'S/D',
                    agregados: meta.agregados || [], // Array
                    referenceImageUrl: meta.referenceImage || null, // Foto ML
                    evidenceImageUrl: getPublicThumbnailLink(file.id!), // Foto Drive
                    status: currentStatus,
                    envioId: envioId
                })
            }
        }

        return { success: true, data: allItems, envioId }

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
