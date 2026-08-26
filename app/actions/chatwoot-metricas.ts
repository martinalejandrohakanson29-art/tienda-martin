"use server"

import { requireAdmin } from "@/lib/auth-guard"
import {
    obtenerMetricasDesdeBD,
    sincronizarMetricasChatwoot,
    type MetricasChatwoot,
} from "@/lib/chatwoot-metricas"

export async function obtenerMetricasChatwoot(periodoDias: number, forzarActualizacion = false) {
    await requireAdmin()

    try {
        if (forzarActualizacion) {
            // Sincroniza desde Chatwoot para actualizar los últimos días
            await sincronizarMetricasChatwoot(Math.min(periodoDias, 7))
        }

        const datos = await obtenerMetricasDesdeBD(periodoDias)
        return { success: true as const, datos }
    } catch (e) {
        console.error("obtenerMetricasChatwoot:", e)
        return {
            success: false as const,
            error: e instanceof Error ? e.message : "No se pudieron obtener las métricas de Chatwoot",
        }
    }
}

export async function sincronizarHistoricoCompleto(periodoDias: number = 30) {
    await requireAdmin()
    try {
        await sincronizarMetricasChatwoot(periodoDias)
        const datos = await obtenerMetricasDesdeBD(periodoDias)
        return { success: true as const, datos }
    } catch (e) {
        console.error("sincronizarHistoricoCompleto error:", e)
        return {
            success: false as const,
            error: e instanceof Error ? e.message : "Error al sincronizar historial con Chatwoot",
        }
    }
}

