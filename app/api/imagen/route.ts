import { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// Importamos el cliente de S3
import { s3Client } from "@/lib/s3"; 

export async function GET(req: NextRequest) {
  // 1. Leemos el nombre del archivo de la URL
  const searchParams = req.nextUrl.searchParams;
  const file = searchParams.get("file");

  if (!file) {
    return new Response(JSON.stringify({ error: "Falta el nombre del archivo" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 2. Preparamos la orden para S3
    const command = new GetObjectCommand({
      Bucket: "customizable-cart-gdywtci",
      Key: file,
    });
    
    // 3. Ejecutamos la petición a S3
    const response = await s3Client.send(command);
    
    // 4. Transformamos la respuesta en un arreglo de bytes
    const byteArray = await response.Body?.transformToByteArray();

    if (!byteArray) {
      return new Response(JSON.stringify({ error: "No se pudo leer la imagen" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. ¡LA CLAVE!: Empaquetamos todo en un Buffer
    const buffer = Buffer.from(byteArray);

    // 6. Retornamos usando "Response" (para evitar el error de TypeScript) y le damos el peso exacto (Content-Length)
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": response.ContentType || "image/jpeg",
        "Content-Length": buffer.length.toString(), // ¡Mercado Libre necesita esto sí o sí!
        "Cache-Control": "public, max-age=86400",
      },
    });

  } catch (error) {
    console.error("Error al obtener la imagen de S3:", error);
    return new Response(JSON.stringify({ error: "Error interno o no encontrada" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
