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
      // Ajustamos los nombres para que coincidan con el nodo HTTP Request2 de n8n
      const { 
        mla, 
        precio_final, 
        pct_descuento, 
        seller_percentage, 
        meli_percentage, 
        descuento_propio,
        precio_original // Agregamos este que incluiremos en n8n
      } = item;

      // Si no viene el MLA, saltamos este ítem
      if (!mla) continue;

      await prisma.mLDescuentos.upsert({
        where: { mla: mla },
        update: {
          original_price: precio_original ? Number(precio_original) : null,
          precio_final: precio_final ? Number(precio_final) : null,
          pct_descuento: pct_descuento ? Number(pct_descuento) : null,
          seller_percentage: seller_percentage ? Number(seller_percentage) : null,
          meli_percentage: meli_percentage ? Number(meli_percentage) : null,
          descuento_propio: descuento_propio,
          ultima_actualizacion: new Date(),
        },
        create: {
          mla: mla,
          original_price: precio_original ? Number(precio_original) : null,
          precio_final: precio_final ? Number(precio_final) : null,
          pct_descuento: pct_descuento ? Number(pct_descuento) : null,
          seller_percentage: seller_percentage ? Number(seller_percentage) : null,
          meli_percentage: meli_percentage ? Number(meli_percentage) : null,
          descuento_propio: descuento_propio,
        },
      });
    }

    return NextResponse.json({ success: true, message: "Descuentos sincronizados correctamente" });
  } catch (error: any) {
    console.error("Error en webhook descuentos:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
