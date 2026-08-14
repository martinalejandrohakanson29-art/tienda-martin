"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { calcularMetricasChatwoot, type MetricasChatwoot } from "@/lib/chatwoot-metricas"

// Calcular esto recorre todas las conversaciones del período contra la API de
// Chatwoot (una request por conversación para traer sus mensajes) — pesado
// para pedirlo en cada carga de pantalla. Se cachea en memoria por proceso,
// igual que el IPC en app/actions/inflacion.ts.
const TTL_MS = 15 * 60 * 1000

let cache: { periodoDias: number; calculadoEn: number; datos: MetricasChatwoot } | null = null

export async function obtenerMetricasChatwoot(periodoDias: number, forzarActualizacion = false) {
    await requireAdmin()

    const ahora = Date.now()
    if (!forzarActualizacion && cache && cache.periodoDias === periodoDias && ahora - cache.calculadoEn < TTL_MS) {
        return { success: true as const, datos: cache.datos, deCache: true }
    }

    try {
        const datos = await calcularMetricasChatwoot(periodoDias)
        cache = { periodoDias, calculadoEn: ahora, datos }
        return { success: true as const, datos, deCache: false }
    } catch (e) {
        console.error("obtenerMetricasChatwoot:", e)
        if (cache && cache.periodoDias === periodoDias) {
            return { success: true as const, datos: cache.datos, deCache: true }
        }
        return {
            success: false as const,
            error: e instanceof Error ? e.message : "No se pudieron calcular las métricas de Chatwoot",
        }
    }
}
