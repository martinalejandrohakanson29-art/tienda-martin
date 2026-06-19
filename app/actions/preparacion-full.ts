"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { triggerNotification, linkAuditFull } from "@/lib/notify"

const BUCKET_NAME = process.env.S3_BUCKET_NAME

export async function guardarAuditoriaFull(formData: FormData) {
    const file = formData.get('photo') as File
    const shipmentId = formData.get('envioId') as string
    const itemId = formData.get('itemId') as string
    const mla = formData.get('mla') as string

    // Identificamos (de forma blanda) quién carga la foto, sin bloquear la subida si falla.
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id as string | undefined;
    const username = session?.user?.name as string | undefined;

    try {
        if (!file || !shipmentId || !itemId) {
            throw new Error("Faltan datos obligatorios.");
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `auditoria-full/${shipmentId}/${itemId}_${Date.now()}.jpg`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        }));

        // Detectamos si es la primera foto de este ítem (para notificar una sola vez
        // y no repetir la alerta al re-subir la foto del mismo producto).
        const registroPrevio = await prisma.auditoriaPreparacionFull.findUnique({
            where: { shipmentId_itemId: { shipmentId, itemId } },
            select: { shipmentId: true },
        });
        const esPrimeraFoto = !registroPrevio;

        await prisma.auditoriaPreparacionFull.upsert({
            where: {
                shipmentId_itemId: {
                    shipmentId: shipmentId,
                    itemId: itemId
                }
            },
            update: {
                photoUrl: fileName,
                createdAt: new Date()
            },
            create: {
                shipmentId: shipmentId,
                itemId: itemId,
                photoUrl: fileName,
                status: "PREPARADO"
            }
        });

        revalidatePath('/admin/mercadolibre/full/preparacion');

        // Notificación: avisamos a los usuarios habilitados que se preparó un ítem del
        // envío Full. Solo en la primera foto del ítem para evitar avisos repetidos.
        if (esPrimeraFoto) {
            const envio = await prisma.shipment.findUnique({
                where: { id: shipmentId },
                select: { name: true },
            }).catch(() => null);
            const envioNombre = envio?.name ?? shipmentId;
            const producto = mla || "un producto";

            await triggerNotification({
                eventType: "PEDIDO_PREPARADO_FULL",
                sourceUserId: userId,
                title: `Pedido preparado Full — ${envioNombre}`,
                body: `${username ? `${username} preparó` : "Se preparó"} "${producto}" del envío Full ${envioNombre}`,
                link: linkAuditFull(shipmentId, itemId),
            });
        }

        return { success: true, path: fileName };

    } catch (error: any) {
        console.error("[ERROR PREPARACION FULL]", error);
        return { success: false, error: error.message };
    }
}
