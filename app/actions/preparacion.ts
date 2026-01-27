// app/actions/preparacion.ts
"use server"

import { prisma } from "@/lib/prisma"
import { google } from 'googleapis'
import { revalidatePath } from "next/cache"
import { Readable } from 'stream'

// ID de carpeta raíz: Preparacion_colecta
const DRIVE_PARENT_FOLDER_ID = '1ZSoopV-LYzweqNejotZO1h6o2j6wbPld'

async function getDriveClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return google.drive({ version: 'v3', auth })
}

/**
 * Función auxiliar para buscar o crear una carpeta en Drive
 */
async function getOrCreateFolder(drive: any, name: string, parentId: string) {
    const response = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id)'
    });

    if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
    }

    const newFolder = await drive.files.create({
        requestBody: {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        },
        fields: 'id'
    });

    return newFolder.data.id;
}

/**
 * Obtiene las URLs de las miniaturas/fotos de una carpeta de envío
 */
export async function obtenerFotosEnvio(envioId: string) {
    try {
        const drive = await getDriveClient();
        
        // RECUPERADO: Buscamos primero la carpeta del envío
        const folderSearch = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${envioId}' and trashed=false`,
            fields: 'files(id)'
        });

        if (!folderSearch.data.files || folderSearch.data.files.length === 0) {
            return { success: true, fotos: [] };
        }

        const folderId = folderSearch.data.files[0].id;

        // Ahora sí buscamos los archivos DENTRO de esa carpeta (folderId)
        const filesSearch = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, webViewLink, thumbnailLink)',
            orderBy: 'createdTime desc'
        });

        // CORRECCIÓN APLICADA PARA VISUALIZACIÓN
        const fotos = filesSearch.data.files?.map(f => {
            // Truco: Reemplazamos el parámetro de tamaño (=s220) por =s0 para obtener la imagen full resolución
            const highResUrl = f.thumbnailLink 
                ? f.thumbnailLink.replace(/=s\d+$/, "=s0") 
                : f.webViewLink;

            return {
                id: f.id,
                name: f.name,
                url: highResUrl, 
                link: f.webViewLink
            };
        }) || [];

        return { success: true, fotos };
    } catch (error: any) {
        console.error("Error al obtener fotos:", error);
        return { success: false, fotos: [] };
    }
}

export async function aprobarPedido(envioId: string) {
    try {
        await prisma.$transaction([
            prisma.etiquetaML.update({
                where: { id: envioId },
                data: { status: "AUDITADO" }
            }),
            prisma.shipmentAudit.updateMany({
                where: { envioId: envioId },
                data: { status: "AUDITADO" }
            })
        ])

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true }
    } catch (error: any) {
        console.error("Error al aprobar:", error)
        return { success: false, error: error.message }
    }
}

/**
 * NUEVA ACCIÓN: Rechazar pedido
 * Devuelve el envío a estado PENDIENTE para volver a sacar fotos
 */
export async function rechazarPedido(envioId: string) {
    try {
        await prisma.$transaction([
            prisma.etiquetaML.update({
                where: { id: envioId },
                data: { status: "PENDIENTE" }
            }),
            prisma.shipmentAudit.updateMany({
                where: { envioId: envioId },
                data: { status: "PENDIENTE" }
            })
        ])

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true }
    } catch (error: any) {
        console.error("Error al rechazar:", error)
        return { success: false, error: error.message }
    }
}

export async function subirFotoAuditoria(formData: FormData) {
    try {
        const file = formData.get('photo') as File
        const envioId = formData.get('envioId') as string
        const mla = formData.get('mla') as string

        if (!file || !envioId || !mla) {
            throw new Error("Faltan datos obligatorios")
        }

        const drive = await getDriveClient()
        const hoy = new Date();
        const diaMes = hoy.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

        const dateFolderId = await getOrCreateFolder(drive, diaMes, DRIVE_PARENT_FOLDER_ID);
        const envioFolderId = await getOrCreateFolder(drive, envioId, dateFolderId);

        const buffer = Buffer.from(await file.arrayBuffer())
        const fileMetadata = { name: `${mla}_${Date.now()}.jpg`, parents: [envioFolderId] }
        const media = { mimeType: 'image/jpeg', body: Readable.from(buffer) }
        
        const driveFile = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        })

        // LÓGICA CORREGIDA PARA AUDITORÍA MANUAL
        await prisma.$transaction(async (tx) => {
            // 1. Ponemos el item en estado "FOTO_CARGADA" (paso previo al OK final)
            await tx.shipmentAudit.upsert({
                where: { itemId_envioId: { itemId: mla, envioId: envioId } },
                update: { status: "FOTO_CARGADA", createdAt: new Date() },
                create: { itemId: mla, envioId: envioId, status: "FOTO_CARGADA" }
            });

            const totalItems = await tx.etiquetaMLItem.count({ where: { etiquetaId: envioId } });
            const fotosCargadas = await tx.shipmentAudit.count({
                where: { envioId: envioId, status: "FOTO_CARGADA" }
            });

            // 2. Si todos los items tienen foto, el paquete está listo para tu revisión manual
            if (fotosCargadas >= totalItems) {
                await tx.etiquetaML.update({
                    where: { id: envioId },
                    data: { 
                        status: "PREPARADO",
                        drivePhotoUrl: driveFile.data.webViewLink 
                    }
                });
            }
        });

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, link: driveFile.data.webViewLink }
    } catch (error: any) {
        console.error("Error en auditoría:", error)
        return { success: false, error: error.message }
    }
}
