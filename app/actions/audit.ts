// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const BUCKET_URL = "https://storage.railway.app";

/**
 * Obtiene la lista de "carpetas" (envíos) desde el Bucket
 */
export async function getShipmentFolders() {
    try {
        // Listamos los objetos con prefijo auditoria/ y usamos '/' como delimitador 
        // para obtener los nombres de los envíos como "carpetas"
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: 'auditoria/',
            Delimiter: '/'
        });

        const response = await s3Client.send(command);
        
        // Los CommonPrefixes son nuestras "carpetas" de envío (ej: auditoria/ENVIO123/)
        const prefixes = response.CommonPrefixes || [];

        const folderStats = await Promise.all(prefixes.map(async (p) => {
            const fullPath = p.Prefix || "";
            // Extraemos solo el ID del envío: "auditoria/123/" -> "123"
            const folderName = fullPath.split('/')[1];

            const audits = await prisma.shipmentAudit.findMany({
                where: { envioId: folderName },
                select: { status: true }
            });

            // Contamos cuántos productos únicos hay en esa carpeta del bucket
            const itemsCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: fullPath
            });
            const itemsRes = await s3Client.send(itemsCommand);
            
            // Agrupamos por el ID del item (MLA) que está antes del guion bajo en el nombre
            const uniqueItems = new Set();
            itemsRes.Contents?.forEach(obj => {
                const fileName = obj.Key?.split('/').pop() || "";
                const itemId = fileName.split('_')[0];
                if (itemId) uniqueItems.add(itemId);
            });

            return {
                id: folderName,
                name: folderName,
                stats: {
                    total: uniqueItems.size,
                    aprobados: audits.filter(a => a.status === 'APROBADO').length,
                    rechazados: audits.filter(a => a.status === 'RECHAZADO').length,
                }
            };
        }));

        return { success: true, folders: folderStats };
    } catch (error: any) {
        console.error("Error folders (Bucket):", error);
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene los items y sus fotos del Bucket para un envío específico
 */
export async function getAuditPendingItems(envioId: string) {
    try {
        const prefix = `auditoria/${envioId}/`;
        
        // 1. Traer datos de la DB
        const [dbShipment, auditedItems] = await Promise.all([
            prisma.shipment.findUnique({
                where: { name: envioId },
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

        // 2. Listar todos los archivos en esa carpeta del bucket
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const s3Res = await s3Client.send(command);
        const files = s3Res.Contents || [];

        // 3. Agrupar fotos por ItemId (MLA)
        const itemsGrouped = new Map<string, string[]>();
        files.forEach(file => {
            const fileName = file.Key?.split('/').pop() || "";
            const itemId = fileName.split('_')[0];
            if (itemId) {
                const url = `${BUCKET_URL}/${BUCKET_NAME}/${file.Key}`;
                const existing = itemsGrouped.get(itemId) || [];
                itemsGrouped.set(itemId, [...existing, url]);
            }
        });

        // 4. Formatear para la UI
        const allItems = Array.from(itemsGrouped.keys()).map(itemId => {
            const evidence = itemsGrouped.get(itemId) || [];
            const dbInfo = dbItemsMap.get(itemId);
            
            return {
                itemId: itemId,
                driveName: itemId, 
                title: dbInfo?.title || "Producto " + itemId,
                sku: dbInfo?.sku || "Sin SKU",
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
        console.error("Error items (Bucket):", error);
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
