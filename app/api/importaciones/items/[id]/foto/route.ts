import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { GetObjectCommand } from "@aws-sdk/client-s3"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: any }
) {
  try {
    const params = context.params instanceof Promise ? await context.params : context.params
    const { id } = params

    if (!id) {
      return new NextResponse("ID de ítem requerido", { status: 400 })
    }

    const item = await prisma.preformaItem.findUnique({
      where: { id },
      select: { fotoUrl: true, supplierItemNo: true },
    })

    if (!item || !item.fotoUrl) {
      return new NextResponse("Foto no encontrada", { status: 404 })
    }

    const bucketName = (process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || "spacious-glovebox-axtxg0h").trim()

    // Extraer Key del archivo en S3
    let key = ""
    try {
      const url = new URL(item.fotoUrl)
      const pathname = url.pathname
      if (pathname.includes(`/${bucketName}/`)) {
        key = pathname.split(`/${bucketName}/`)[1]
      } else {
        const parts = pathname.split(bucketName)
        key = parts[parts.length - 1]
        if (key.startsWith("/")) key = key.substring(1)
      }
    } catch {
      const parts = item.fotoUrl.split(`/${bucketName}/`)
      if (parts.length >= 2) {
        key = parts[1]
      } else {
        const searchPath = "importaciones/"
        const index = item.fotoUrl.indexOf(searchPath)
        if (index !== -1) {
          key = item.fotoUrl.substring(index)
        } else {
          key = item.fotoUrl
        }
      }
    }

    if (key.startsWith("/")) key = key.substring(1)

    if (!key) {
      return new NextResponse("Clave de imagen no válida", { status: 400 })
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    const response = await s3Client.send(command)
    const byteArray = await response.Body?.transformToByteArray()

    if (!byteArray) {
      return new NextResponse("No se pudo leer la imagen desde S3", { status: 500 })
    }

    const buffer = Buffer.from(byteArray)
    const contentType = response.ContentType || "image/png"

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Disposition": `inline; filename="${encodeURIComponent(item.supplierItemNo || "foto")}.png"`,
      },
    })
  } catch (error: any) {
    console.error("Error al servir foto de ítem de preforma:", error)
    return new NextResponse("Error al obtener la imagen", { status: 500 })
  }
}
