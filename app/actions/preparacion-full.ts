"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand } from "@aws-sdk/client-s3"

const BUCKET_NAME = process.env.S3_BUCKET_NAME

export async function subirFotoAuditoriaFull(formData: FormData) {
    const file = formData.get('photo') as File
    const shipmentId = formData.get('envioId') as string
    const itemId = formData.get('itemId') as string 
    const mla = formData.get('mla') as string      

    try {
        if (!file || !shipmentId || !itemId) {
            throw new Error("Faltan datos obligatorios para la auditoría.");
        }

        // 1. Subida a S3 (carpeta dedicada)
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `auditoria-full/${shipmentId}/${mla}_${Date.now()}.jpg`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        }));

        // 2. Registro en la nueva tabla exclusiva
        await prisma.shipmentAuditFull.upsert({
            where: {
                itemId_shipmentId: {
                    itemId: itemId,
                    shipmentId: shipmentId
                }
            },
            update: {
                photoUrl: fileName,
                createdAt: new Date()
            },
            create: {
                itemId: itemId,
                shipmentId: shipmentId,
                photoUrl: fileName,
                status: "FOTO_CARGADA"
            }
        });

        revalidatePath('/admin/mercadolibre/full/preparacion');
        return { success: true, path: fileName };

    } catch (error: any) {
        console.error("[ERROR AUDITORIA FULL]", error);
        return { success: false, error: error.message };
    }
}
