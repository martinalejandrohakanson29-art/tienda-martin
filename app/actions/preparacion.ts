// app/actions/preparacion.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { s3Client } from "@/lib/s3" // Usamos tu cliente ya configurado
import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Nombre del bucket desde variables de entorno
const BUCKET_NAME = process.env.S3_BUCKET_NAME

/**
 * Obtiene las fotos de un envío desde S3
 * Genera URLs firmadas (seguras) que expiran en 1 hora
 */
export async function obtenerFotosEnvio(envioId: string) {
    try {
        // 1. Listar objetos en la carpeta del envío
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `auditoria/${envioId}/`, // Filtramos por la carpeta del envío
        });

        const { Contents } = await s3Client.send(command);

        if (!Contents || Contents.length === 0) {
            return { success: true, fotos: [] };
        }

        // 2. Generar URLs firmadas para cada foto encontrada
        const fotos = await Promise.all(Contents.map(async (file) => {
            const getCommand = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: file.Key,
            });
            
            // La URL será válida por 3600 segundos (1 hora)
            const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

            return {
                id: file.Key, // Usamos el Key como ID
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

export async function rechazarPedido(envioId: string) {
    try {
        await prisma.$transaction([
            prisma.etiquetaML.update({
                where: { id: envioId },
                data: { status: "PENDIENTE" } // Vuelve a pendiente para sacar fotos de nuevo
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

        // 1. Preparar el archivo para S3
        const buffer = Buffer.from(await file.arrayBuffer());
        
        // Estructura: auditoria/ID_ENVIO/MLA_TIMESTAMP.jpg
        const fileName = `auditoria/${envioId}/${mla}_${Date.now()}.jpg`;

        // 2. Subir a S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        });

        await s3Client.send(command);

        // 3. Lógica de Base de Datos (idéntica a la original, pero guardamos el Key de S3)
        await prisma.$transaction(async (tx) => {
            // A. Registrar que este item ya tiene foto
            await tx.shipmentAudit.upsert({
                where: { itemId_envioId: { itemId: mla, envioId: envioId } },
                update: { status: "FOTO_CARGADA", createdAt: new Date() },
                create: { itemId: mla, envioId: envioId, status: "FOTO_CARGADA" }
            });

            const totalItems = await tx.etiquetaMLItem.count({ where: { etiquetaId: envioId } });
            const fotosCargadas = await tx.shipmentAudit.count({
                where: { envioId: envioId, status: "FOTO_CARGADA" }
            });

            // B. Si todos los items tienen foto, marcamos el pedido completo
            if (fotosCargadas >= totalItems) {
                await tx.etiquetaML.update({
                    where: { id: envioId },
                    data: { 
                        status: "PREPARADO",
                        drivePhotoUrl: fileName // Guardamos la ruta S3 (Key) en lugar del link de Drive
                    }
                });
            }
        });

        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, path: fileName }
    } catch (error: any) {
        console.error("Error en auditoría S3:", error)
        return { success: false, error: error.message }
    }
}
