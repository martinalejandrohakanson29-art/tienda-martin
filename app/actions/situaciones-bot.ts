"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { invalidarCacheSituaciones } from "@/bot-agente/situaciones"

/**
 * CRUD de `chat_situaciones`: las reglas situacionales editables del bot
 * (descuento, mayorista, "sos un bot?", etc.). Agregar un caso nuevo aca es
 * lo que reemplaza a escribir un parrafo nuevo en el prompt del sistema.
 *
 * Requiere haber corrido n8n-workflows/chat-situaciones.sql una vez.
 */

export interface SituacionRow {
    id: number
    clave: string
    titulo: string
    disparadores: string[]
    instruccion: string
    activo: boolean
    orden: number
}

export async function listarSituaciones(): Promise<{ existeTabla: boolean; situaciones: SituacionRow[] }> {
    await requireAdmin()
    try {
        const filas = await prisma.$queryRaw<SituacionRow[]>`
            SELECT id, clave, titulo, disparadores, instruccion, activo, orden
            FROM chat_situaciones
            ORDER BY orden ASC, id ASC
        `
        return { existeTabla: true, situaciones: filas || [] }
    } catch {
        return { existeTabla: false, situaciones: [] }
    }
}

function parseDisparadores(raw: string): string[] {
    return raw
        .split(/[\n,]/)
        .map((d) => d.trim())
        .filter(Boolean)
}

export async function guardarSituacion(data: {
    id?: number
    clave: string
    titulo: string
    disparadoresRaw: string
    instruccion: string
    activo: boolean
    orden: number
}): Promise<{ success: boolean; error?: string }> {
    await requireAdmin()

    const clave = data.clave.trim().toLowerCase().replace(/\s+/g, "_")
    const titulo = data.titulo.trim()
    const instruccion = data.instruccion.trim()
    const disparadores = parseDisparadores(data.disparadoresRaw)

    if (!clave || !titulo || !instruccion) {
        return { success: false, error: "Clave, título e instrucción son obligatorios." }
    }
    if (disparadores.length === 0) {
        return { success: false, error: "Cargá al menos un disparador (palabra o frase clave)." }
    }

    try {
        if (data.id) {
            await prisma.$executeRawUnsafe(
                `UPDATE chat_situaciones
                 SET clave = $1, titulo = $2, disparadores = $3, instruccion = $4, activo = $5, orden = $6, actualizado_en = NOW()
                 WHERE id = $7`,
                clave, titulo, disparadores, instruccion, data.activo, data.orden, data.id
            )
        } else {
            await prisma.$executeRawUnsafe(
                `INSERT INTO chat_situaciones (clave, titulo, disparadores, instruccion, activo, orden)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                clave, titulo, disparadores, instruccion, data.activo, data.orden
            )
        }
        invalidarCacheSituaciones()
        revalidatePath("/admin/chatwoot/situaciones")
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Error al guardar la situación." }
    }
}

export async function eliminarSituacion(id: number): Promise<{ success: boolean; error?: string }> {
    await requireAdmin()
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM chat_situaciones WHERE id = $1`, id)
        invalidarCacheSituaciones()
        revalidatePath("/admin/chatwoot/situaciones")
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Error al eliminar." }
    }
}
