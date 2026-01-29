// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const BUCKET_URL = "https://storage.railway.app";

/**
 * Obtiene la lista de envíos desde el Bucket
 */
// app/actions/audit.ts
export async function getShipmentFolders() {
    try {
        console.log("🔍 DIAGNÓSTICO: Listando TODO el contenido del bucket...");

        // Quitamos el Delimiter y el Prefix para ver el contenido crudo
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
        });

        const response = await s3Client.send(command);
        
        if (!response.Contents || response.Contents.length === 0) {
            console.log("⚠️ EL BUCKET ESTÁ TOTALMENTE VACÍO");
            return { success: true, folders: [] };
        }

        console.log(`✅ Se encontraron ${response.Contents.length} archivos en total.`);
        
        // Imprimimos el nombre de cada archivo encontrado
        response.Contents.forEach(obj => {
            console.log("📄 Archivo encontrado -> Key:", obj.Key);
        });

        // --- Lógica simplificada para que al menos veas algo en la UI ---
        const uniqueFolders = new Set<string>();
        response.Contents.forEach(obj => {
            const parts = obj.Key?.split('/') || [];
            if (parts.length > 1) uniqueFolders.add(parts[1]); // Asume auditoria/NOMBRE/archivo
        });

        const folders = Array.from(uniqueFolders).map(name => ({
            id: name,
            name: name,
            stats: { total: 1, aprobados: 0, rechazados: 0 }
        }));

        return { success: true, folders };

    } catch (error: any) {
        console.error("❌ ERROR CRÍTICO EN S3:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene los items detallados de un envío
 */
export async function getAuditPendingItems(envioId: string) {
    try {
        const prefix = `auditoria/${envioId}/`;
        
        // 1. Datos de DB
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

        // 2. Listar archivos del Bucket
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const s3Res = await s3Client.send(command);
        const files = s3Res.Contents || [];

        // 3. Agrupar por ItemId
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
        console.error("❌ Error en getAuditPendingItems:", error);
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
