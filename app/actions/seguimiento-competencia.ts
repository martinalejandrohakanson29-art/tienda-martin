"use server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Decimal } from "@prisma/client/runtime/library"

export type SeguimientoItem = {
  id: string
  tipo: "ARTICULO" | "PACK"
  nombre: string
  referencia: string
  keywordBusqueda: string | null
  activo: boolean
}

export async function getSeguimientoData(): Promise<SeguimientoItem[]> {
  const [articulos, kitGroups, maestros, packs] = await Promise.all([
    prisma.supplierProduct.findMany({
      select: { id: true, sku: true, name: true, keywordBusqueda: true, seguimientoActivo: true },
      orderBy: { name: "asc" },
    }),
    prisma.kitComponent.groupBy({
      by: ["mla"],
      _count: { id: true },
    }),
    prisma.productosMaestros.findMany({
      select: { mla: true, nombre_publicacion: true },
    }),
    prisma.seguimientoPack.findMany(),
  ])

  // Solo son packs los MLAs con más de un componente en KitComponent
  const kitMLAs = kitGroups.filter((g) => g._count.id > 1)

  const nombreMap = new Map(maestros.map((m) => [m.mla, m.nombre_publicacion]))
  const packMap = new Map(packs.map((p) => [p.mla, p]))

  const articuloItems: SeguimientoItem[] = articulos.map((a) => ({
    id: a.id,
    tipo: "ARTICULO",
    nombre: a.name,
    referencia: a.sku,
    keywordBusqueda: a.keywordBusqueda,
    activo: a.seguimientoActivo,
  }))

  const packItems: SeguimientoItem[] = kitMLAs.map((kit) => {
    const existing = packMap.get(kit.mla)
    const nombre = existing?.nombre ?? nombreMap.get(kit.mla) ?? kit.mla
    return {
      id: existing?.id ?? `pack-${kit.mla}`,
      tipo: "PACK",
      nombre,
      referencia: kit.mla,
      keywordBusqueda: existing?.keywordBusqueda ?? null,
      activo: existing?.activo ?? false,
    }
  })

  return [...articuloItems, ...packItems]
}

export async function updateArticuloSeguimiento(
  sku: string,
  keyword: string | null,
  activo: boolean
) {
  await prisma.supplierProduct.update({
    where: { sku },
    data: {
      keywordBusqueda: keyword?.trim() || null,
      seguimientoActivo: activo,
    },
  })
  revalidatePath("/admin/mercadolibre/seguimiento-competencia")
}

export async function upsertPackSeguimiento(
  mla: string,
  nombre: string,
  keyword: string | null,
  activo: boolean
) {
  await prisma.seguimientoPack.upsert({
    where: { mla },
    update: {
      keywordBusqueda: keyword?.trim() || null,
      activo,
    },
    create: {
      mla,
      nombre,
      keywordBusqueda: keyword?.trim() || null,
      activo,
    },
  })
  revalidatePath("/admin/mercadolibre/seguimiento-competencia")
}

// --- RESULTADOS ---

export type ResultadoItem = {
  mlaId: string
  titulo: string
  precio: number
  precioOriginal: number | null
  vendedor: string | null
  esTiendaOficial: boolean
  envio: string | null
  cuotas: string | null
  stock: string | null
  link: string
  imagen: string | null
}

export type ResultadoGrupo = {
  referencia: string
  tipo: string
  nombre: string
  keyword: string
  scrapedAt: Date
  resultados: ResultadoItem[]
  precioMin: number
  precioMax: number
  precioPromedio: number
}

export async function getResultadosCompetencia(): Promise<ResultadoGrupo[]> {
  // Obtener el último scrapedAt por referencia
  const ultimos = await prisma.resultadoCompetencia.groupBy({
    by: ["referencia", "tipo", "keyword"],
    _max: { scrapedAt: true },
  })

  if (ultimos.length === 0) return []

  // Para cada referencia, traer los resultados del último scraping
  const grupos = await Promise.all(
    ultimos.map(async (u) => {
      const rows = await prisma.resultadoCompetencia.findMany({
        where: {
          referencia: u.referencia,
          scrapedAt: u._max.scrapedAt!,
        },
        orderBy: { precio: "asc" },
      })

      const precios = rows.map((r) => Number(r.precio))
      const precioMin = Math.min(...precios)
      const precioMax = Math.max(...precios)
      const precioPromedio = precios.reduce((a, b) => a + b, 0) / precios.length

      // Nombre: buscar en SupplierProduct o SeguimientoPack
      let nombre = u.referencia
      if (u.tipo === "ARTICULO") {
        const sp = await prisma.supplierProduct.findUnique({
          where: { sku: u.referencia },
          select: { name: true },
        })
        if (sp) nombre = sp.name
      } else {
        const sp = await prisma.seguimientoPack.findUnique({
          where: { mla: u.referencia },
          select: { nombre: true },
        })
        if (sp) nombre = sp.nombre
      }

      return {
        referencia: u.referencia,
        tipo: u.tipo,
        nombre,
        keyword: u.keyword,
        scrapedAt: u._max.scrapedAt!,
        precioMin,
        precioMax,
        precioPromedio: Math.round(precioPromedio),
        resultados: rows.map((r) => ({
          mlaId: r.mlaId,
          titulo: r.titulo,
          precio: Number(r.precio),
          precioOriginal: r.precioOriginal ? Number(r.precioOriginal) : null,
          vendedor: r.vendedor,
          esTiendaOficial: r.esTiendaOficial,
          envio: r.envio,
          cuotas: r.cuotas,
          stock: r.stock,
          link: r.link,
          imagen: r.imagen,
        })),
      }
    })
  )

  return grupos.sort((a, b) => a.nombre.localeCompare(b.nombre))
}
