// app/actions/preparacion.ts
"use server"

import { prisma } from "@/lib/prisma"
import { google } from 'googleapis'
import { revalidatePath } from "next/cache"

// Configuración de Google Drive (asegúrate de tener estas variables en Railway)
const DRIVE_PARENT_FOLDER_ID = '1v-E638QF0AaPr7zywfH2luZvnHXtJujp' // ID de tu carpeta raíz

async function getDriveClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return google.drive({ version: 'v3', auth })
}

export async function subirFotoAuditoria(formData: FormData) {
    try {
        const file = formData.get('photo') as File
        const envioId = formData.get('envioId') as string
        const mla = formData.get('mla') as string
        const resumen = formData.get('resumen') as string

        if (!file || !envioId) throw new Error("Faltan datos obligatorios")

        const drive = await getDriveClient()
        
        // 1. Crear/Encontrar carpeta del Envío
        const folderName = envioId.replace(/[^a-zA-Z0-9]/g, '_')
        let folderId = ""
        
        const folderExist = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${DRIVE_PARENT_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id)'
        })

        if (folderExist.data.files && folderExist.data.files.length > 0) {
            folderId = folderExist.data.files[0].id!
        } else {
            const newFolder = await drive.files.create({
                requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_PARENT_FOLDER_ID] },
                fields: 'id'
            })
            folderId = newFolder.data.id!
        }

        // 2. Subir archivo
        const buffer = Buffer.from(await file.arrayBuffer())
        const fileMetadata = { name: `${mla}_${Date.now()}.jpg`, parents: [folderId] }
        const media = { mimeType: 'image/jpeg', body: require('stream').Readable.from(buffer) }
        
        const driveFile = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        })

        // 3. Registrar en Auditoría y Actualizar Etiqueta
        await prisma.$transaction([
            prisma.shipmentAudit.upsert({
                where: { itemId_envioId: { itemId: mla, envioId: envioId } },
                update: { status: "AUDITADO", createdAt: new Date() },
                create: { itemId: mla, envioId: envioId, status: "AUDITADO" }
            }),
            prisma.etiquetaML.update({
                where: { id: envioId },
                data: { 
                    status: "PREPARADO",
                    drivePhotoUrl: driveFile.data.webViewLink 
                }
            })
        ])

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, link: driveFile.data.webViewLink }
    } catch (error: any) {
        console.error("Error en auditoría:", error)
        return { success: false, error: error.message }
    }
}
