import { prisma } from "@/lib/prisma"

/**
 * SALUD DEL MOTOR DE IA (¿está el proveedor barato respondiendo?)
 * ---------------------------------------------------------------
 * El 14/09 DeepSeek se degradó durante la tarde: los turnos se iban a 60s de
 * timeout, el motor reintentaba 3 veces y recién ahí pasaba al suplente
 * (gpt-5). Resultado: clientes esperando más de 3 minutos la respuesta —
 * turnos reales de 199s, 206s— y el gasto migrando al modelo caro. Desde la
 * app no se veía NADA: las respuestas salían, solo que tardísimo, y la única
 * pista estaba en los logs del server.
 *
 * No hace falta telemetría nueva: cada turno ya guarda en `tokens` (jsonb) el
 * `modelo` que efectivamente lo atendió y un flag `fallback` cuando contestó el
 * suplente porque el principal no respondió. Esto solo lo lee y lo resume.
 *
 * DÓNDE SE VE: chip en el header de /admin/chatwoot/chats-vivo.
 */

export type EstadoMotor = "ok" | "lento" | "caido" | "sin_datos"

export type SaludMotor = {
    estado: EstadoMotor
    /** Texto corto para el chip ("Motor OK", "IA con demoras", "IA caída"). */
    etiqueta: string
    /** Explicación en una línea para el tooltip. */
    detalle: string
    /** Modelo que atendió la mayoría de los turnos de la ventana. */
    modeloDominante: string | null
    turnosUltimaHora: number
    /** Turnos que terminó contestando el suplente porque el principal no respondió. */
    fallbacksUltimaHora: number
    fallbacksUltimos15Min: number
    /** Turnos que pasaron el umbral de lentitud (comieron al menos un timeout). */
    lentosUltimaHora: number
    peorLatenciaMs: number
    /** Hora (es-AR) del último turno que tuvo que cubrir el suplente. */
    ultimoFallbackHora: string | null
}

/**
 * Un turno normal se resuelve en ~10s. El timeout de una llamada al LLM es de
 * 60s (`TIMEOUT_LLM_MS` en el motor), así que pasar de 45s significa casi
 * siempre que una llamada se abortó y hubo que reintentar: es la señal
 * TEMPRANA, la que aparece antes de que el proveedor se caiga del todo.
 */
const UMBRAL_LENTO_MS = 45_000

/**
 * Un solo fallback ya es grave: implica que el cliente esperó los 3 intentos
 * completos contra el principal (3 minutos) antes de que contestara el
 * suplente. Por eso alcanza con uno reciente para marcar caída, sin esperar a
 * que se acumulen.
 */
const FALLBACKS_PARA_CAIDA_RECIENTE = 1
const FALLBACKS_PARA_CAIDA_HORA = 3
/** Dos turnos lentos en una hora ya no son mala suerte: el proveedor va lento. */
const LENTOS_PARA_DEMORA = 2

/**
 * Clasificación pura, separada de la consulta para poder probarla con números
 * inventados: los cuatro estados no se pueden reproducir esperando a que el
 * proveedor se caiga de verdad.
 */
export function clasificarEstadoMotor(c: {
    turnos: number
    fallbacks: number
    fallbacks15: number
    lentos: number
}): EstadoMotor {
    if (c.turnos === 0) return "sin_datos"
    if (c.fallbacks15 >= FALLBACKS_PARA_CAIDA_RECIENTE || c.fallbacks >= FALLBACKS_PARA_CAIDA_HORA) return "caido"
    // Un fallback aislado y viejo ya no es una caída en curso, pero tampoco es
    // salud: queda como demora hasta que la ventana de una hora lo deje atrás.
    if (c.lentos >= LENTOS_PARA_DEMORA || c.fallbacks > 0) return "lento"
    return "ok"
}

/**
 * Cache corto en memoria: el panel se sincroniza cada 3,5s y esta consulta no
 * cambia de un segundo al otro. Misma decisión que el resto de los datos
 * derivados del proyecto: sirve porque corre en un proceso único.
 */
let cache: { data: SaludMotor; expira: number } | null = null
const TTL_CACHE_MS = 20_000

function formatearLatencia(ms: number): string {
    if (ms <= 0) return "—"
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`
    const min = Math.floor(ms / 60_000)
    const seg = Math.round((ms % 60_000) / 1000)
    return seg > 0 ? `${min}m ${seg}s` : `${min}m`
}

export async function obtenerSaludMotor(): Promise<SaludMotor> {
    if (cache && cache.expira > Date.now()) return cache.data

    const vacio: SaludMotor = {
        estado: "sin_datos",
        etiqueta: "IA sin datos",
        detalle: "No hubo turnos del bot en la última hora.",
        modeloDominante: null,
        turnosUltimaHora: 0,
        fallbacksUltimaHora: 0,
        fallbacksUltimos15Min: 0,
        lentosUltimaHora: 0,
        peorLatenciaMs: 0,
        ultimoFallbackHora: null,
    }

    try {
        // Solo turnos que REALMENTE llamaron al modelo: los que se resuelven por
        // el escalado determinista o el cierre social no tienen `tokens` y
        // aparecerían como turnos de 10ms, aguando el promedio.
        const filas = await prisma.$queryRaw<
            {
                turnos: bigint
                fallbacks: bigint
                fallbacks_15: bigint
                lentos: bigint
                peor_latencia: number | null
                ultimo_fallback: Date | null
            }[]
        >`
            SELECT
                COUNT(*)                                                             AS turnos,
                COUNT(*) FILTER (WHERE tokens->>'fallback' = 'true')                 AS fallbacks,
                COUNT(*) FILTER (WHERE tokens->>'fallback' = 'true'
                                   AND creado_en > now() - interval '15 minutes')    AS fallbacks_15,
                COUNT(*) FILTER (WHERE latencia_ms > ${UMBRAL_LENTO_MS})              AS lentos,
                MAX(latencia_ms)                                                     AS peor_latencia,
                MAX(creado_en) FILTER (WHERE tokens->>'fallback' = 'true')           AS ultimo_fallback
            FROM bot_agente_turnos_reales
            WHERE creado_en > now() - interval '1 hour'
              AND tokens IS NOT NULL
        `

        const f = filas?.[0]
        const turnos = Number(f?.turnos || 0)
        if (!f || turnos === 0) {
            cache = { data: vacio, expira: Date.now() + TTL_CACHE_MS }
            return vacio
        }

        const fallbacks = Number(f.fallbacks || 0)
        const fallbacks15 = Number(f.fallbacks_15 || 0)
        const lentos = Number(f.lentos || 0)
        const peorLatenciaMs = Number(f.peor_latencia || 0)

        // El modelo dominante se calcula aparte: dice quién está atendiendo de
        // verdad (si el suplente pasó a ser mayoría, el principal está frito).
        const porModelo = await prisma.$queryRaw<{ modelo: string; cantidad: bigint }[]>`
            SELECT tokens->>'modelo' AS modelo, COUNT(*) AS cantidad
            FROM bot_agente_turnos_reales
            WHERE creado_en > now() - interval '1 hour'
              AND tokens->>'modelo' IS NOT NULL
            GROUP BY 1
            ORDER BY 2 DESC
            LIMIT 1
        `
        const modeloDominante = porModelo?.[0]?.modelo || null

        const ultimoFallbackHora = f.ultimo_fallback
            ? // 24hs explícito: con es-AR a secas Node imprime "05:48 p. m." y en
              // un panel operativo esa hora se lee mal de un vistazo.
              new Date(f.ultimo_fallback).toLocaleTimeString("es-AR", {
                  timeZone: "America/Argentina/Cordoba",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
              })
            : null

        const estado = clasificarEstadoMotor({ turnos, fallbacks, fallbacks15, lentos })

        const etiqueta =
            estado === "caido" ? "IA caída" : estado === "lento" ? "IA con demoras" : "IA OK"

        const detalle =
            estado === "caido"
                ? `El proveedor principal no responde: ${fallbacks} ${fallbacks === 1 ? "turno lo cubrió" : "turnos los cubrió"} el suplente en la última hora${ultimoFallbackHora ? ` (el último a las ${ultimoFallbackHora})` : ""}. Los clientes esperan hasta ${formatearLatencia(peorLatenciaMs)}. Las respuestas salen igual, pero tarde y con el modelo caro.`
                : estado === "lento"
                  ? `${lentos} de ${turnos} turnos de la última hora tardaron más de ${Math.round(UMBRAL_LENTO_MS / 1000)}s (peor: ${formatearLatencia(peorLatenciaMs)}). Es la señal de que el proveedor está comiendo timeouts.`
                  : `${turnos} turnos en la última hora, el peor de ${formatearLatencia(peorLatenciaMs)}. Sin caídas al suplente.`

        const data: SaludMotor = {
            estado,
            etiqueta,
            // El modelo solo se nombra cuando todo va bien: en una caída, decir
            // "atiende deepseek-flash" (que sigue siendo el que más turnos tomó)
            // contradice el mensaje de que no está respondiendo.
            detalle: estado === "ok" && modeloDominante ? `${detalle} Atiende: ${modeloDominante}.` : detalle,
            modeloDominante,
            turnosUltimaHora: turnos,
            fallbacksUltimaHora: fallbacks,
            fallbacksUltimos15Min: fallbacks15,
            lentosUltimaHora: lentos,
            peorLatenciaMs,
            ultimoFallbackHora,
        }

        cache = { data, expira: Date.now() + TTL_CACHE_MS }
        return data
    } catch (err) {
        // Un problema para leer la salud NUNCA puede voltear el panel de chats:
        // se devuelve "sin datos" y el chip queda gris.
        console.warn("[bot-agente-salud] no se pudo calcular la salud del motor:", (err as any)?.message)
        return vacio
    }
}
