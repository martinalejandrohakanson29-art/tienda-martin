import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-scraper-secret")
  if (!secret || secret !== process.env.SCRAPER_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [articulos, packs] = await Promise.all([
    prisma.supplierProduct.findMany({
      where: { seguimientoActivo: true, keywordBusqueda: { not: null } },
      select: { sku: true, name: true, keywordBusqueda: true },
    }),
    prisma.seguimientoPack.findMany({
      where: { activo: true, keywordBusqueda: { not: null } },
      select: { mla: true, nombre: true, keywordBusqueda: true },
    }),
  ])

  const items = [
    ...articulos.map((a) => ({
      tipo: "ARTICULO",
      referencia: a.sku,
      nombre: a.name,
      keyword: a.keywordBusqueda!,
    })),
    ...packs.map((p) => ({
      tipo: "PACK",
      referencia: p.mla,
      nombre: p.nombre,
      keyword: p.keywordBusqueda!,
    })),
  ]

  return Response.json({ items, total: items.length })
}
