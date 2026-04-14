// lib/s3.ts
import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "https";

export const s3Client = new S3Client({
    // Garage suele usar 'garage' o 'us-east-1', está bien dejarlo así o usar la variable
    region: process.env.S3_REGION || "garage",
    
    // Aquí mapeamos a la URL de la API de Garage que pasaste
    endpoint: process.env.S3_ENDPOINT || process.env.GARAGE_S3_API_URL,
    
    credentials: {
        // CORRECCIÓN: Era accessKeyId, no accessKey_Id
        accessKeyId: process.env.S3_ACCESS_KEY_ID!, 
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    
    // Esencial para Garage: permite usar buckets como path (ej: endpoint/bucket)
    forcePathStyle: true, 
    
    // Esto evita errores de certificados autofirmados en sslip.io
    requestHandler: new NodeHttpHandler({
        httpsAgent: new Agent({
            rejectUnauthorized: false, 
        }),
    }),
});
