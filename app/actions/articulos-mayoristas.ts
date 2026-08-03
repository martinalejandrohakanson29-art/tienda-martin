"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import type { ArticuloMayorista } from "@prisma/client"

// Público: catálogo visible en /mayoristas
export async function getArticulosMayoristasPublicos() {
    const articulos = await prisma.articuloMayorista.findMany({
        where: { activo: true },
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    })
    return articulos.map(a => ({ ...a, precio: Number(a.precio) }))
}

// Admin: todos los artículos, para el panel de gestión
export async function getArticulosMayoristasAdmin() {
    await requireAdmin()
    const articulos = await prisma.articuloMayorista.findMany({
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
        include: {
            articuloMostrador: {
                select: { id: true, nombre: true, costo: true, esPack: true, stock: true },
            },
        },
    })

    // El campo `codigo` se carga con el id real de ArticuloMostrador, pero el
    // vínculo articuloMostradorId no se persistía solo. Autovinculamos acá.
    const sinVincular = articulos.filter(a => !a.articuloMostradorId)
    if (sinVincular.length > 0) {
        const candidatos = await prisma.articuloMostrador.findMany({
            where: { id: { in: sinVincular.map(a => a.codigo) } },
            select: { id: true, nombre: true, costo: true, esPack: true, stock: true },
        })
        const porId = new Map(candidatos.map(c => [c.id, c]))
        const paraActualizar = sinVincular.filter(a => porId.has(a.codigo))
        if (paraActualizar.length > 0) {
            await prisma.$transaction(
                paraActualizar.map(a =>
                    prisma.articuloMayorista.update({
                        where: { id: a.id },
                        data: { articuloMostradorId: a.codigo },
                    })
                )
            )
            for (const a of paraActualizar) {
                a.articuloMostrador = porId.get(a.codigo)!
            }
        }
    }

    // El nombre ya cargado es, hoy, el título: si todavía no se cargó un título propio,
    // lo autocompletamos con el nombre (solo queda pendiente escribir la descripción a mano).
    const sinTitulo = articulos.filter(a => !a.titulo)
    if (sinTitulo.length > 0) {
        await prisma.$transaction(
            sinTitulo.map(a =>
                prisma.articuloMayorista.update({
                    where: { id: a.id },
                    data: { titulo: a.nombre },
                })
            )
        )
        for (const a of sinTitulo) {
            a.titulo = a.nombre
        }
    }

    return articulos.map(a => ({
        ...a,
        precio: Number(a.precio),
        articuloMostrador: a.articuloMostrador
            ? { ...a.articuloMostrador, costo: Number(a.articuloMostrador.costo || 0) }
            : null,
    }))
}

// Busca artículos mostrador (incluye packs) por nombre o código de proveedor, para vincular.
// Cada palabra del query se busca por separado (AND entre palabras, sin importar el orden),
// así "keihin metal" encuentra igual "metal keihin" o "kit metal x keihin".
export async function buscarArticulosMostradorParaVincular(query: string) {
    await requireAdmin()
    const palabras = query.trim().split(/\s+/).filter(Boolean)
    if (palabras.length === 0) return []
    const articulos = await prisma.articuloMostrador.findMany({
        where: {
            AND: palabras.map(palabra => ({
                OR: [
                    { nombre: { contains: palabra, mode: "insensitive" as const } },
                    { codigoProveedor: { contains: palabra, mode: "insensitive" as const } },
                ],
            })),
        },
        select: { id: true, nombre: true, costo: true, esPack: true, codigoProveedor: true, stock: true },
        orderBy: { nombre: "asc" },
        take: 25,
    })
    return articulos.map(a => ({ ...a, costo: Number(a.costo || 0) }))
}

export async function vincularArticuloMostrador(id: string, articuloMostradorId: string | null) {
    await requireAdmin()
    await prisma.articuloMayorista.update({
        where: { id },
        data: { articuloMostradorId },
    })
    revalidatePath("/admin/listas/mayoristas")
}

export async function actualizarImagenMayorista(id: string, imageUrl: string) {
    await requireAdmin()
    const actualizado = await prisma.articuloMayorista.update({
        where: { id },
        data: { imageUrl },
        select: { grupoVarianteId: true },
    })
    if (actualizado.grupoVarianteId) {
        await prisma.articuloMayorista.updateMany({
            where: { grupoVarianteId: actualizado.grupoVarianteId, id: { not: id } },
            data: { imageUrl },
        })
    }
    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}

// Campos que se comparten entre todas las variantes de un mismo grupo (ver grupoVarianteId):
// al editarlos en una fila, se propagan al resto del grupo para que el card público
// (que toma estos datos de la primera variante) quede consistente.
const CAMPOS_COMPARTIDOS_VARIANTE = ["categoria", "nombre", "titulo", "descripcion", "marca"] as const

export async function actualizarArticuloMayorista(id: string, data: {
    nombre?: string
    titulo?: string | null
    descripcion?: string | null
    categoria?: string
    marca?: string | null
    codigo?: string
    precio?: number
    activo?: boolean
    nivelStock?: number
    variante?: string | null
}) {
    await requireAdmin()
    if (data.nivelStock != null) {
        data = { ...data, nivelStock: Math.max(0, Math.min(100, Math.round(data.nivelStock))) }
    }
    const actualizado = await prisma.articuloMayorista.update({
        where: { id },
        data,
        select: { grupoVarianteId: true },
    })

    const patchCompartido: Record<string, unknown> = {}
    for (const campo of CAMPOS_COMPARTIDOS_VARIANTE) {
        if (campo in data) patchCompartido[campo] = (data as Record<string, unknown>)[campo]
    }
    if (actualizado.grupoVarianteId && Object.keys(patchCompartido).length > 0) {
        await prisma.articuloMayorista.updateMany({
            where: { grupoVarianteId: actualizado.grupoVarianteId, id: { not: id } },
            data: patchCompartido,
        })
    }

    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}

const REGEX_VARIANTE = /\d+(?:[.,]\d+)?\s?(?:mm|cm|ml|kg|lts?|l)?\b/i

// Extrae la etiqueta de variante (ej. "26") del nombre real del artículo mostrador elegido,
// tomando el primer número que aparece (con su unidad pegada si la tiene, ej. "12mm").
// Ej: "Carburador 26 Keihin Plano Cuba Metal" -> "26".
function extraerVarianteDeNombre(nombre: string): string | null {
    const match = nombre.match(REGEX_VARIANTE)
    return match ? match[0].trim() : null
}

// Igual que extraerVarianteDeNombre, pero además devuelve el nombre sin ese número/unidad
// (el "nombre base" de la familia). Ej: "Codo Adm Inclinado Cg 30mm" -> variante "30mm",
// base "Codo Adm Inclinado Cg".
function extraerVarianteYBase(nombre: string): { variante: string | null; base: string } {
    const match = nombre.match(REGEX_VARIANTE)
    if (!match || match.index == null) return { variante: null, base: nombre }
    const base = (nombre.slice(0, match.index) + nombre.slice(match.index + match[0].length))
        .replace(/\s{2,}/g, " ")
        .trim()
    return { variante: match[0].trim(), base: base || nombre }
}

// Crea un artículo nuevo (sin grupo de variantes) en la lista mayorista, a partir de un artículo
// real elegido en Artículos Mostrador. Nombre/título salen del nombre real; precio arranca en 0 y
// foto vacía, a completar a mano (mismo flujo de siempre para artículos recién agregados).
export async function crearArticuloMayorista(articuloMostradorId: string, categoria: string) {
    await requireAdmin()

    const maestro = await prisma.articuloMostrador.findUniqueOrThrow({
        where: { id: articuloMostradorId },
        select: { id: true, nombre: true, costo: true, esPack: true, stock: true },
    })

    const creado = await prisma.articuloMayorista.create({
        data: {
            categoria: categoria.trim(),
            nombre: maestro.nombre,
            titulo: maestro.nombre,
            codigo: maestro.id,
            precio: 0,
            imageUrl: "",
            articuloMostradorId: maestro.id,
        },
    })

    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")

    return {
        ...creado,
        precio: Number(creado.precio),
        articuloMostrador: { ...maestro, costo: Number(maestro.costo || 0) },
    }
}

// Crea varios artículos nuevos de una sola vez, ya agrupados como variantes entre sí (ej. las 4
// medidas de un mismo codo de admisión). El título compartido del grupo sale de sacarle el número
// de variante al nombre real del primer artículo elegido (ver extraerVarianteYBase); cada fila
// se linkea a su propio artículo mostrador y saca su etiqueta de variante del mismo modo.
export async function crearGrupoVariantes(articulosMostradorIds: string[], categoria: string) {
    await requireAdmin()
    if (articulosMostradorIds.length === 0) return []

    const maestros = await prisma.articuloMostrador.findMany({
        where: { id: { in: articulosMostradorIds } },
        select: { id: true, nombre: true, costo: true, esPack: true, stock: true },
    })
    const porId = new Map(maestros.map(m => [m.id, m]))
    const ordenados = articulosMostradorIds.map(id => porId.get(id)).filter((m): m is NonNullable<typeof m> => !!m)
    if (ordenados.length === 0) return []

    const catTrim = categoria.trim()
    const { base: titulo } = extraerVarianteYBase(ordenados[0].nombre)

    const creados = await prisma.$transaction(async (tx) => {
        const filas: ArticuloMayorista[] = []
        let grupoVarianteId: string | null = null
        for (const maestro of ordenados) {
            const { variante } = extraerVarianteYBase(maestro.nombre)
            const fila: ArticuloMayorista = await tx.articuloMayorista.create({
                data: {
                    categoria: catTrim,
                    nombre: titulo,
                    titulo,
                    codigo: maestro.id,
                    precio: 0,
                    imageUrl: "",
                    articuloMostradorId: maestro.id,
                    variante,
                    grupoVarianteId,
                },
            })
            if (!grupoVarianteId) {
                grupoVarianteId = fila.id
                await tx.articuloMayorista.update({ where: { id: fila.id }, data: { grupoVarianteId } })
            }
            filas.push({ ...fila, grupoVarianteId })
        }
        return filas
    })

    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")

    return creados.map(fila => ({
        ...fila,
        precio: Number(fila.precio),
        articuloMostrador: (() => {
            const m = porId.get(fila.articuloMostradorId!)!
            return { ...m, costo: Number(m.costo || 0) }
        })(),
    }))
}

// Crea una nueva fila de ArticuloMayorista como variante (ej. otra medida) de `articuloDestinoId`,
// vinculada a `articuloMostradorId` (el artículo real elegido en Artículos Mostrador, de donde
// sale su costo/stock propio). Reusa el id de la fila destino como identificador del grupo si
// todavía no tenía uno, y copia los datos compartidos del grupo (ver CAMPOS_COMPARTIDOS_VARIANTE + foto).
// La etiqueta de variante se autocompleta desde el nombre real (ver extraerVarianteDeNombre).
export async function agregarVariante(articuloDestinoId: string, articuloMostradorId: string) {
    await requireAdmin()

    const [destino, maestro] = await Promise.all([
        prisma.articuloMayorista.findUniqueOrThrow({
            where: { id: articuloDestinoId },
            select: {
                grupoVarianteId: true, categoria: true, nombre: true, titulo: true,
                descripcion: true, marca: true, imageUrl: true, precio: true,
                nivelStock: true, orden: true, activo: true,
            },
        }),
        prisma.articuloMostrador.findUniqueOrThrow({
            where: { id: articuloMostradorId },
            select: { id: true, nombre: true, costo: true, esPack: true, stock: true },
        }),
    ])

    const grupoVarianteId = destino.grupoVarianteId ?? articuloDestinoId
    if (!destino.grupoVarianteId) {
        await prisma.articuloMayorista.update({ where: { id: articuloDestinoId }, data: { grupoVarianteId } })
    }

    const creado = await prisma.articuloMayorista.create({
        data: {
            categoria: destino.categoria,
            nombre: destino.nombre,
            titulo: destino.titulo,
            descripcion: destino.descripcion,
            marca: destino.marca,
            codigo: maestro.id,
            precio: destino.precio,
            imageUrl: destino.imageUrl,
            orden: destino.orden,
            activo: destino.activo,
            nivelStock: destino.nivelStock,
            articuloMostradorId: maestro.id,
            grupoVarianteId,
            variante: extraerVarianteDeNombre(maestro.nombre),
        },
    })

    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")

    return {
        ...creado,
        precio: Number(creado.precio),
        articuloMostrador: { ...maestro, costo: Number(maestro.costo || 0) },
    }
}

// Elimina la fila de la lista mayorista. Si era parte de un grupo de variantes y queda una sola
// fila restante, ese grupo se desarma también (un "grupo" de una sola fila no tiene sentido).
export async function eliminarArticuloMayorista(id: string) {
    await requireAdmin()
    const eliminado = await prisma.articuloMayorista.delete({
        where: { id },
        select: { grupoVarianteId: true },
    })

    if (eliminado.grupoVarianteId) {
        const restantes = await prisma.articuloMayorista.findMany({
            where: { grupoVarianteId: eliminado.grupoVarianteId },
            select: { id: true },
        })
        if (restantes.length === 1) {
            await prisma.articuloMayorista.update({
                where: { id: restantes[0].id },
                data: { grupoVarianteId: null, variante: null },
            })
        }
    }

    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}

export async function desagruparVariante(id: string) {
    await requireAdmin()
    const fila = await prisma.articuloMayorista.findUniqueOrThrow({
        where: { id },
        select: { grupoVarianteId: true },
    })

    await prisma.articuloMayorista.update({
        where: { id },
        data: { grupoVarianteId: null, variante: null },
    })

    if (fila.grupoVarianteId) {
        const restantes = await prisma.articuloMayorista.findMany({
            where: { grupoVarianteId: fila.grupoVarianteId },
            select: { id: true },
        })
        // Un "grupo" de una sola fila no tiene sentido: se desarma también.
        if (restantes.length === 1) {
            await prisma.articuloMayorista.update({
                where: { id: restantes[0].id },
                data: { grupoVarianteId: null, variante: null },
            })
        }
    }

    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}
