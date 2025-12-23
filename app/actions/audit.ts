"use server"

import { google } from "googleapis"
import axios from "axios"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

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

// app/actions/audit.ts

export async function getAuditPendingItems(selectedEnvioName?: string) {
    try {
        const drive = getDriveClient()
        let envioId = selectedEnvioName || ""

        const query = `'${DRIVE_PARENT_FOLDER_ID}' in parents and name = '${envioId}' and trashed=false`
        const envioFolderRes = await drive.files.list({ q: query, fields: 'files(id, name)', pageSize: 1 })

        if (!envioFolderRes.data.files?.length) return { success: false, error: "No se encontró la carpeta" }

        const envioFolderId = envioFolderRes.data.files[0].id!

        const dbShipment = await prisma.shipment.findUnique({
            where: { name: envioId },
            include: { items: true }
        })

        // 1. Le decimos a TypeScript que este mapa guarda números
        const quantityMap = new Map<string, number>()
        dbShipment?.items.forEach(item => quantityMap.set(item.itemId, item.quantity))

        // 2. Le decimos a TypeScript que este mapa guarda textos
        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true, status: true }
        })
        const statusMap = new Map<string, string>()
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status))

        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 500
        })

        const allItems = []
        for (const f of mlaFoldersRes.data.files || []) {
            const mlaId = (f.name || "").split(' ')[0].trim()
            const imgs = await drive.files.list({ q: `'${f.id}' in parents and mimeType contains 'image/'`, fields: 'files(id)' })
            
            if (imgs.data.files?.length) {
                const evidence = imgs.data.files.map(img => getPublicThumbnailLink(img.id!))
                
                // 3. Aseguramos que driveName y title NUNCA sean null usando || ""
                allItems.push({
                    itemId: mlaId,
                    driveName: f.name || "Sin nombre", 
                    title: f.name || "Sin nombre",
                    sku: "S/D",
                    quantity: quantityMap.get(mlaId) || 0,
                    agregados: [],
                    referenceImageUrl: null,
                    evidenceImageUrl: evidence[0],
                    evidenceImages: evidence,
                    status: (statusMap.get(mlaId) || 'PENDIENTE') as 'PENDIENTE' | 'APROBADO' | 'RECHAZADO',
                    envioId: envioId
                })
            }
        }
        return { success: true, data: allItems, envioId }
    } catch (error: any) {
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
