// app/actions/preparacion.ts
"use server"

import { prisma } from "@/lib/prisma"
import { google } from 'googleapis'
import { revalidatePath } from "next/cache"

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



// app/actions/preparacion.ts (Añadir al final)

/**
 * Obtiene las URLs de las miniaturas/fotos de una carpeta de envío
 */
export async function obtenerFotosEnvio(envioId: string) {
    try {
        const drive = await getDriveClient();
        
        // 1. Buscamos la carpeta del envío por nombre
        const folderSearch = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${envioId}' and trashed=false`,
            fields: 'files(id)'
        });

        if (!folderSearch.data.files || folderSearch.data.files.length === 0) {
            return { success: true, fotos: [] };
        }

        const folderId = folderSearch.data.files[0].id;

        // 2. Listamos los archivos dentro de esa carpeta
        const filesSearch = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, webViewLink, thumbnailLink)',
            orderBy: 'createdTime desc'
        });

        // Transformamos los links para que sean visibles directamente como imágenes
        const fotos = filesSearch.data.files?.map(f => ({
            id: f.id,
            name: f.name,
            // Usamos el thumbnail en alta resolución o el link de vista previa
            url: `https://lh3.googleusercontent.com/u/0/d/${f.id}=s1000`,
            link: f.webViewLink
        })) || [];

        return { success: true, fotos };
    } catch (error: any) {
        console.error("Error al obtener fotos:", error);
        return { success: false, fotos: [] };
    }
}


// app/actions/preparacion.ts (Añadir al final)
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

export async function subirFotoAuditoria(formData: FormData) {
    try {
        const file = formData.get('photo') as File
        const envioId = formData.get('envioId') as string
        const mla = formData.get('mla') as string

        if (!file || !envioId) throw new Error("Faltan datos obligatorios")

        const drive = await getDriveClient()
        
        // 1. Obtener la fecha actual (DD/MM)
        const hoy = new Date();
        const diaMes = hoy.toLocaleDateString('es-AR', { 
            day: '2-digit', 
            month: '2-digit' 
        });

        // 2. Crear estructura: Raíz -> Fecha -> ID_Envio
        const dateFolderId = await getOrCreateFolder(drive, diaMes, DRIVE_PARENT_FOLDER_ID);
        const envioFolderId = await getOrCreateFolder(drive, envioId, dateFolderId);

        // 3. Subir archivo directamente a la carpeta del Envío
        const buffer = Buffer.from(await file.arrayBuffer())
        const fileMetadata = { 
            name: `${mla}_${Date.now()}.jpg`, 
            parents: [envioFolderId] 
        }
        const media = { 
            mimeType: 'image/jpeg', 
            body: require('stream').Readable.from(buffer) 
        }
        
        const driveFile = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        })

        // 4. Actualizar base de datos
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
