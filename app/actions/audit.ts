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

        const folders = res.data.files || []

        // Buscamos los estados de auditoría en la DB para estas carpetas
        const folderStats = await Promise.all(folders.map(async (folder) => {
            // CORRECCIÓN: Aseguramos que folder.name sea string para evitar el error de tipos
            const folderName = folder.name || "Desconocido"

            const audits = await prisma.shipmentAudit.findMany({
                where: { envioId: folderName },
                select: { status: true }
            });

            return {
                id: folder.id,
                name: folder.name,
                createdTime: folder.createdTime,
                stats: {
                    total: audits.length,
                    aprobados: audits.filter(a => a.status === 'APROBADO').length,
                    rechazados: audits.filter(a => a.status === 'RECHAZADO').length,
                }
            };
        }));

        return { success: true, folders: folderStats }
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

        const dbShipment = await prisma.shipment.findUnique({
            where: { name: envioId },
            include: { items: true }
        })

        const quantityMap = new Map<string, number>()
        if (dbShipment) {
            dbShipment.items.forEach(item => {
                quantityMap.set(item.itemId, item.quantity)
            })
        }

        let sheetMap = new Map()
        try {
            const response = await axios.get(GOOGLE_SHEET_CSV_URL)
            const parsed = Papa.parse(response.data, { header: false, skipEmptyLines: true })
            const sheetData = parsed.data as any[]
            
            sheetData.forEach((row, index) => {
                if (index === 0) return 
                const itemId = row[0]
                if (itemId) {
                    const listaAgregados = [row[13], row[14], row[15], row[16]]
                        .filter(texto => texto && texto.trim() !== "" && texto !== "TRUE" && texto !== "FALSE")

                    sheetMap.set(itemId.trim(), {
                        title: row[2] || 'Producto sin nombre',
                        sku: row[1] || 'S/D',
                        agregados: listaAgregados, 
                        referenceImage: row[17] || '' 
                    })
                }
            })
        } catch (e) {
            console.warn("Error leyendo Sheet:", e)
        }

        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true, status: true }
        })
        const statusMap = new Map()
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status))

        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000
        })

        const mlaFolders = mlaFoldersRes.data.files || []
        const allItems = []

        mlaFolders.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))

        for (const folder of mlaFolders) {
            const folderName = folder.name || ""
            const mlaId = folderName.split(' ')[0].trim() 

            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id)',
                pageSize: 20 
            })

            if (filesRes.data.files?.length) {
                const meta = sheetMap.get(mlaId) || {} 
                const allImages = filesRes.data.files.map(f => getPublicThumbnailLink(f.id!))
                let currentStatus = statusMap.get(mlaId) || 'PENDIENTE'
                const cantidadReal = quantityMap.get(mlaId) || 0

                allItems.push({
                    itemId: mlaId,
                    driveName: folderName, 
                    title: meta.title || folderName, 
                    sku: meta.sku || 'S/D',
                    quantity: cantidadReal, 
                    agregados: meta.agregados || [], 
                    referenceImageUrl: meta.referenceImage || null,
                    evidenceImageUrl: allImages[0],
                    evidenceImages: allImages,
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
