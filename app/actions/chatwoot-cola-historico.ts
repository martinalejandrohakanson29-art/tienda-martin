"use server"

import { requireAdmin } from "@/lib/auth-guard"
import {
    obtenerHistoricoColas,
    obtenerEstadoColaEnVivo,
    marcarBloqueDespachado,
    backfillHistoricoDesdeTurnos,
    type ResumenDiaCola,
    type EstadoColaEnVivo,
} from "@/lib/chatwoot-cola-historico"

export async function obtenerHistoricoColasAction(diasAtras: number = 14): Promise<{
    success: boolean
    datos: ResumenDiaCola[]
    error?: string
}> {
    try {
        await requireAdmin()
        const datos = await obtenerHistoricoColas(diasAtras)
        return { success: true, datos }
    } catch (e: any) {
        console.error("Error en obtenerHistoricoColasAction:", e)
        return { success: false, datos: [], error: e.message || "Error al obtener histórico de colas" }
    }
}

export async function obtenerEstadoColaEnVivoAction(): Promise<{
    success: boolean
    datos: EstadoColaEnVivo | null
    error?: string
}> {
    try {
        await requireAdmin()
        const datos = await obtenerEstadoColaEnVivo()
        return { success: true, datos }
    } catch (e: any) {
        console.error("Error en obtenerEstadoColaEnVivoAction:", e)
        return { success: false, datos: null, error: e.message || "Error al obtener estado de cola en vivo" }
    }
}

export async function marcarColaDespachadaAction(): Promise<{ success: boolean; error?: string }> {
    try {
        await requireAdmin()
        await marcarBloqueDespachado()
        return { success: true }
    } catch (e: any) {
        console.error("Error en marcarColaDespachadaAction:", e)
        return { success: false, error: e.message || "Error al marcar bloque como despachado" }
    }
}

export async function reprocesarBackfillHistoricoAction(): Promise<{
    success: boolean
    insertados: number
    error?: string
}> {
    try {
        await requireAdmin()
        const { insertados } = await backfillHistoricoDesdeTurnos()
        return { success: true, insertados }
    } catch (e: any) {
        console.error("Error en reprocesarBackfillHistoricoAction:", e)
        return { success: false, insertados: 0, error: e.message || "Error al sincronizar datos históricos" }
    }
}
