import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

// Sube un audio grabado/subido en /admin/chatwoot/prueba a S3 y devuelve una URL
// pública, para poder simular un mensaje de voz de WhatsApp (attachments[0].data_url)
// sin depender de un Chatwoot real. Mismo patrón que ya usa la app para los PDF de
// ventas (bucket/key directo, sin firmar), ver app/actions/ventas-mostrador.ts.
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("audio");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Falta el archivo de audio" }, { status: 400 });
        }

        const bucketName = process.env.S3_BUCKET_NAME;
        if (!bucketName) {
            return NextResponse.json({ error: "Configuración de almacenamiento incompleta (S3_BUCKET_NAME)" }, { status: 500 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const contentType = file.type || "audio/webm";
        const extension = (contentType.split("/")[1] || "webm").split(";")[0];
        const key = `chatwoot-prueba/audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));

        const baseUrl = process.env.GARAGE_S3_API_URL || process.env.S3_ENDPOINT;
        const cleanBaseUrl = baseUrl?.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        const audioUrl = `${cleanBaseUrl}/${bucketName}/${key}`;

        return NextResponse.json({ success: true, audioUrl });
    } catch (error) {
        console.error("Error al subir audio de prueba:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, { status: 500 });
    }
}
