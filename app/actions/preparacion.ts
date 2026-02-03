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

/** * ACCIÓN CORREGIDA: Usa itemId único para evitar colisiones en pedidos multi-item
 */
export async function subirFotoAuditoria(formData: FormData) {
    const file = formData.get('photo') as File
    const envioId = formData.get('envioId') as string
    const itemId = formData.get('itemId') as string // ID único del registro del ítem (EtiquetaMLItem)
    const mla = formData.get('mla') as string      // Mantenemos el MLA para el nombre del archivo

    console.log(`[AUDITORIA] Iniciando subida: Envio ${envioId}, Item ${itemId}, File: ${file?.name}`);

    try {
        if (!file || !envioId || !itemId || !mla) {
            console.error("[AUDITORIA] Faltan datos obligatorios en el FormData");
            throw new Error("Faltan datos obligatorios para la subida.");
        }

        // 1. Preparar el archivo para S3
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `auditoria/${envioId}/${mla}_${Date.now()}.jpg`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        });

        await s3Client.send(command);

        // 2. Lógica de Base de Datos con Transacción
        await prisma.$transaction(async (tx) => {
            // A. Registrar auditoría usando el itemId único del producto en la etiqueta
            // Esto evita que variaciones del mismo MLA colisionen
            await tx.shipmentAudit.upsert({
                where: { itemId_envioId: { itemId: itemId, envioId: envioId } },
                update: { status: "FOTO_CARGADA", createdAt: new Date() },
                create: { itemId: itemId, envioId: envioId, status: "FOTO_CARGADA" }
            });

            // B. Contar el progreso real del pedido
            const totalItems = await tx.etiquetaMLItem.count({ where: { etiquetaId: envioId } });
            const fotosCargadas = await tx.shipmentAudit.count({
                where: { envioId: envioId, status: "FOTO_CARGADA" }
            });

            console.log(`[DB] Progreso Pedido ${envioId}: ${fotosCargadas}/${totalItems}`);

            // C. Si todos los productos tienen su foto, marcar el pedido global como PREPARADO
            if (fotosCargadas >= totalItems) {
                await tx.etiquetaML.update({
                    where: { id: envioId },
                    data: { 
                        status: "PREPARADO",
                        drivePhotoUrl: fileName // Referencia a la última foto cargada
                    }
                });
            }
        });

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, path: fileName }

    } catch (error: any) {
        console.error("[AUDITORIA ERROR SERVIDOR]", error);
        return { 
            success: false, 
            error: error.message || "Error al procesar la subida" 
        };
    }
}
