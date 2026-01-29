// app/actions/audit.ts
"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"

export async function getShipmentFolders() {
    // 1. Leemos las variables justo antes de usar (para evitar problemas de caché)
    const BUCKET_NAME = process.env.S3_BUCKET_NAME;
    const ENDPOINT = process.env.S3_ENDPOINT;

    try {
        console.log("--- INICIO DE DIAGNÓSTICO ---");
        console.log("🪣 Bucket configurado:", BUCKET_NAME);
        console.log("🌐 Endpoint usado:", ENDPOINT);

        if (!BUCKET_NAME) {
            console.error("❌ ERROR: La variable S3_BUCKET_NAME no está llegando al servidor.");
            return { success: false, error: "Falta configurar S3_BUCKET_NAME" };
        }

        // 2. Pedimos la lista SIN filtros de ningún tipo
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
        });

        const response = await s3Client.send(command);
        
        // 3. Revisamos qué nos respondió S3 realmente
        console.log("📦 Respuesta cruda de S3:", JSON.stringify({
            IsTruncated: response.IsTruncated,
            KeyCount: response.KeyCount,
            ContentsLength: response.Contents?.length || 0
        }));

        if (!response.Contents || response.Contents.length === 0) {
            console.log("⚠️ EL BUCKET RESPONDE QUE ESTÁ VACÍO (Contents es null/0)");
            return { success: true, folders: [] };
        }

        console.log(`✅ ¡ÉXITO! Se encontraron ${response.Contents.length} archivos.`);
        
        // Listamos los primeros 5 archivos para ver su ruta exacta
        response.Contents.slice(0, 5).forEach(obj => {
            console.log("📄 Archivo encontrado -> Key:", obj.Key);
        });

        // Agrupamos por carpeta para que la UI muestre algo
        const uniqueFolders = new Set<string>();
        response.Contents.forEach(obj => {
            const parts = obj.Key?.split('/') || [];
            if (parts.length > 1) {
                // Si la ruta es auditoria/ENVIO_123/foto.jpg, parts[1] es ENVIO_123
                uniqueFolders.add(parts[1]);
            } else {
                uniqueFolders.add("Sin Carpeta");
            }
        });

        const folderStats = Array.from(uniqueFolders).map(name => ({
            id: name,
            name: name,
            stats: { total: 1, aprobados: 0, rechazados: 0 }
        }));

        return { success: true, folders: folderStats };

    } catch (error: any) {
        console.error("❌ ERROR CRÍTICO AL CONECTAR CON S3:", error);
        // Si hay un error de "Access Denied" o "Bucket not found", lo veremos acá
        return { success: false, error: error.message };
    }
}

// Mantener el resto de las funciones igual...
export async function getAuditPendingItems(envioId: string) { /* ... */ return { success: true, data: [] } }
export async function auditItem(itemId: string, status: string, envioId: string) { /* ... */ return { success: true } }
