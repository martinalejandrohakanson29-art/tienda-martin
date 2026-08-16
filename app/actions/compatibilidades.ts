"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { parsearListaCompat } from "@/lib/compatibilidad-texto"

export type Compatibilidad = {
    id: number
    modelo_moto: string
    kit: string
    kit_id: number | null
    compatible: boolean
    detalle: string | null
    fuente: string | null
    creado_en: Date
}

export async function getCompatibilidades(): Promise<Compatibilidad[]> {
    await requireAdmin()
    return prisma.$queryRaw<Compatibilidad[]>`
        SELECT id, modelo_moto, kit, kit_id, compatible, detalle, fuente, creado_en
        FROM compatibilidades
        ORDER BY creado_en DESC
    `
}

export type CompatibilidadInput = {
    id?: number
    modeloMoto: string
    kitId: number
    compatible: boolean
    detalle: string
}

// El kit se elige de un desplegable (kits_publicidad), nunca se tipea:
// asi toda fila nace atada a un kit real y nunca a un texto parecido a uno.
// `kit` (texto) se sigue guardando igual, en sincronia con el nombre del
// kit elegido, solo para mostrarlo en la tabla del admin sin otro join.
export async function guardarCompatibilidad(data: CompatibilidadInput) {
    await requireAdmin()
    const modeloMoto = data.modeloMoto.trim()
    if (!modeloMoto || !data.kitId) throw new Error("Modelo de moto y kit son obligatorios")

    const [kit] = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM kits_publicidad WHERE id = ${data.kitId}
    `
    if (!kit) throw new Error("El kit seleccionado no existe")

    if (data.id) {
        await prisma.$executeRaw`
            UPDATE compatibilidades
            SET modelo_moto = ${modeloMoto}, kit = ${kit.nombre}, kit_id = ${data.kitId}, compatible = ${data.compatible}, detalle = ${data.detalle}, fuente = 'admin'
            WHERE id = ${data.id}
        `
    } else {
        await prisma.$executeRaw`
            INSERT INTO compatibilidades (modelo_moto, kit, kit_id, compatible, detalle, fuente)
            VALUES (${modeloMoto}, ${kit.nombre}, ${data.kitId}, ${data.compatible}, ${data.detalle}, 'admin')
        `
    }
    revalidatePath("/admin/chatwoot/conocimiento")
}

export async function eliminarCompatibilidad(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM compatibilidades WHERE id = ${id}`
    revalidatePath("/admin/chatwoot/conocimiento")
}

// Reemplaza todas las filas de compatibilidad de un kit por lo que dicen los dos
// textareas (compatibles / no compatibles) del formulario del kit. Compara por
// (compatible, modelo, detalle): lo que ya no está en el texto se borra de la
// base real que usa el bot, lo nuevo se inserta, y lo que sigue igual no se toca.
export async function sincronizarCompatibilidadesKit(
    kitId: number,
    compatiblesTexto: string,
    incompatiblesTexto: string
) {
    await requireAdmin()

    const [kit] = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM kits_publicidad WHERE id = ${kitId}
    `
    if (!kit) throw new Error("El kit seleccionado no existe")

    const deseados = [
        ...parsearListaCompat(compatiblesTexto).map((it) => ({ ...it, compatible: true })),
        ...parsearListaCompat(incompatiblesTexto).map((it) => ({ ...it, compatible: false })),
    ]
    const clave = (modelo: string, detalle: string, compatible: boolean) =>
        `${compatible}::${modelo.trim().toLowerCase()}::${detalle.trim().toLowerCase()}`

    const deseadosMap = new Map(deseados.map((it) => [clave(it.modelo, it.detalle, it.compatible), it]))

    const existentes = await prisma.$queryRaw<
        { id: number; modelo_moto: string; detalle: string | null; compatible: boolean }[]
    >`SELECT id, modelo_moto, detalle, compatible FROM compatibilidades WHERE kit_id = ${kitId}`
    const existentesMap = new Map(existentes.map((e) => [clave(e.modelo_moto, e.detalle || "", e.compatible), e]))

    for (const e of existentes) {
        const k = clave(e.modelo_moto, e.detalle || "", e.compatible)
        if (!deseadosMap.has(k)) {
            await prisma.$executeRaw`DELETE FROM compatibilidades WHERE id = ${e.id}`
        }
    }

    for (const [k, it] of deseadosMap) {
        const ex = existentesMap.get(k)
        if (ex) {
            await prisma.$executeRaw`UPDATE compatibilidades SET kit = ${kit.nombre} WHERE id = ${ex.id}`
        } else {
            await prisma.$executeRaw`
                INSERT INTO compatibilidades (modelo_moto, kit, kit_id, compatible, detalle, fuente)
                VALUES (${it.modelo}, ${kit.nombre}, ${kitId}, ${it.compatible}, ${it.detalle}, 'admin')
            `
        }
    }

    revalidatePath("/admin/chatwoot/conocimiento")
}
