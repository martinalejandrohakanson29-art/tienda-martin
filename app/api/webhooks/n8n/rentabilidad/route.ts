// app/api/webhooks/n8n/rentabilidad/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

export async function POST(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];

    for (const item of items) {
      const { item_id, price, title } = item;

      if (!item_id) continue;

      // Actualizamos y nos aseguramos de que el estado sea 'active'
      await prisma.productosMaestros.updateMany({
        where: { mla: item_id },
        data: {
          precio_venta_ml: Number(price),
          nombre_publicacion: title,
          estado: "active", // Si n8n lo mandó en este workflow, es porque está activo
          ultima_actualizacion: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, message: "Precios y estados actualizados" });
  } catch (error: any) {
    console.error("Error en webhook rentabilidad:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
