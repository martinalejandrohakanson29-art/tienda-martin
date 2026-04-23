import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { s3Client } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET(
  request: NextRequest,
  context: { params: any }
) {
  try {
    // 1. Verificar sesión
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse("No autorizado", { status: 401 });
    }

    // Manejar params como objeto o como promesa para compatibilidad
    const params = context.params instanceof Promise ? await context.params : context.params;
    const { id } = params;
    const fileName = request.nextUrl.searchParams.get("fileName");

    // 2. Obtener la compra y su URL de PDF
    const compra = await prisma.compra.findUnique({
      where: { id },
      select: { pdfUrl: true, id: true, proveedor: true }
    });

    if (!compra || !compra.pdfUrl) {
      return new NextResponse("Compra o PDF no encontrado", { status: 404 });
    }

    const bucketName = process.env.S3_BUCKET_NAME?.trim();
    if (!bucketName) {
      return new NextResponse("Configuración de S3 incompleta", { status: 500 });
    }

    // 3. Extraer el Key del PDF
    let key = "";
    try {
      const url = new URL(compra.pdfUrl);
      const pathname = url.pathname;
      
      if (pathname.includes(`/${bucketName}/`)) {
        key = pathname.split(`/${bucketName}/`)[1];
      } else if (pathname.includes(bucketName)) {
        const parts = pathname.split(bucketName);
        key = parts[parts.length - 1];
        if (key.startsWith('/')) key = key.substring(1);
      } else {
        key = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      }
    } catch (e) {
      const parts = compra.pdfUrl.split(`/${bucketName}/`);
      if (parts.length >= 2) {
        key = parts[1];
      } else {
        const searchPath = "compras/";
        const index = compra.pdfUrl.indexOf(searchPath);
        if (index !== -1) {
          key = compra.pdfUrl.substring(index);
        }
      }
    }

    if (key.startsWith('/')) key = key.substring(1);

    if (!key) {
      return new NextResponse("No se pudo determinar el archivo en S3", { status: 400 });
    }

    // 4. Descargar de S3
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return new NextResponse("Error al recuperar el contenido del archivo", { status: 500 });
    }

    // 5. Preparar la respuesta
    const contentType = response.ContentType || "application/pdf";
    const finalFileName = fileName || `compra_${compra.proveedor?.replace(/[^a-zA-Z0-9]/g, '_') || compra.id.slice(0, 8)}.pdf`;

    let body: any = response.Body;
    if (typeof body.transformToWebStream === "function") {
      body = body.transformToWebStream();
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${finalFileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });

  } catch (error: any) {
    console.error("Error en proxy de PDF de compra:", error);
    return new NextResponse(`Error interno: ${error.message}`, { status: 500 });
  }
}
