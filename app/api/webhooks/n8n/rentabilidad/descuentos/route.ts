import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];

    for (const item of items) {
      const { 
        item_id, 
        "precio final": precio_final, 
        pct_descuento, 
        seller_percentage, 
        meli_percentage, 
        descuento_propio,
        precio_standard // Tomamos este como el original
      } = item;

      if (!item_id) continue;

      await prisma.mLDescuentos.upsert({
        where: { mla: item_id },
        update: {
          original_price: precio_standard,
          precio_final: precio_final,
          pct_descuento: pct_descuento,
          seller_percentage: seller_percentage,
          meli_percentage: meli_percentage,
          descuento_propio: descuento_propio,
          ultima_actualizacion: new Date(),
        },
        create: {
          mla: item_id,
          original_price: precio_standard,
          precio_final: precio_final,
          pct_descuento: pct_descuento,
          seller_percentage: seller_percentage,
          meli_percentage: meli_percentage,
          descuento_propio: descuento_propio,
        },
      });
    }

    return NextResponse.json({ success: true, message: "Descuentos actualizados" });
  } catch (error: any) {
    console.error("Error en webhook descuentos:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
