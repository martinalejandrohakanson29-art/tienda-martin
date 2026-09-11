import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { generarBufferPreformaExcel, nombreArchivoPreforma } from "@/lib/exportar-preforma-excel-server"

const BUCKET_NAME = (process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || "spacious-glovebox-axtxg0h").trim()

async function descargarFotoS3(urlOrKey: string | null | undefined): Promise<Buffer | null> {
  if (!urlOrKey) return null
  try {
    let key = urlOrKey
    if (key.includes(`/${BUCKET_NAME}/`)) {
      key = key.split(`/${BUCKET_NAME}/`)[1]
    } else if (key.startsWith("http")) {
      const idx = key.indexOf("importaciones/")
      if (idx !== -1) key = key.substring(idx)
    }
    if (key.startsWith("/")) key = key.substring(1)
    if (!key) return null

    const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
    if (!response.Body) return null
    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (err) {
    console.warn("No se pudo descargar la foto del ítem para el Excel:", err)
    return null
  }
}

export async function GET(request: NextRequest, context: { params: any }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new NextResponse("No autorizado", { status: 401 })
    }

    const params = context.params instanceof Promise ? await context.params : context.params
    const { id } = params

    const preforma = await prisma.preformaImportacion.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            articulo: { select: { nombre: true, codigoProveedor: true } },
          },
        },
      },
    })

    if (!preforma) {
      return new NextResponse("Preforma no encontrada", { status: 404 })
    }

    const items = await Promise.all(
      preforma.items.map(async (item) => ({
        supplierItemNo: item.supplierItemNo,
        articuloCodigoProveedor: item.articulo?.codigoProveedor || null,
        descripcionOriginal: item.descripcionOriginal,
        articuloNombre: item.articulo?.nombre || null,
        logo: item.logo,
        size: item.size,
        cantidad: item.cantidad,
        precioUnitarioUsd: item.precioUnitarioUsd ? Number(item.precioUnitarioUsd) : null,
        precioTotalUsd: item.precioTotalUsd ? Number(item.precioTotalUsd) : null,
        fotoBuffer: await descargarFotoS3(item.fotoUrl),
      }))
    )

    const preformaParaExcel = {
      numero: preforma.numero,
      numeroFactura: preforma.numeroFactura,
      fechaEmision: preforma.fechaEmision ? preforma.fechaEmision.toISOString() : null,
      proveedor: preforma.proveedor,
      observaciones: preforma.observaciones,
      items,
    }

    const buffer = await generarBufferPreformaExcel(preformaParaExcel)
    const fileName = nombreArchivoPreforma(preformaParaExcel)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error al generar Excel de preforma:", error)
    return new NextResponse(`Error interno: ${error.message}`, { status: 500 })
  }
}
