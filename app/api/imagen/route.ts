import { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");

  // Bloquear path traversal y caracteres peligrosos
  if (!file || file.includes("..") || file.includes("\0") || file.startsWith("/")) {
    return new Response(JSON.stringify({ error: "Nombre de archivo inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    return new Response(JSON.stringify({ error: "Configuración de almacenamiento incompleta" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: file });
    const response = await s3Client.send(command);

    const byteArray = await response.Body?.transformToByteArray();
    if (!byteArray) {
      return new Response(JSON.stringify({ error: "No se pudo leer la imagen" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const buffer = Buffer.from(byteArray);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": response.ContentType || "image/jpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error al obtener imagen de S3:", error);
    return new Response(JSON.stringify({ error: "Imagen no encontrada" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
