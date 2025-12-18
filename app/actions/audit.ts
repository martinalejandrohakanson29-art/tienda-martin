"use server"

import { google } from "googleapis"
import axios from "axios"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

// --- CONFIGURACIÓN CORREGIDA ---
// 1. Usamos la URL de EXPORTACIÓN con el ID y GID correctos.
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

        // 2. Traer datos del Sheet (LÓGICA NUEVA)
        let sheetMap = new Map()
        try {
            console.log("Descargando CSV desde:", GOOGLE_SHEET_CSV_URL)
            const response = await axios.get(GOOGLE_SHEET_CSV_URL)
            const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true })
            const sheetData = parsed.data as any[]
            
            sheetData.forEach(row => {
                // A. MATCHEAR POR "ITEM ID" (Columna A)
                const itemId = row['ITEM ID']
                
                if (itemId) {
                    // B. CONCATENAR LOS 4 AGREGADOS
                    // Filtramos los que estén vacíos y los unimos con un " + "
                    const listaAgregados = [
                        row['AGREGADO 1'],
                        row['AGREGADO 2'],
                        row['AGREGADO 3'],
                        row['AGREGADO 4']
                    ].filter(texto => texto && texto.trim() !== "").join(" + ")

                    sheetMap.set(itemId.trim(), {
                        title: row['Nombre'] || row['Titulo'] || 'Producto sin nombre',
                        sku: row['SKU'] || '',
                        agregados: listaAgregados || null // Si queda vacío, pasamos null
                    })
                }
            })
            console.log(`Sheet procesado correctamente. ${sheetMap.size} items indexados.`)
        } catch (e) {
            console.warn("Error leyendo Sheet:", e)
        }

        // 3. Filtrar lo que ya auditamos
        const auditedItems = await prisma.shipmentAudit.findMany({
            where: { envioId: envioId },
            select: { itemId: true }
        })
        const auditedSet = new Set(auditedItems.map(i => i.itemId))

        // 4. Listar carpetas REALES en Drive (La verdad del operario)
        const mlaFoldersRes = await drive.files.list({
            q: `'${envioFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000
        })

        const mlaFolders = mlaFoldersRes.data.files || []
        const pendingItems = []

        for (const folder of mlaFolders) {
            const folderName = folder.name || ""
            // Extraemos el ID (asumiendo formato "MLA12345 - Titulo")
            const mlaId = folderName.split(' ')[0].trim() 

            if (auditedSet.has(mlaId)) continue

            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id)',
                pageSize: 1
            })

            if (filesRes.data.files?.length) {
                const file = filesRes.data.files[0]
                const meta = sheetMap.get(mlaId) || {} // Cruzamos datos con el Sheet

                pendingItems.push({
                    itemId: mlaId,
                    title: meta.title || folderName,
                    sku: meta.sku || 'S/D',
                    agregados: meta.agregados || null, // Aquí viaja la cadena "Mate + Bombilla + Yerba"
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

// ... (La función auditItem queda igual)
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
