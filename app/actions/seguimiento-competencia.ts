"use server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

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
