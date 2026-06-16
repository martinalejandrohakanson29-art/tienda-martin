import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

function parsePrice(str: string): number {
  // "$ 1.234,56"  →  1234.56
  if (!str) return 0
  return parseFloat(str.replace(/[^0-9,]/g, "").replace(",", ".")) || 0
}

type RawResultado = {
  mlaId: string | null
  title: string
  price: string
  originalPrice: string | null
  seller: string
  isTiendaOficial: boolean
  shippingStatus: string
  installments: string
  stock: string
  link: string
  image: string
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-scraper-secret")
  if (!secret || secret !== process.env.SCRAPER_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { tipo: string; referencia: string; keyword: string; resultados: RawResultado[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 })
  }

  const { tipo, referencia, keyword, resultados } = body
  if (!tipo || !referencia || !keyword || !Array.isArray(resultados)) {
    return Response.json({ error: "Faltan campos requeridos" }, { status: 400 })
  }

  const data = resultados
    .filter((r) => r.mlaId)
    .map((r) => ({
      tipo,
      referencia,
      keyword,
      mlaId: r.mlaId!,
      titulo: r.title || "",
      precio: parsePrice(r.price),
      precioOriginal: r.originalPrice ? parsePrice(r.originalPrice) : null,
      vendedor: r.seller || null,
      esTiendaOficial: r.isTiendaOficial || false,
      envio: r.shippingStatus || null,
      cuotas: r.installments || null,
      stock: r.stock || null,
      link: r.link || "",
      imagen: r.image || null,
    }))

  await prisma.resultadoCompetencia.createMany({ data })

  return Response.json({ ok: true, saved: data.length })
}
