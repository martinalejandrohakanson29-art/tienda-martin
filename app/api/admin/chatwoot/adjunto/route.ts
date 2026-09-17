import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-guard"
import { s3Client } from "@/lib/s3"
import sharp from "sharp"

export const dynamic = "force-dynamic"

const PREFIX = "chatwoot-adjuntos/"
const TAMANO_MAXIMO = 25 * 1024 * 1024
const TAMANO_MAXIMO_IMAGEN_WHATSAPP = 5 * 1024 * 1024
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

function esNombreImagen(nombre: string): boolean {
    return /\.(jpe?g|png|webp|heic|heif)$/i.test(nombre)
}

function tipoPermitido(tipo: string, nombre: string): boolean {
    return TIPOS_PERMITIDOS.some((prefijo) => tipo.startsWith(prefijo)) || DOCUMENTOS_PERMITIDOS.has(tipo) || esNombreImagen(nombre)
}

async function normalizarImagenParaWhatsApp(file: File, original: Buffer): Promise<{
    buffer: Buffer
    contentType: string
    nombre: string
}> {
    const esFormatoDirecto = file.type === "image/jpeg" || file.type === "image/png"
    if (esFormatoDirecto && original.length <= TAMANO_MAXIMO_IMAGEN_WHATSAPP) {
        return { buffer: original, contentType: file.type, nombre: file.name }
    }

    const nombreBase = (file.name.replace(/\.[^.]+$/, "") || "foto").replace(/[\r\n"\\/]/g, "_").slice(0, 160)
    const intentos = [
        { lado: 2560, calidad: 85 },
        { lado: 2200, calidad: 78 },
        { lado: 1800, calidad: 72 },
        { lado: 1440, calidad: 65 },
    ]

    try {
        for (const intento of intentos) {
            const convertido = await sharp(original, { failOn: "none" })
                .rotate()
                .resize({
                    width: intento.lado,
                    height: intento.lado,
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .flatten({ background: "#ffffff" })
                .jpeg({ quality: intento.calidad, mozjpeg: true })
                .toBuffer()

            if (convertido.length <= TAMANO_MAXIMO_IMAGEN_WHATSAPP) {
                return { buffer: convertido, contentType: "image/jpeg", nombre: `${nombreBase}.jpg` }
            }
        }
    } catch (error) {
        console.error("No se pudo convertir la imagen para WhatsApp:", error)
        throw new Error("No se pudo procesar esta foto. Probá seleccionándola nuevamente")
    }

    throw new Error("No se pudo reducir la foto por debajo de 5MB")
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
        if (!tipoPermitido(file.type, file.name)) {
            return NextResponse.json({ error: "Formato no admitido. Usá una foto, video, audio, PDF o documento" }, { status: 400 })
        }
        if (file.size > TAMANO_MAXIMO) {
            return NextResponse.json({ error: "El archivo original no puede superar los 25MB" }, { status: 400 })
        }

        const bucketName = process.env.S3_BUCKET_NAME
        if (!bucketName) return NextResponse.json({ error: "Configuración de almacenamiento incompleta" }, { status: 500 })

        const original = Buffer.from(await file.arrayBuffer())
        const normalizado = file.type.startsWith("image/") || esNombreImagen(file.name)
            ? await normalizarImagenParaWhatsApp(file, original)
            : { buffer: original, contentType: file.type, nombre: file.name }

        const extensionOriginal = normalizado.nombre.includes(".") ? normalizado.nombre.split(".").pop() : null
        const extensionMime = (normalizado.contentType.split("/")[1] || "bin").split(";")[0]
        const extension = (extensionOriginal || extensionMime).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin"
        const key = `${PREFIX}${Date.now()}-${crypto.randomUUID()}.${extension}`
        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: normalizado.buffer,
            ContentType: normalizado.contentType,
        }))

        return NextResponse.json({
            success: true,
            url: `${resolveBaseUrl(request)}/api/admin/chatwoot/adjunto?key=${encodeURIComponent(key)}`,
            nombre: normalizado.nombre,
            contentType: normalizado.contentType,
            tamano: normalizado.buffer.length,
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
