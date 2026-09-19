"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { guardarAjusteConfig } from "@/bot-agente/configuracion"
import { normalizarModo, type ModoVerificador } from "@/bot-agente/nucleo/verificador-grounding"

/**
 * Panel del verificador de grounding (Jev) — la Fase 2 del
 * `bot-agente/PLAN-VERIFICADOR-GROUNDING.md`.
 *
 * El trabajo que esta pantalla tiene que hacer posible es UNO: que Martín lea
 * SOLO los borradores marcados y diga "estaba mal" o "estaba bien" con un clic.
 * De esa columna (`veredicto_humano`) sale el único número que decide si el
 * verificador pasa a veto: la precisión sobre lo marcado.
 *
 * Requiere haber corrido `n8n-workflows/bot-verificador-grounding.sql` una vez.
 *
 * TODO lo que muestra esta pantalla filtra por `conversation_id IS NOT NULL`,
 * o sea SOLO tráfico real. Los turnos del simulador y del banco de pruebas
 * también dejan su fila (sirven para depurar), pero no tienen conversación, y
 * si contaran acá inflarían "mensajes mirados" y torcerían el % de marcado con
 * casos que fueron elegidos a propósito por ser difíciles. Es el mismo
 * criterio que ya usa `escalar-humano.ts` para no ensuciar la bandeja.
 */

/** El simulador y el banco no cuentan: ver el comentario de arriba. */
const SOLO_TRAFICO_REAL = "conversation_id IS NOT NULL"

const RUTA = "/admin/chatwoot/verificador"

export type VeredictoHumano = "acertado" | "falso_positivo"

export interface ChequeoRow {
    id: number
    creadoEn: string
    conversationId: number | null
    borrador: string
    noul: number
    umbral: number
    marcado: boolean
    accion: string
    ms: number | null
    costoUsd: number
    veredictoHumano: VeredictoHumano | null
    /** Los hechos que Jev tuvo a la vista, para poder juzgar el marcado sin adivinar. */
    estadoTools: unknown
}

export interface ResumenVerificador {
    existeTabla: boolean
    modo: ModoVerificador
    umbral: number
    /** Desde cuándo hay datos: sin esto, "0 marcados" se lee como "anda bien". */
    desde: string | null
    totalChequeos: number
    totalMarcados: number
    /** % de borradores marcados. El criterio de matar del plan es >5%. */
    porcentajeMarcado: number
    /** De los marcados que Martín ya juzgó. El criterio de pasar a veto es >=80%. */
    juzgados: number
    acertados: number
    precision: number | null
    /** Para el criterio de latencia (<1200ms de p90). */
    msP90: number | null
    costoTotalUsd: number
    /** Chequeos en la última hora: si es 0 con el modo prendido, Jev se cayó. */
    ultimaHora: number
}

/** Prisma devuelve los NUMERIC como Decimal y los INTEGER grandes como BigInt. */
const aNumero = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

export async function obtenerResumenVerificador(): Promise<ResumenVerificador> {
    await requireAdmin()

    const vacio: ResumenVerificador = {
        existeTabla: false,
        modo: "off",
        umbral: 0.8,
        desde: null,
        totalChequeos: 0,
        totalMarcados: 0,
        porcentajeMarcado: 0,
        juzgados: 0,
        acertados: 0,
        precision: null,
        msP90: null,
        costoTotalUsd: 0,
        ultimaHora: 0
    }

    let modo: ModoVerificador = "off"
    let umbral = 0.8
    try {
        const config = await prisma.$queryRaw<{ clave: string; valor: string }[]>`
            SELECT clave, valor FROM chat_config WHERE clave LIKE 'verificador_grounding%'
        `
        for (const f of config || []) {
            if (f.clave === "verificador_grounding_modo") modo = normalizarModo(f.valor)
            if (f.clave === "verificador_grounding_umbral") {
                const n = parseFloat(f.valor)
                if (Number.isFinite(n) && n > 0 && n <= 1) umbral = n
            }
        }
    } catch {
        return vacio
    }

    try {
        const filas = await prisma.$queryRaw<any[]>`
            SELECT
                COUNT(*)                                                        AS total,
                COUNT(*) FILTER (WHERE marcado)                                 AS marcados,
                COUNT(*) FILTER (WHERE marcado AND veredicto_humano IS NOT NULL) AS juzgados,
                COUNT(*) FILTER (WHERE marcado AND veredicto_humano = 'acertado') AS acertados,
                COUNT(*) FILTER (WHERE creado_en > now() - interval '1 hour')   AS ultima_hora,
                MIN(creado_en)                                                  AS desde,
                COALESCE(SUM(costo_usd), 0)                                     AS costo,
                PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ms)                 AS ms_p90
            FROM bot_agente_verificador_grounding
            WHERE conversation_id IS NOT NULL
        `
        const r = filas?.[0] || {}
        const total = aNumero(r.total)
        const marcados = aNumero(r.marcados)
        const juzgados = aNumero(r.juzgados)
        const acertados = aNumero(r.acertados)
        return {
            existeTabla: true,
            modo,
            umbral,
            desde: r.desde ? new Date(r.desde).toISOString() : null,
            totalChequeos: total,
            totalMarcados: marcados,
            porcentajeMarcado: total > 0 ? (marcados / total) * 100 : 0,
            juzgados,
            acertados,
            precision: juzgados > 0 ? (acertados / juzgados) * 100 : null,
            msP90: r.ms_p90 !== null && r.ms_p90 !== undefined ? Math.round(aNumero(r.ms_p90)) : null,
            costoTotalUsd: aNumero(r.costo),
            ultimaHora: aNumero(r.ultima_hora)
        }
    } catch {
        return { ...vacio, modo, umbral }
    }
}

/**
 * Los marcados, que son los únicos que hay que leer. `soloPendientes` deja
 * fuera los que ya tienen veredicto: es la bandeja de trabajo real.
 */
export async function listarChequeosMarcados(opciones: {
    soloPendientes?: boolean
    limite?: number
} = {}): Promise<ChequeoRow[]> {
    await requireAdmin()
    const limite = Math.min(Math.max(opciones.limite ?? 50, 1), 200)
    try {
        const filas = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, creado_en, conversation_id, borrador, noul, umbral, marcado, accion,
                    ms, costo_usd, veredicto_humano, estado_tools
             FROM bot_agente_verificador_grounding
             WHERE marcado = true
               AND ${SOLO_TRAFICO_REAL}
               ${opciones.soloPendientes ? "AND veredicto_humano IS NULL" : ""}
             ORDER BY creado_en DESC
             LIMIT ${limite}`
        )
        return (filas || []).map((f) => ({
            id: f.id,
            creadoEn: new Date(f.creado_en).toISOString(),
            conversationId: f.conversation_id ?? null,
            borrador: f.borrador,
            noul: aNumero(f.noul),
            umbral: aNumero(f.umbral),
            marcado: !!f.marcado,
            accion: f.accion,
            ms: f.ms ?? null,
            costoUsd: aNumero(f.costo_usd),
            veredictoHumano: (f.veredicto_humano as VeredictoHumano) ?? null,
            estadoTools: f.estado_tools ?? null
        }))
    } catch {
        return []
    }
}

/** "Estaba mal" / "Estaba bien". Pasar `null` deshace un veredicto cargado de más. */
export async function marcarVeredicto(
    id: number,
    veredicto: VeredictoHumano | null
): Promise<{ ok: boolean; error?: string }> {
    await requireAdmin()
    try {
        await prisma.$executeRaw`
            UPDATE bot_agente_verificador_grounding
            SET veredicto_humano = ${veredicto}
            WHERE id = ${id}
        `
        revalidatePath(RUTA)
        return { ok: true }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el veredicto" }
    }
}

/**
 * Prende y apaga el verificador. `veto` NO está implementado todavía (Fase 3):
 * se rechaza acá para que nadie lo ponga creyendo que frena mensajes.
 */
export async function cambiarModoVerificador(modo: string): Promise<{ ok: boolean; error?: string }> {
    await requireAdmin()
    if (modo !== "off" && modo !== "sombra") {
        return { ok: false, error: "Solo 'off' y 'sombra' por ahora: el veto es la Fase 3 y todavía no frena nada." }
    }
    try {
        await guardarAjusteConfig("verificador_grounding_modo", modo)
        revalidatePath(RUTA)
        return { ok: true }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "No se pudo cambiar el modo" }
    }
}
