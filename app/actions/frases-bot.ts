"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { invalidarCacheFrases, esMomentoValido } from "@/bot-agente/frases"

/**
 * CRUD de `chat_frases`: la letra de la casa por momento del embudo.
 *
 * Es la capa de REDACCIÓN, hermana de `chat_situaciones` (que es la capa de
 * reglas). Cargar una frase acá es lo que reemplaza a pedirle al prompt del
 * sistema un párrafo sobre cómo decir las cosas.
 *
 * Requiere haber corrido n8n-workflows/chat-frases.sql una vez.
 */

export interface FraseRow {
    id: number
    momento: string
    frase: string
    activo: boolean
    orden: number
}

const RUTA = "/admin/chatwoot/frases"

export async function listarFrases(): Promise<{ existeTabla: boolean; frases: FraseRow[] }> {
    await requireAdmin()
    try {
        const filas = await prisma.$queryRaw<FraseRow[]>`
            SELECT id, momento, frase, activo, orden
            FROM chat_frases
            ORDER BY momento ASC, orden ASC, id ASC
        `
        return { existeTabla: true, frases: filas || [] }
    } catch {
        return { existeTabla: false, frases: [] }
    }
}

export async function guardarFrase(data: {
    id?: number
    momento: string
    frase: string
    activo: boolean
    orden: number
}): Promise<{ success: boolean; error?: string }> {
    const session = await requireAdmin()

    const momento = data.momento.trim()
    const frase = data.frase.trim()

    if (!esMomentoValido(momento)) {
        return { success: false, error: "Ese momento no existe. Elegí uno de la lista." }
    }
    if (!frase) {
        return { success: false, error: "La frase no puede quedar vacía." }
    }
    if (frase.length > 300) {
        return { success: false, error: "La frase es demasiado larga (máx. 300 caracteres)." }
    }

    const autor = session.user?.email ?? session.user?.name ?? "admin"

    try {
        if (data.id) {
            await prisma.$executeRawUnsafe(
                `UPDATE chat_frases
                 SET momento = $1, frase = $2, activo = $3, orden = $4,
                     actualizado_en = NOW(), actualizado_por = $5
                 WHERE id = $6`,
                momento, frase, data.activo, data.orden, autor, data.id
            )
        } else {
            await prisma.$executeRawUnsafe(
                `INSERT INTO chat_frases (momento, frase, activo, orden, actualizado_por)
                 VALUES ($1, $2, $3, $4, $5)`,
                momento, frase, data.activo, data.orden, autor
            )
        }
        invalidarCacheFrases()
        revalidatePath(RUTA)
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Error al guardar la frase." }
    }
}

export async function eliminarFrase(id: number): Promise<{ success: boolean; error?: string }> {
    await requireAdmin()
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM chat_frases WHERE id = $1`, id)
        invalidarCacheFrases()
        revalidatePath(RUTA)
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Error al eliminar." }
    }
}

/**
 * Prender o apagar sin abrir el formulario: es el gesto más frecuente del
 * panel (una letra que no gustó se apaga y el bot vuelve a su voz).
 */
export async function alternarFrase(id: number, activo: boolean): Promise<{ success: boolean; error?: string }> {
    const session = await requireAdmin()
    const autor = session.user?.email ?? session.user?.name ?? "admin"
    try {
        await prisma.$executeRawUnsafe(
            `UPDATE chat_frases SET activo = $1, actualizado_en = NOW(), actualizado_por = $2 WHERE id = $3`,
            activo, autor, id
        )
        invalidarCacheFrases()
        revalidatePath(RUTA)
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Error al cambiar el estado." }
    }
}
