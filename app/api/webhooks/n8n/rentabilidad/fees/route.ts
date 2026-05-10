// app/api/webhooks/n8n/rentabilidad/fees/route.ts
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
      const { 
        item_id, 
        cargo_venta_ars, 
        cargo_venta_porc, 
        cuotas_ars, 
        cuotas_porc, 
        envio, 
        costo_fijo 
      } = item;

      if (!item_id) continue;

      // Usamos upsert: si existe lo actualiza, si no lo crea
      await prisma.mLFees.upsert({
        where: { mla: item_id },
        update: {
          cargo_venta_fijo: cargo_venta_ars,
          cargo_venta_percent: cargo_venta_porc,
          cuotas_fijo: cuotas_ars,
          cuotas_percent: cuotas_porc,
          envio_costo: envio,
          costo_fijo_ml: costo_fijo,
          ultima_actualizacion: new Date(),
        },
        create: {
          mla: item_id,
          cargo_venta_fijo: cargo_venta_ars,
          cargo_venta_percent: cargo_venta_porc,
          cuotas_fijo: cuotas_ars,
          cuotas_percent: cuotas_porc,
          envio_costo: envio,
          costo_fijo_ml: costo_fijo,
        },
      });
    }

    return NextResponse.json({ success: true, message: "Cargos actualizados" });
  } catch (error: any) {
    console.error("Error en webhook fees:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
