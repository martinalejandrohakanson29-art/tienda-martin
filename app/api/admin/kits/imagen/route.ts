import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const PREFIX = "kits-fotos/";
const TAMANO_MAXIMO = 5 * 1024 * 1024; // 5MB, límite típico de imagen en WhatsApp/Chatwoot

// Arma la URL pública real a partir de los headers que pone el reverse proxy
// (mismo motivo que app/api/chatwoot/prueba-audio-upload/route.ts: NEXTAUTH_URL
// y request.url no sirven detrás del proxy de Easypanel).
function resolveBaseUrl(request: Request): string {
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) {
        const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
        return `${forwardedProto}://${forwardedHost}`;
    }
    if (process.env.NEXTAUTH_URL) {
        return process.env.NEXTAUTH_URL.replace(/\/$/, "");
    }
    return new URL(request.url).origin;
}

// Sube la foto de un kit (drag & drop en /admin/chatwoot/conocimiento) a S3 y
// devuelve una URL de este mismo endpoint (GET) para guardar en
// kits_publicidad.foto_url. Garage/Tigris no permite acceso anónimo directo al
// bucket, así que hace falta proxyear el archivo (mismo esquema que /api/imagen
// y prueba-audio-upload).
export async function POST(request: Request) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("imagen");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Falta el archivo de imagen" }, { status: 400 });
        }
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "El archivo tiene que ser una imagen" }, { status: 400 });
        }
        if (file.size > TAMANO_MAXIMO) {
            return NextResponse.json({ error: "La imagen no puede superar los 5MB" }, { status: 400 });
        }

        const bucketName = process.env.S3_BUCKET_NAME;
        if (!bucketName) {
            return NextResponse.json({ error: "Configuración de almacenamiento incompleta (S3_BUCKET_NAME)" }, { status: 500 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const contentType = file.type;
        const extension = (contentType.split("/")[1] || "jpg").split(";")[0];
        const key = `${PREFIX}kit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));

        const fotoUrl = `${resolveBaseUrl(request)}/api/admin/kits/imagen?key=${encodeURIComponent(key)}`;

        return NextResponse.json({ success: true, fotoUrl });
    } catch (error) {
        console.error("Error al subir foto de kit:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, { status: 500 });
    }
}

// Sirve la foto para que el navegador (preview) y, más adelante, Chatwoot/n8n
// la puedan descargar por URL. Sin auth a propósito: el workflow tiene que
// poder bajarla para reenviarla como adjunto.
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
            return NextResponse.json({ error: "No se pudo leer la imagen" }, { status: 500 });
        }

        const buffer = Buffer.from(byteArray);
        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": response.ContentType || "image/jpeg",
                "Content-Length": buffer.length.toString(),
                "Cache-Control": "public, max-age=86400",
            },
        });
    } catch (error) {
        console.error("Error al obtener foto de kit de S3:", error);
        return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }
}
