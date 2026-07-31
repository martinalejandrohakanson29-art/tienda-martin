"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

// Público: catálogo visible en /mayoristas
export async function getArticulosMayoristasPublicos() {
    const articulos = await prisma.articuloMayorista.findMany({
        where: { activo: true },
        orderBy: { orden: "asc" },
    })
    return articulos.map(a => ({ ...a, precio: Number(a.precio) }))
}

// Admin: todos los artículos, para el panel de gestión
export async function getArticulosMayoristasAdmin() {
    await requireAdmin()
    const articulos = await prisma.articuloMayorista.findMany({
        orderBy: { orden: "asc" },
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

// Busca artículos mostrador (incluye packs) por nombre o código de proveedor, para vincular
export async function buscarArticulosMostradorParaVincular(query: string) {
    await requireAdmin()
    if (!query.trim()) return []
    const articulos = await prisma.articuloMostrador.findMany({
        where: {
            OR: [
                { nombre: { contains: query, mode: "insensitive" } },
                { codigoProveedor: { contains: query, mode: "insensitive" } },
            ],
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

// Vincula la fila `id` como variante (ej. otra medida) de la fila `articuloDestinoId`,
// reusando el id de esta última como identificador del grupo si todavía no tenía uno,
// y copiando sobre `id` los datos compartidos del grupo (ver CAMPOS_COMPARTIDOS_VARIANTE + foto).
export async function agruparVariante(id: string, articuloDestinoId: string) {
    await requireAdmin()
    if (id === articuloDestinoId) return

    const destino = await prisma.articuloMayorista.findUniqueOrThrow({
        where: { id: articuloDestinoId },
        select: { id: true, grupoVarianteId: true, categoria: true, nombre: true, titulo: true, descripcion: true, marca: true, imageUrl: true },
    })
    const grupoVarianteId = destino.grupoVarianteId ?? destino.id

    if (!destino.grupoVarianteId) {
        await prisma.articuloMayorista.update({ where: { id: destino.id }, data: { grupoVarianteId } })
    }
    await prisma.articuloMayorista.update({
        where: { id },
        data: {
            grupoVarianteId,
            categoria: destino.categoria,
            nombre: destino.nombre,
            titulo: destino.titulo,
            descripcion: destino.descripcion,
            marca: destino.marca,
            imageUrl: destino.imageUrl,
        },
    })

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
