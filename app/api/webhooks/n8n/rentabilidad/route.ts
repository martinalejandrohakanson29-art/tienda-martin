// app/api/webhooks/n8n/rentabilidad/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // n8n enviará un array de items o un item individual
    // Lo normalizamos para procesar siempre como una lista
    const items = Array.isArray(body) ? body : [body];

    console.log(`Recibidos ${items.length} items desde n8n`);

    for (const item of items) {
      const { item_id, price, title } = item;

      if (!item_id) continue;

      // Buscamos si el producto existe por su MLA
      // Usamos updateMany porque un MLA podría tener variaciones (aunque aquí simplificamos)
      await prisma.productosMaestros.updateMany({
        where: {
          mla: item_id,
        },
        data: {
          precio_venta_ml: Number(price),
          nombre_publicacion: title, // Aprovechamos para actualizar el título si cambió
          ultima_actualizacion: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, message: "Precios actualizados" });
  } catch (error: any) {
    console.error("Error en webhook rentabilidad:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
