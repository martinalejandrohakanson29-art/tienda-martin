import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

const PREFIX = "chatwoot-prueba/";

// Sube un audio grabado/subido en /admin/chatwoot/prueba a S3 y devuelve una URL de
// este mismo endpoint (GET, sin auth) para que n8n la descargue como si fuera el
// data_url de un adjunto real de WhatsApp/Chatwoot. Garage no permite acceso anónimo
// directo al bucket (ver /api/imagen y /api/pedidos/[id]/pdf, mismo problema con los
// PDF de ventas), así que hace falta proxyear el archivo con el cliente autenticado.
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
        const key = `${PREFIX}audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));

        // OJO: no usar new URL(request.url).origin acá — detrás del reverse proxy de
        // este deploy, request.url resuelve a "0.0.0.0:3000" (la dirección interna
        // donde escucha Next), no al dominio público. NEXTAUTH_URL sí es la URL real.
        const baseUrl = (process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
        const audioUrl = `${baseUrl}/api/chatwoot/prueba-audio-upload?key=${encodeURIComponent(key)}`;

        return NextResponse.json({ success: true, audioUrl });
    } catch (error) {
        console.error("Error al subir audio de prueba:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, { status: 500 });
    }
}

// Sirve el audio subido para que el workflow de n8n (HTTP Request2 -> Transcribe)
// lo pueda descargar por URL, igual que haría con un adjunto real de Chatwoot.
export async function GET(request: Request) {
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
        return NextResponse.json({ error: "Configuración de almacenamiento incompleta" }, { status: 500 });
    }

    const key = new URL(request.url).searchParams.get("key");
    if (!key || key.includes("..") || key.includes("\0") || !key.startsWith(PREFIX)) {
        return NextResponse.json({ error: "Clave de archivo inválida" }, { status: 400 });
    }

    try {
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        const byteArray = await response.Body?.transformToByteArray();
        if (!byteArray) {
            return NextResponse.json({ error: "No se pudo leer el audio" }, { status: 500 });
        }

        const buffer = Buffer.from(byteArray);
        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": response.ContentType || "audio/webm",
                "Content-Length": buffer.length.toString(),
                "Cache-Control": "public, max-age=86400",
            },
        });
    } catch (error) {
        console.error("Error al obtener audio de prueba:", error);
        return NextResponse.json({ error: "Audio no encontrado" }, { status: 404 });
    }
}
