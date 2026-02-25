import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// Importamos el cliente de S3
import { s3Client } from "@/lib/s3"; 

export async function GET(req: NextRequest) {
  // 1. Leemos el nombre del archivo que nos pasa n8n o Mercado Libre
  const searchParams = req.nextUrl.searchParams;
  const file = searchParams.get("file");

  if (!file) {
    return NextResponse.json({ error: "Falta el nombre del archivo" }, { status: 400 });
  }

  try {
    // 2. Preparamos la orden para buscar ese archivo en tu bucket
    const command = new GetObjectCommand({
      Bucket: "customizable-cart-gdywtci", // El nombre de tu bucket
      Key: file,
    });
    
    // 3. Descargamos el archivo directamente desde S3 (sin generar links)
    const response = await s3Client.send(command);
    
    // 4. Convertimos el archivo a un formato binario que el navegador/robot pueda leer
    const byteArray = await response.Body?.transformToByteArray();

    if (!byteArray) {
      return NextResponse.json({ error: "No se pudo leer la imagen" }, { status: 500 });
    }

    // 5. Identificamos qué tipo de imagen es (jpeg, png, webp, etc.)
    const contentType = response.ContentType || "image/jpeg";
    
    // 6. Entregamos la imagen directamente (sin redirecciones) y con caché
    return new NextResponse(byteArray, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // La guarda en caché por 24 horas para no sobrecargar tu Railway
      },
    });

  } catch (error) {
    console.error("Error al obtener la imagen de S3:", error);
    return NextResponse.json({ error: "Error interno procesando la imagen o imagen no encontrada" }, { status: 500 });
  }
}
