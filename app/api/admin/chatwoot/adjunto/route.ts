import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-guard"
import { s3Client } from "@/lib/s3"

export const dynamic = "force-dynamic"

const PREFIX = "chatwoot-adjuntos/"
const TAMANO_MAXIMO = 25 * 1024 * 1024
const TIPOS_PERMITIDOS = ["image/", "video/", "audio/"]
const DOCUMENTOS_PERMITIDOS = new Set([
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

function resolveBaseUrl(request: Request): string {
    const forwardedHost = request.headers.get("x-forwarded-host")
    if (forwardedHost) return `${request.headers.get("x-forwarded-proto") || "https"}://${forwardedHost}`
    if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "")
    return new URL(request.url).origin
}

function tipoPermitido(tipo: string): boolean {
    return TIPOS_PERMITIDOS.some((prefijo) => tipo.startsWith(prefijo)) || DOCUMENTOS_PERMITIDOS.has(tipo)
}

export async function POST(request: Request) {
    try {
        await requireAdmin()
    } catch {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    try {
        const formData = await request.formData()
        const file = formData.get("archivo")
        if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
        if (!tipoPermitido(file.type)) {
            return NextResponse.json({ error: "Formato no admitido. Usá una foto, video, audio, PDF o documento" }, { status: 400 })
        }
        const limite = file.type.startsWith("image/") ? 5 * 1024 * 1024 : TAMANO_MAXIMO
        if (file.size > limite) {
            return NextResponse.json({
                error: file.type.startsWith("image/")
                    ? "La imagen no puede superar los 5MB"
                    : "El archivo no puede superar los 25MB",
            }, { status: 400 })
        }

        const bucketName = process.env.S3_BUCKET_NAME
        if (!bucketName) return NextResponse.json({ error: "Configuración de almacenamiento incompleta" }, { status: 500 })

        const extensionOriginal = file.name.includes(".") ? file.name.split(".").pop() : null
        const extensionMime = (file.type.split("/")[1] || "bin").split(";")[0]
        const extension = (extensionOriginal || extensionMime).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin"
        const key = `${PREFIX}${Date.now()}-${crypto.randomUUID()}.${extension}`
        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: Buffer.from(await file.arrayBuffer()),
            ContentType: file.type,
        }))

        return NextResponse.json({
            success: true,
            url: `${resolveBaseUrl(request)}/api/admin/chatwoot/adjunto?key=${encodeURIComponent(key)}`,
            nombre: file.name,
            contentType: file.type,
            tamano: file.size,
        })
    } catch (error) {
        console.error("Error al subir adjunto de Chatwoot:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
    }
}

export async function GET(request: Request) {
    const bucketName = process.env.S3_BUCKET_NAME
    if (!bucketName) return NextResponse.json({ error: "Configuración de almacenamiento incompleta" }, { status: 500 })
    const key = new URL(request.url).searchParams.get("key")
    if (!key || key.includes("..") || key.includes("\0") || !key.startsWith(PREFIX)) {
        return NextResponse.json({ error: "Clave inválida" }, { status: 400 })
    }
    try {
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }))
        const byteArray = await response.Body?.transformToByteArray()
        if (!byteArray) return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 500 })
        const buffer = Buffer.from(byteArray)
        return new Response(buffer, {
            headers: {
                "Content-Type": response.ContentType || "application/octet-stream",
                "Content-Length": String(buffer.length),
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": "inline",
            },
        })
    } catch (error) {
        console.error("Error al obtener adjunto de Chatwoot:", error)
        return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 })
    }
}
