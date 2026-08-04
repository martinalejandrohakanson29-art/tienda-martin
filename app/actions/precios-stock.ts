"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

export type ProductoPrecio = {
    id: number
    producto: string
    precio: string | null
    stock: string | null
    detalle: string | null
    fuente: string | null
    creado_en: Date
}

// Filas con fuente 'admin-kit-*' pertenecen a un kit publicitado (pestaña Kits y
// Combos, ver app/actions/kits-publicidad.ts) y se editan desde ahí, no acá.
export async function getPreciosStock(): Promise<ProductoPrecio[]> {
    await requireAdmin()
    return prisma.$queryRaw<ProductoPrecio[]>`
        SELECT id, producto, precio, stock, detalle, fuente, creado_en
        FROM precios_stock
        WHERE fuente IS NULL OR fuente NOT LIKE 'admin-kit-%'
        ORDER BY creado_en DESC
    `
}

export type ProductoPrecioInput = {
    id?: number
    producto: string
    precio: string
    stock: string
    detalle: string
}

export async function guardarPrecioStock(data: ProductoPrecioInput) {
    await requireAdmin()
    const producto = data.producto.trim()
    if (!producto) throw new Error("El producto es obligatorio")

    if (data.id) {
        await prisma.$executeRaw`
            UPDATE precios_stock
            SET producto = ${producto}, precio = ${data.precio}, stock = ${data.stock}, detalle = ${data.detalle}, fuente = 'admin'
            WHERE id = ${data.id}
        `
    } else {
        await prisma.$executeRaw`
            INSERT INTO precios_stock (producto, precio, stock, detalle, fuente)
            VALUES (${producto}, ${data.precio}, ${data.stock}, ${data.detalle}, 'admin')
        `
    }
    revalidatePath("/admin/chatwoot/conocimiento")
}

export async function eliminarPrecioStock(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM precios_stock WHERE id = ${id}`
    revalidatePath("/admin/chatwoot/conocimiento")
}
