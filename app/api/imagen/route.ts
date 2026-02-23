import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Importa tu cliente de S3 configurado. 
// (Asegúrate de que el nombre coincida con cómo lo exportaste en lib/s3.ts, por ej: 's3' o 's3Client')
import { s3Client } from "@/lib/s3"; 

export async function GET(req: NextRequest) {
  // 1. Leemos el nombre del archivo que nos pasa n8n (ej: publicaciones/foto_123.png)
  const searchParams = req.nextUrl.searchParams;
  const file = searchParams.get("file");

  if (!file) {
    return NextResponse.json({ error: "Falta el nombre del archivo" }, { status: 400 });
  }

  try {
    // 2. Preparamos la orden para buscar ese archivo exacto en tu bucket
    const command = new GetObjectCommand({
      Bucket: "customizable-cart-gdywtci", // El nombre de tu bucket
      Key: file,
    });
    
    // 3. Generamos la llave temporal (Pre-signed URL) válida por 2 horas (7200 seg)
    // Cambia 's3Client' por el nombre exacto que uses en tu archivo lib/s3.ts
    const url = await getSignedUrl(s3Client, command, { expiresIn: 7200 });
    
    // 4. Redirigimos automáticamente. Mercado Libre seguirá este link y bajará la foto sin problemas.
    return NextResponse.redirect(url);

  } catch (error) {
    console.error("Error al generar el link de la imagen:", error);
    return NextResponse.json({ error: "Error interno procesando la imagen" }, { status: 500 });
  }
}
