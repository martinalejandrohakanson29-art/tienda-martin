import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

// Recibe los candidatos a la campaña "CAMPAÑA MELI +" (type: DEAL) que n8n
// obtiene de GET /seller-promotions/items/{mla}?app_version=v2. Reemplaza
// la tabla completa en cada corrida: lo que no vuelve a llegar ya no es candidato.
export async function POST(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];

    await prisma.$transaction([
      prisma.mLMeliPlus.deleteMany({}),
      ...items
        .filter((item) => item.mla)
        .map((item) =>
          prisma.mLMeliPlus.create({
            data: {
              mla: item.mla,
              original_price: item.original_price ? Number(item.original_price) : null,
              min_discounted_price: item.min_discounted_price ? Number(item.min_discounted_price) : null,
              max_discounted_price: item.max_discounted_price ? Number(item.max_discounted_price) : null,
              suggested_discounted_price: item.suggested_discounted_price ? Number(item.suggested_discounted_price) : null,
              start_date: item.start_date ? new Date(item.start_date) : null,
              finish_date: item.finish_date ? new Date(item.finish_date) : null,
              status: item.status || null,
            },
          })
        ),
    ]);

    return NextResponse.json({ success: true, message: `${items.length} candidatos Meli+ sincronizados` });
  } catch (error: any) {
    console.error("Error en webhook meli-plus:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
