// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3" 
import { getSignedUrl } from "@aws-sdk/s3-request-presigner" 

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

/**
 * Obtiene las carpetas de envíos en S3 y calcula estadísticas de auditoría
 */
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
            const folderId = fullPath.replace('auditoria/', '').replace(/\//g, '');

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
                // Ahora usamos el ID único (cuid) que viene como prefijo en el nombre del archivo
                const dbId = fileName.split('_')[0]; 
                if (dbId) uniqueItems.add(dbId);
            });

            return {
                id: folderId,
                name: shipmentDb?.name || `ID: ${folderId.substring(0, 8)}...`, 
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

/**
 * Obtiene todos los artículos de un envío con sus fotos de auditoría y estados
 */
export async function getAuditPendingItems(envioId: string) {
    try {
        const prefix = `auditoria/${envioId}/`;
        
        // 1. Obtener datos de DB
        const [dbShipment, auditedItems] = await Promise.all([
            prisma.shipment.findUnique({
                where: { id: envioId }, 
                include: { items: true }
            }),
            prisma.shipmentAudit.findMany({
                where: { envioId: envioId },
                select: { itemId: true, status: true }
            })
        ]);

        // Mapeamos estados por el ID único del item (itemId en ShipmentAudit ahora guardará el id de ShipmentItem)
        const statusMap = new Map();
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status));

        // 2. Listar archivos en S3
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const s3Res = await s3Client.send(command);
        const files = s3Res.Contents || [];

        // 3. Agrupamos y generamos URLs FIRMADAS usando el ID único como llave
        const itemsGrouped = new Map<string, string[]>();
        
        await Promise.all(files.map(async (file) => {
            const fileName = file.Key?.split('/').pop() || "";
            // El nombre del archivo debe empezar con el id (cuid) del ShipmentItem
            const dbId = fileName.split('_')[0]; 

            if (dbId && file.Key) {
                const getCommand = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: file.Key,
                });
                
                // URL válida por 1 hora
                const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
                
                const existing = itemsGrouped.get(dbId) || [];
                itemsGrouped.set(dbId, [...existing, signedUrl]);
            }
        }));

        // 4. Construir la respuesta final basada en lo que hay en DB
        // Esto asegura que aparezcan todos los items aunque no tengan foto
        const allItems = (dbShipment?.items || []).map(item => {
            const evidence = itemsGrouped.get(item.id) || [];
            
            return {
                itemId: item.id, // ID único (cuid) para auditoría
                mla: item.itemId, // El código MLA original
                title: item.title,
                sku: item.sku || "S/D",
                quantity: item.quantity,
                agregados: item.agregados ? item.agregados.split(", ") : [],
                referenceImageUrl: item.imageUrl || null,
                evidenceImageUrl: evidence[0] || null,
                evidenceImages: evidence,
                status: (statusMap.get(item.id) || 'PENDIENTE'),
                envioId: envioId
            };
        });

        return { success: true, data: allItems, envioId };
    } catch (error: any) {
        console.error("Error items:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Actualiza o crea el estado de auditoría para un ítem específico
 */
export async function auditItem(itemId: string, status: string, envioId: string) {
    try {
        // 'itemId' aquí debe ser el cuid del ShipmentItem
        await prisma.shipmentAudit.upsert({
            where: { itemId_envioId: { itemId, envioId } },
            update: { status },
            create: { itemId, envioId, status, auditor: "Admin" }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error auditItem:", error);
        return { success: false, error: error.message };
    }
}
