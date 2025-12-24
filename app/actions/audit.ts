"use server"

import { google } from "googleapis"
import { prisma } from "@/lib/prisma"

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

        const folderStats = await Promise.all(folders.map(async (folder) => {
            const folderName = folder.name || "Desconocido"
            const audits = await prisma.shipmentAudit.findMany({
                where: { envioId: folderName },
                select: { status: true }
            })

            const mlaCountRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id)'
            })
            const realTotal = mlaCountRes.data.files?.length || 0

            return {
                id: folder.id,
                name: folder.name,
                createdTime: folder.createdTime,
                stats: {
                    total: realTotal,
                    aprobados: audits.filter(a => a.status === 'APROBADO').length,
                    rechazados: audits.filter(a => a.status === 'RECHAZADO').length,
                }
            }
        }))

        return { success: true, folders: folderStats }
    } catch (error: any) {
        console.error("Error folders:", error)
        return { success: false, error: error.message }
    }
}

export async function getAuditPendingItems(selectedEnvioName?: string) {
    try {
        const drive = getDriveClient()
        let envioId = selectedEnvioName || ""

        // 1. Buscar la carpeta del envío
        const query = `'${DRIVE_PARENT_FOLDER_ID}' in parents and name = '${envioId}' and trashed=false`
        const envioFolderRes = await drive.files.list({ q: query, fields: 'files(id, name)', pageSize: 1 })

        if (!envioFolderRes.data.files?.length) return { success: false, error: "No se encontró la carpeta" }

        const envioFolderId = envioFolderRes.data.files[0].id!

        // 2. Traer datos de la DB y Auditorías en paralelo (Optimización de DB)
        const [dbShipment, auditedItems] = await Promise.all([
            prisma.shipment.findUnique({
                where: { name: envioId },
                include: { items: true }
            }),
            prisma.shipmentAudit.findMany({
                where: { envioId: envioId },
                select: { itemId: true, status: true }
            })
        ])

        const dbItemsMap = new Map()
        dbShipment?.items.forEach(item => {
            dbItemsMap.set(item.itemId, item)
        })

        const statusMap = new Map<string, string>()
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status))

        // 3. Listar subcarpetas (MLAs)
        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 500
        })

        const mlaFolders = mlaFoldersRes.data.files || []

        // 👇 LA MAGIA ESTÁ AQUÍ: Usamos Promise.all para disparar todas las búsquedas de fotos a la vez
        const allItems = await Promise.all(mlaFolders.map(async (f) => {
            const mlaId = (f.name || "").split(' ')[0].trim()
            
            // Buscamos imágenes dentro de esta carpeta específica
            const imgs = await drive.files.list({ 
                q: `'${f.id}' in parents and mimeType contains 'image/' and trashed=false`, 
                fields: 'files(id)' 
            })
            
            if (imgs.data.files && imgs.data.files.length > 0) {
                const evidence = imgs.data.files.map(img => getPublicThumbnailLink(img.id!))
                const dbInfo = dbItemsMap.get(mlaId)
                
                return {
                    itemId: mlaId,
                    driveName: f.name || "Sin nombre", 
                    title: dbInfo?.title || f.name || "Sin nombre",
                    sku: dbInfo?.sku || "Sin SKU",
                    quantity: dbInfo?.quantity || 0,
                    // 👇 Recuperamos los AGREGADOS que guardamos en la planificación
                    agregados: dbInfo?.agregados ? dbInfo.agregados.split(", ") : [],
                    referenceImageUrl: null,
                    evidenceImageUrl: evidence[0],
                    evidenceImages: evidence,
                    status: (statusMap.get(mlaId) || 'PENDIENTE') as 'PENDIENTE' | 'APROBADO' | 'RECHAZADO',
                    envioId: envioId
                }
            }
            return null // Si no tiene fotos, retornamos null
        }))

        // Filtramos los nulos (carpetas sin fotos) y retornamos
        return { 
            success: true, 
            data: allItems.filter(item => item !== null), 
            envioId 
        }

    } catch (error: any) {
        console.error("Error items:", error)
        return { success: false, error: error.message }
    }
}

export async function auditItem(itemId: string, status: string, envioId: string) {
    try {
        await prisma.shipmentAudit.upsert({
            where: { itemId_envioId: { itemId, envioId } },
            update: { status },
            create: { itemId, envioId, status, auditor: "Admin" }
        })
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
