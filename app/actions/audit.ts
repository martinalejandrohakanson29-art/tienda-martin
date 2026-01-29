// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
// Agregamos GetObjectCommand para poder firmar la url
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3" 
// Importamos la utilidad para firmar URLs
import { getSignedUrl } from "@aws-sdk/s3-request-presigner" 

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Esta función se mantiene casi igual, solo limpieza
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
                const itemId = fileName.split('_')[0]; 
                if (itemId) uniqueItems.add(itemId);
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

export async function getAuditPendingItems(envioId: string) {
    try {
        const prefix = `auditoria/${envioId}/`;
        
        // 1. Datos de DB
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

        const dbItemsMap = new Map();
        dbShipment?.items.forEach(item => {
            dbItemsMap.set(item.itemId, item);
        });

        const statusMap = new Map();
        auditedItems.forEach(ai => statusMap.set(ai.itemId, ai.status));

        // 2. Listar archivos en S3
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const s3Res = await s3Client.send(command);
        const files = s3Res.Contents || [];

        // 3. Agrupamos y generamos URLs FIRMADAS (Aquí estaba el problema)
        // Usamos un mapa asíncrono para generar las URLs
        const itemsGrouped = new Map<string, string[]>();
        
        // Procesamos los archivos en paralelo para no demorar la respuesta
        await Promise.all(files.map(async (file) => {
            const fileName = file.Key?.split('/').pop() || "";
            const itemId = fileName.split('_')[0]; // Saca el MLA

            if (itemId && file.Key) {
                // GENERACIÓN DE URL FIRMADA
                // Esto crea un link temporal que da permiso de ver el archivo privado
                const getCommand = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: file.Key,
                });
                
                // Expira en 3600 segundos (1 hora)
                const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
                
                const existing = itemsGrouped.get(itemId) || [];
                itemsGrouped.set(itemId, [...existing, signedUrl]);
            }
        }));

        const allItems = Array.from(itemsGrouped.keys()).map(itemId => {
            const evidence = itemsGrouped.get(itemId) || [];
            const dbInfo = dbItemsMap.get(itemId);
            
            return {
                itemId: itemId,
                driveName: itemId, 
                title: dbInfo?.title || "No encontrado en DB",
                sku: dbInfo?.sku || "S/D",
                quantity: dbInfo?.quantity || 0,
                agregados: dbInfo?.agregados ? dbInfo.agregados.split(", ") : [],
                referenceImageUrl: dbInfo?.imageUrl || null,
                evidenceImageUrl: evidence[0], // Usamos la URL firmada
                evidenceImages: evidence,      // Array de URLs firmadas
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
