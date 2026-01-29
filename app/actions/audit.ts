// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const BUCKET_URL = "https://storage.railway.app";

/**
 * Obtiene la lista de envíos (carpetas virtuales) desde el Bucket
 */
export async function getShipmentFolders() {
    try {
        // Listamos los prefijos dentro de auditoria/ para identificar los envíos
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: 'auditoria/',
            Delimiter: '/'
        });

        const response = await s3Client.send(command);
        const prefixes = response.CommonPrefixes || [];

        const folderStats = await Promise.all(prefixes.map(async (p) => {
            const fullPath = p.Prefix || "";
            // Extrae el ID del envío: "auditoria/cmkyf.../ " -> "cmkyf..."
            const folderName = fullPath.split('/').filter(Boolean).pop() || "Desconocido";

            // Buscamos estadísticas de auditoría en la base de datos
            const audits = await prisma.shipmentAudit.findMany({
                where: { envioId: folderName },
                select: { status: true }
            });

            // Contamos cuántos productos (MLAs) únicos hay con fotos en este envío
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
        console.error("Error al obtener carpetas de auditoría:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene los detalles de los productos y sus fotos para auditar un envío
 */
export async function getAuditPendingItems(envioId: string) {
    try {
        const prefix = `auditoria/${envioId}/`;
        
        // 1. Consultamos datos del envío y auditorías previas en paralelo
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

        // 2. Listamos todos los archivos del envío en el Bucket
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const s3Res = await s3Client.send(command);
        const files = s3Res.Contents || [];

        // 3. Agrupamos las fotos por ID de producto (MLA)
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

        // 4. Formateamos la información para la interfaz de usuario
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
        console.error("Error al obtener items para auditar:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Registra la decisión de la auditoría (Aprobar/Rechazar)
 */
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
