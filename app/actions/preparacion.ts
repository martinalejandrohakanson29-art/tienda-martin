// app/actions/preparacion.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const BUCKET_NAME = process.env.S3_BUCKET_NAME

export async function obtenerFotosEnvio(envioId: string) {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `auditoria/${envioId}/`,
        });

        const { Contents } = await s3Client.send(command);
        if (!Contents || Contents.length === 0) return { success: true, fotos: [] };

        const fotos = await Promise.all(Contents.map(async (file) => {
            const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key });
            const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
            return {
                id: file.Key,
                name: file.Key?.split('/').pop() || 'Foto',
                url: signedUrl, 
                link: signedUrl
            };
        }));
        return { success: true, fotos };
    } catch (error: any) {
        console.error("Error al obtener fotos de S3:", error);
        return { success: false, fotos: [] };
    }
}

export async function aprobarPedido(envioId: string) {
    try {
        await prisma.$transaction([
            prisma.etiquetaML.update({ where: { id: envioId }, data: { status: "AUDITADO" } }),
            prisma.shipmentAudit.updateMany({ where: { envioId: envioId }, data: { status: "AUDITADO" } })
        ])
        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true }
    } catch (error: any) {
        console.error("Error al aprobar:", error)
        return { success: false, error: error.message }
    }
}

export async function rechazarPedido(envioId: string) {
    try {
        await prisma.$transaction([
            prisma.etiquetaML.update({ where: { id: envioId }, data: { status: "PENDIENTE" } }),
            prisma.shipmentAudit.updateMany({ where: { envioId: envioId }, data: { status: "PENDIENTE" } })
        ])
        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true }
    } catch (error: any) {
        console.error("Error al rechazar:", error)
        return { success: false, error: error.message }
    }
}

/** * ACCIÓN CORREGIDA PARA INVESTIGACIÓN
 */
export async function subirFotoAuditoria(formData: FormData) {
    const file = formData.get('photo') as File
    const envioId = formData.get('envioId') as string
    const mla = formData.get('mla') as string

    // LOG DE INICIO
    console.log(`[AUDITORIA] Iniciando subida: Envio ${envioId}, MLA ${mla}, File: ${file?.name} (${file?.size} bytes)`);

    try {
        if (!file || !envioId || !mla) {
            console.error("[AUDITORIA] Faltan datos obligatorios en el FormData");
            throw new Error("Faltan datos obligatorios para la subida.");
        }

        // 1. Preparar el archivo
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `auditoria/${envioId}/${mla}_${Date.now()}.jpg`;

        // 2. Subir a S3 con log de confirmación
        console.log(`[S3] Intentando subir a S3: ${fileName}...`);
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        });

        await s3Client.send(command);
        console.log(`[S3] Subida exitosa a S3: ${fileName}`);

        // 3. Lógica de Base de Datos
        console.log(`[DB] Actualizando base de datos para Envio ${envioId}...`);
        await prisma.$transaction(async (tx) => {
            // A. Registrar auditoría del item
            await tx.shipmentAudit.upsert({
                where: { itemId_envioId: { itemId: mla, envioId: envioId } },
                update: { status: "FOTO_CARGADA", createdAt: new Date() },
                create: { itemId: mla, envioId: envioId, status: "FOTO_CARGADA" }
            });

            const totalItems = await tx.etiquetaMLItem.count({ where: { etiquetaId: envioId } });
            const fotosCargadas = await tx.shipmentAudit.count({
                where: { envioId: envioId, status: "FOTO_CARGADA" }
            });

            console.log(`[DB] Progreso: ${fotosCargadas}/${totalItems} fotos cargadas.`);

            // B. Si está completo, marcar pedido
            if (fotosCargadas >= totalItems) {
                await tx.etiquetaML.update({
                    where: { id: envioId },
                    data: { 
                        status: "PREPARADO",
                        drivePhotoUrl: fileName 
                    }
                });
                console.log(`[DB] Pedido ${envioId} marcado como PREPARADO.`);
            }
        });

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, path: fileName }

    } catch (error: any) {
        // LOG DE ERROR CRÍTICO
        console.error("[AUDITORIA ERROR]", error);
        return { 
            success: false, 
            error: error.message || "Error desconocido en el servidor" 
        };
    }
}
