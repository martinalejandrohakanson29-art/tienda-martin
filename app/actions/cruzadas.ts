"use server";

import { prisma } from "@/lib/prisma";
import { s3Client } from "@/lib/s3"; // Importamos tu cliente S3
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function getTransferenciasCruzadas() {
  try {
    const transferencias = await prisma.transferenciaCruzada.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    // Procesamos cada transferencia para generar el link temporal
    const transferenciasConLinks = await Promise.all(
      transferencias.map(async (item) => {
        let presignedUrl = null;

        if (item.imageUrl) {
          try {
            // Extraemos la "Key" (la ruta) de la URL que guardó n8n
            // n8n guarda algo como: https://.../customizable-cart-gdywtci/cruzadas/foto.jpg
            // Necesitamos solo: cruzadas/foto.jpg
            const urlParts = item.imageUrl.split(`${process.env.S3_BUCKET || 'customizable-cart-gdywtci'}/`);
            const key = urlParts.length > 1 ? urlParts[1] : item.imageUrl;

            const command = new GetObjectCommand({
              Bucket: process.env.S3_BUCKET || "customizable-cart-gdywtci",
              Key: key,
            });

            // Generamos un link que dura 1 hora (3600 segundos)
            presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          } catch (err) {
            console.error("Error generando URL firmada para:", item.id, err);
          }
        }

        return {
          ...item,
          imageUrl: presignedUrl, // Reemplazamos la URL fija por la URL temporal
        };
      })
    );

    // Serializamos para el Client Component
    return JSON.parse(JSON.stringify(transferenciasConLinks));
  } catch (error) {
    console.error("Error al obtener transferencias:", error);
    return [];
  }
}
