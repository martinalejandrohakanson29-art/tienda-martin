// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const BUCKET_URL = "https://storage.railway.app";

export async function getShipmentFolders() {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: 'auditoria/',
            Delimiter: '/'
        });

        const response = await s3Client.send(command);
        const prefixes = response.CommonPrefixes || [];

        const folderStats = await Promise.all(prefixes.map(async (p) => {
            const fullPath = p.Prefix || "";
            // Extrae el ID del envío (ej: cmkyf32pr0002ohyje87i2e6l)
            const folderId = fullPath.split('/').filter(Boolean).pop() || "Desconocido";

            // Buscamos el nombre real del envío en la DB para que la UI se vea bien
            const shipmentDb = await prisma.shipment.findUnique({
                where: { id: folderId },
                select: { name: true }
            });

            const audits = await prisma.shipmentAudit.findMany({
                where: { envioId: folderId },
                select: { status: true }
            });

            const itemsCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: fullPath
            });
            const itemsRes = await s3Client.send(itemsCommand);
            
            const uniqueItems = new Set();
            itemsRes.Contents?.forEach(obj => {
                const fileName = obj.Key?.split('/').pop() || "";
                const itemId = fileName.split('_')[0]; 
                if (itemId) uniqueItems.add(itemId);
            });

            return {
                id: folderId,
                name: shipmentDb?.name || folderId, // Mostramos el nombre (ej: "Envío 28-01") si existe
                stats: {
                    total: uniqueItems.size,
                    aprobados: audits.filter(a => a.status === 'APROBADO').length,
                    rechazados: audits.filter(a => a.status === 'RECHAZADO').length,
                }
            };
        }));

        return { success: true, folders: folderStats };
    } catch (error: any) {
        console.error("Error folders:", error);
        return { success: false, error: error.message };
    }
}

export async function getAuditPendingItems(envioId: string) {
    try {
        const prefix = `auditoria/${envioId}/`;
        
        // --- CORRECCIÓN CLAVE: Buscamos por ID, no por Name ---
        const [dbShipment, auditedItems] = await Promise.all([
            prisma.shipment.findUnique({
                where: { id: envioId }, // Usamos el ID que viene de la carpeta
                include: { items: true }
            }),
            prisma.shipmentAudit.findMany({
                where: { envioId: envioId },
                select: { itemId: true, status: true }
            })
        ]);

        const dbItemsMap = new Map();
        dbShipment?.items.forEach(item => dbItemsMap.set(item.itemId, item));

        const statusMap = new Map();
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status));

        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const s3Res = await s3Client.send(command);
        const files = s3Res.Contents || [];

        const itemsGrouped = new Map<string, string[]>();
        files.forEach(file => {
            const fileName = file.Key?.split('/').pop() || "";
            const itemId = fileName.split('_')[0];
            if (itemId) {
                // Generamos la URL pública
                const url = `${BUCKET_URL}/${BUCKET_NAME}/${file.Key}`;
                const existing = itemsGrouped.get(itemId) || [];
                itemsGrouped.set(itemId, [...existing, url]);
            }
        });

        const allItems = Array.from(itemsGrouped.keys()).map(itemId => {
            const evidence = itemsGrouped.get(itemId) || [];
            const dbInfo = dbItemsMap.get(itemId);
            
            return {
                itemId: itemId,
                driveName: itemId, 
                title: dbInfo?.title || "Producto " + itemId,
                sku: dbInfo?.sku || "Sin SKU", // Ahora sí debería traer el SKU real
                quantity: dbInfo?.quantity || 0,
                agregados: dbInfo?.agregados ? dbInfo.agregados.split(", ") : [],
                referenceImageUrl: dbInfo?.imageUrl || null,
                evidenceImageUrl: evidence[0],
                evidenceImages: evidence,
                status: (statusMap.get(itemId) || 'PENDIENTE'),
                envioId: envioId
            };
        });

        return { success: true, data: allItems, envioId };
    } catch (error: any) {
        console.error("Error items:", error);
        return { success: false, error: error.message };
    }
}

export async function auditItem(itemId: string, status: string, envioId: string) {
    try {
        await prisma.shipmentAudit.upsert({
            where: { itemId_envioId: { itemId, envioId } },
            update: { status },
            create: { itemId, envioId, status, auditor: "Admin" }
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
