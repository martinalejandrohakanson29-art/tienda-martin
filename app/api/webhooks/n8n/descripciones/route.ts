// app/api/webhooks/n8n/descripciones/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

export async function POST(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];

    const operaciones: any[] = [];

    for (const item of items) {
      // Aceptamos varios nombres de campo por flexibilidad con n8n
      const mla: string = (item.item_id || item.mla || item.id || "").toString().trim().toUpperCase();
      if (!mla) continue;

      const titulo: string | null = item.title ?? item.titulo ?? null;
      const descripcion: string = (item.description ?? item.descripcion ?? item.plain_text ?? "").toString();
      const permalink: string | null = item.permalink ?? item.link ?? null;
      const estado: string = (item.status ?? item.estado ?? "active").toString();

      operaciones.push(
        prisma.descripcionPublicacion.upsert({
          where: { mla },
          update: {
            titulo,
            descripcion,
            permalink,
            estado,
            fecha_actualizacion: new Date(),
          },
          create: {
            mla,
            titulo,
            descripcion,
            permalink,
            estado,
          },
        })
      );
    }

    if (operaciones.length === 0) {
      return NextResponse.json({ success: true, guardadas: 0, message: "Sin descripciones válidas" });
    }

    await prisma.$transaction(operaciones);

    return NextResponse.json({ success: true, guardadas: operaciones.length });
  } catch (error: any) {
    console.error("Error en webhook descripciones:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
