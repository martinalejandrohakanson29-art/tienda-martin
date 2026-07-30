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
    await prisma.articuloMayorista.update({
        where: { id },
        data: { imageUrl },
    })
    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}

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
}) {
    await requireAdmin()
    if (data.nivelStock != null) {
        data = { ...data, nivelStock: Math.max(0, Math.min(100, Math.round(data.nivelStock))) }
    }
    await prisma.articuloMayorista.update({
        where: { id },
        data,
    })
    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}
