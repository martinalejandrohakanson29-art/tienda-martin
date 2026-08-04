"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

export type Compatibilidad = {
    id: number
    modelo_moto: string
    kit: string
    compatible: boolean
    detalle: string | null
    fuente: string | null
    creado_en: Date
}

export async function getCompatibilidades(): Promise<Compatibilidad[]> {
    await requireAdmin()
    return prisma.$queryRaw<Compatibilidad[]>`
        SELECT id, modelo_moto, kit, compatible, detalle, fuente, creado_en
        FROM compatibilidades
        ORDER BY creado_en DESC
    `
}

export type CompatibilidadInput = {
    id?: number
    modeloMoto: string
    kit: string
    compatible: boolean
    detalle: string
}

export async function guardarCompatibilidad(data: CompatibilidadInput) {
    await requireAdmin()
    const modeloMoto = data.modeloMoto.trim()
    const kit = data.kit.trim()
    if (!modeloMoto || !kit) throw new Error("Modelo de moto y kit/pieza son obligatorios")

    if (data.id) {
        await prisma.$executeRaw`
            UPDATE compatibilidades
            SET modelo_moto = ${modeloMoto}, kit = ${kit}, compatible = ${data.compatible}, detalle = ${data.detalle}, fuente = 'admin'
            WHERE id = ${data.id}
        `
    } else {
        await prisma.$executeRaw`
            INSERT INTO compatibilidades (modelo_moto, kit, compatible, detalle, fuente)
            VALUES (${modeloMoto}, ${kit}, ${data.compatible}, ${data.detalle}, 'admin')
        `
    }
    revalidatePath("/admin/chatwoot/conocimiento")
}

export async function eliminarCompatibilidad(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM compatibilidades WHERE id = ${id}`
    revalidatePath("/admin/chatwoot/conocimiento")
}
