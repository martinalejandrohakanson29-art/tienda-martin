"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

export type Articulo = {
    id: number
    kit_id: number
    nombre: string
    alias: string | null
    precio: string | null
    orden: number
}

export async function getArticulos(kitId: number): Promise<Articulo[]> {
    await requireAdmin()
    return prisma.$queryRaw<Articulo[]>`
        SELECT id, kit_id, nombre, alias, precio, orden
        FROM kit_articulos
        WHERE kit_id = ${kitId}
        ORDER BY orden ASC
    `
}

export type ArticuloInput = {
    nombre: string
    alias: string
    precio: string
}

// Reemplaza todos los artículos de un kit por la lista actual del formulario
// (mismo criterio simple que sincronizarPreciosStock: borrar e insertar de
// nuevo, no hay nada más de qué colgar un diff todavía).
export async function sincronizarArticulosKit(kitId: number, articulos: ArticuloInput[]) {
    await requireAdmin()

    await prisma.$executeRaw`DELETE FROM kit_articulos WHERE kit_id = ${kitId}`

    let orden = 0
    for (const art of articulos) {
        const nombre = art.nombre.trim()
        if (!nombre) continue
        const alias = art.alias.trim() || null
        const precio = art.precio.trim() || null
        await prisma.$executeRaw`
            INSERT INTO kit_articulos (kit_id, nombre, alias, precio, orden)
            VALUES (${kitId}, ${nombre}, ${alias}, ${precio}, ${orden})
        `
        orden++
    }

    revalidatePath("/admin/chatwoot/conocimiento")
}
