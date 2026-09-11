import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export async function GET(
  request: NextRequest,
  context: { params: any }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new NextResponse("No autorizado", { status: 401 })
    }

    const params = context.params instanceof Promise ? await context.params : context.params
    const { id } = params

    const preforma = await prisma.preformaImportacion.findUnique({
      where: { id },
      select: { archivoUrl: true, nombreArchivo: true, tipoArchivo: true }
    })

    if (!preforma || !preforma.archivoUrl) {
      return new NextResponse("Preforma o archivo no encontrado", { status: 404 })
    }

    const bucketName = (process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || "spacious-glovebox-axtxg0h").trim()

    // Extraer Key
    let key = ""
    try {
      const url = new URL(preforma.archivoUrl)
      const pathname = url.pathname
      if (pathname.includes(`/${bucketName}/`)) {
        key = pathname.split(`/${bucketName}/`)[1]
      } else {
        const parts = pathname.split(bucketName)
        key = parts[parts.length - 1]
        if (key.startsWith("/")) key = key.substring(1)
      }
    } catch {
      const parts = preforma.archivoUrl.split(`/${bucketName}/`)
      if (parts.length >= 2) {
        key = parts[1]
      } else {
        const searchPath = "importaciones/"
        const index = preforma.archivoUrl.indexOf(searchPath)
        if (index !== -1) {
          key = preforma.archivoUrl.substring(index)
        }
      }
    }

    if (key.startsWith("/")) key = key.substring(1)
    if (!key) {
      return new NextResponse("No se pudo determinar el archivo en almacenamiento", { status: 400 })
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    const response = await s3Client.send(command)
    if (!response.Body) {
      return new NextResponse("Error al recuperar el archivo", { status: 500 })
    }

    let contentType = response.ContentType || "application/octet-stream"
    const lowerName = preforma.nombreArchivo.toLowerCase()
    if (lowerName.endsWith(".pdf")) {
      contentType = "application/pdf"
    } else if (lowerName.endsWith(".xlsx")) {
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    } else if (lowerName.endsWith(".xls")) {
      contentType = "application/vnd.ms-excel"
    } else if (lowerName.endsWith(".csv")) {
      contentType = "text/csv; charset=utf-8"
    } else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
      contentType = "image/jpeg"
    } else if (lowerName.endsWith(".png")) {
      contentType = "image/png"
    } else if (lowerName.endsWith(".webp")) {
      contentType = "image/webp"
    }

    let body: any = response.Body
    if (typeof body.transformToWebStream === "function") {
      body = body.transformToWebStream()
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${preforma.nombreArchivo}"`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error: any) {
    console.error("Error al servir archivo de preforma:", error)
    return new NextResponse(`Error interno: ${error.message}`, { status: 500 })
  }
}
