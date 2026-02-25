import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// Importamos tu cliente de S3 configurado en lib/s3
import { s3Client } from "@/lib/s3"; 

export async function GET(req: NextRequest) {
  // 1. Leemos el nombre del archivo de la URL
  const searchParams = req.nextUrl.searchParams;
  const file = searchParams.get("file");

  if (!file) {
    return NextResponse.json({ error: "Falta el nombre del archivo" }, { status: 400 });
  }

  try {
    // 2. Preparamos la orden para S3
    const command = new GetObjectCommand({
      Bucket: "customizable-cart-gdywtci", // El nombre exacto de tu bucket
      Key: file,
    });
    
    // 3. Ejecutamos la petición a S3
    const response = await s3Client.send(command);
    
    // 4. Usamos un Web Stream (flujo de datos web). 
    // Esto es compatible 100% con NextResponse y TypeScript no se queja.
    const stream = response.Body?.transformToWebStream();

    if (!stream) {
      return NextResponse.json({ error: "No se pudo generar el stream de la imagen" }, { status: 500 });
    }

    // 5. Identificamos el tipo de archivo
    const contentType = response.ContentType || "image/jpeg";
    
    // 6. Retornamos el archivo directo a Mercado Libre
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // Caché por 24 horas
      },
    });

  } catch (error) {
    console.error("Error al obtener la imagen de S3:", error);
    return NextResponse.json({ error: "Error interno o archivo no encontrado" }, { status: 500 });
  }
}
