"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

const RUTA = "/admin/chatwoot/catalogo"

// --- Artículos ---

export type ChatArticulo = {
    id: number
    nombre: string
    alias: string | null
    precio: number | null
    detalle: string | null
    activo: boolean
    creado_en: Date
}

export type ChatArticuloInput = {
    id?: number
    nombre: string
    alias: string
    precio: string // vacío = no se vende suelto
    detalle: string
    activo: boolean
}

function parsePrecio(precio: string): number | null {
    const limpio = precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")
    if (!limpio) return null
    const n = Number(limpio)
    return isNaN(n) ? null : n
}

export async function getChatArticulos(): Promise<ChatArticulo[]> {
    await requireAdmin()
    return prisma.$queryRaw<ChatArticulo[]>`
        SELECT id, nombre, alias, precio, detalle, activo, creado_en
        FROM chat_articulos
        ORDER BY nombre ASC
    `
}

export async function guardarChatArticulo(data: ChatArticuloInput) {
    await requireAdmin()

    const nombre = data.nombre.trim()
    if (!nombre) throw new Error("El nombre del artículo es obligatorio")

    const alias = data.alias.trim() || null
    const precio = parsePrecio(data.precio)
    const detalle = data.detalle.trim() || null

    let id = data.id
    if (id) {
        await prisma.$executeRaw`
            UPDATE chat_articulos
            SET nombre = ${nombre}, alias = ${alias}, precio = ${precio}, detalle = ${detalle}, activo = ${data.activo}
            WHERE id = ${id}
        `
    } else {
        const inserted = await prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO chat_articulos (nombre, alias, precio, detalle, activo)
            VALUES (${nombre}, ${alias}, ${precio}, ${detalle}, ${data.activo})
            RETURNING id
        `
        id = inserted[0].id
    }

    revalidatePath(RUTA)
    return { success: true, id }
}

export async function eliminarChatArticulo(id: number) {
    await requireAdmin()

    const enUso = await prisma.$queryRaw<{ pack_nombre: string }[]>`
        SELECT p.nombre AS pack_nombre
        FROM chat_pack_articulos pa
        JOIN chat_packs p ON p.id = pa.pack_id
        WHERE pa.articulo_id = ${id}
    `
    if (enUso.length > 0) {
        const packs = enUso.map((r) => r.pack_nombre).join(", ")
        throw new Error(`Este artículo está enganchado a: ${packs}. Sacalo del pack antes de borrarlo.`)
    }

    await prisma.$executeRaw`DELETE FROM chat_articulos WHERE id = ${id}`
    revalidatePath(RUTA)
}

export async function alternarActivoChatArticulo(id: number, activo: boolean) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE chat_articulos SET activo = ${activo} WHERE id = ${id}`
    revalidatePath(RUTA)
}

// --- Packs ---

export type ChatPackComponente = {
    articulo_id: number
    nombre: string
    alias: string | null
    precio: number | null
    cantidad: number
    orden: number
}

export type ChatPack = {
    id: number
    nombre: string
    precio: number
    envio: string | null
    mensaje_bienvenida: string
    foto_url: string | null
    plantillas_bienvenida: string | null
    activo: boolean
    creado_en: Date
    componentes: ChatPackComponente[]
}

export type ChatPackInput = {
    id?: number
    nombre: string
    precio: string
    envio: string
    mensajeBienvenida: string
    fotoUrl: string
    plantillasBienvenida: string
    activo: boolean
}

export type ChatPackComponenteInput = {
    articuloId: number
    cantidad: number
}

export async function getChatPacks(): Promise<ChatPack[]> {
    await requireAdmin()

    const packs = await prisma.$queryRaw<Omit<ChatPack, "componentes">[]>`
        SELECT id, nombre, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, activo, creado_en
        FROM chat_packs
        ORDER BY creado_en DESC
    `
    if (packs.length === 0) return []

    const componentes = await prisma.$queryRaw<(ChatPackComponente & { pack_id: number })[]>`
        SELECT pa.pack_id, pa.articulo_id, a.nombre, a.alias, a.precio, pa.cantidad, pa.orden
        FROM chat_pack_articulos pa
        JOIN chat_articulos a ON a.id = pa.articulo_id
        ORDER BY pa.pack_id, pa.orden ASC
    `

    return packs.map((pack) => ({
        ...pack,
        componentes: componentes.filter((c) => c.pack_id === pack.id),
    }))
}

export async function guardarChatPack(data: ChatPackInput, componentes: ChatPackComponenteInput[]) {
    await requireAdmin()

    const nombre = data.nombre.trim()
    const mensajeBienvenida = data.mensajeBienvenida.trim()
    if (!nombre) throw new Error("El nombre del pack es obligatorio")
    if (!mensajeBienvenida) throw new Error("El mensaje predefinido es obligatorio")

    const precio = parsePrecio(data.precio) ?? 0
    const envio = data.envio.trim() || null
    const fotoUrl = data.fotoUrl.trim() || null
    const plantillasBienvenida = data.plantillasBienvenida.trim() || null

    let packId = data.id
    if (packId) {
        await prisma.$executeRaw`
            UPDATE chat_packs
            SET nombre = ${nombre}, precio = ${precio}, envio = ${envio},
                mensaje_bienvenida = ${mensajeBienvenida}, foto_url = ${fotoUrl},
                plantillas_bienvenida = ${plantillasBienvenida}, activo = ${data.activo}
            WHERE id = ${packId}
        `
    } else {
        const inserted = await prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO chat_packs (nombre, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, activo)
            VALUES (${nombre}, ${precio}, ${envio}, ${mensajeBienvenida}, ${fotoUrl}, ${plantillasBienvenida}, ${data.activo})
            RETURNING id
        `
        packId = inserted[0].id
    }

    await prisma.$executeRaw`DELETE FROM chat_pack_articulos WHERE pack_id = ${packId}`
    let orden = 0
    for (const comp of componentes) {
        await prisma.$executeRaw`
            INSERT INTO chat_pack_articulos (pack_id, articulo_id, cantidad, orden)
            VALUES (${packId}, ${comp.articuloId}, ${comp.cantidad}, ${orden})
        `
        orden++
    }

    revalidatePath(RUTA)
    return { success: true, id: packId }
}

export async function eliminarChatPack(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM chat_packs WHERE id = ${id}`
    revalidatePath(RUTA)
}

export async function alternarActivoChatPack(id: number, activo: boolean) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE chat_packs SET activo = ${activo} WHERE id = ${id}`
    revalidatePath(RUTA)
}
