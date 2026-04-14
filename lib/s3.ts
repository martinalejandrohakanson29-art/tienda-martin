// lib/s3.ts
import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "https";

export const s3Client = new S3Client({
    region: process.env.S3_REGION || "garage",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKey_Id: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    // Esencial para Garage/MinIO
    forcePathStyle: true, 
    // Esta parte soluciona el error de "Fetch Failed" o errores de SSL
    requestHandler: new NodeHttpHandler({
        httpsAgent: new Agent({
            rejectUnauthorized: false, // Ignora la validación del certificado SSL
        }),
    }),
});
