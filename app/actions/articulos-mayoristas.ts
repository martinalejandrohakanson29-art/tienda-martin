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
                select: { id: true, nombre: true, costo: true, esPack: true },
            },
        },
    })
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
        select: { id: true, nombre: true, costo: true, esPack: true, codigoProveedor: true },
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
    categoria?: string
    marca?: string | null
    codigo?: string
    precio?: number
    activo?: boolean
}) {
    await requireAdmin()
    await prisma.articuloMayorista.update({
        where: { id },
        data,
    })
    revalidatePath("/admin/listas/mayoristas")
    revalidatePath("/mayoristas")
}
