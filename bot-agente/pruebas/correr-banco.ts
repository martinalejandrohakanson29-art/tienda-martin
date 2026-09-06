import { ejecutarTurnoAgente, OpcionesEjecucion } from "../motor"
import { MensajeChat } from "../tipos"
import { limpiarEstadoConversacion } from "../nucleo/estado-persistente"
import { CASOS_PRUEBA_REALES, CasoPrueba } from "./casos-reales"

/**
 * RUNNER DEL BANCO DE PRUEBAS (red de seguridad anti-regresion)
 * ------------------------------------------------------------
 * Antes, `casos-reales.ts` era solo data: nada lo ejecutaba. Cada vez que se
 * tocaba el prompt o una herramienta habia que probar a mano y rezar.
 *
 * Ahora este runner corre los N casos contra el motor real y verifica:
 *   - escaladoHumano coincide con lo esperado
 *   - si debe guardar silencio, mensajeFinal es null
 *   - las herramientas esperadas fueron llamadas (subconjunto)
 *   - el patron de respuesta (si hay) matchea
 *
 * Se corre desde /admin/chatwoot/simulador (pestaña "Banco de pruebas") o
 * llamando `correrBancoPruebas()` desde un script.
 *
 * ES LO QUE PERMITE QUE EL PROMPT ACHIQUE: con esto se pueden fusionar reglas
 * y saber al toque si algo regresiono.
 */

export interface ResultadoCaso {
    id: string
    titulo: string
    ok: boolean
    fallos: string[]
    /** Que hizo realmente el bot, para inspeccionar. */
    observado: {
        mensajeFinal: string | null
        escaladoHumano: boolean
        motivoEscalado?: string
        herramientas: string[]
        latenciaMs: number
    }
    error?: string
}

export interface ReporteBanco {
    total: number
    pasados: number
    fallados: number
    corridoEn: string
    resultados: ResultadoCaso[]
}

function historialToChat(historial: CasoPrueba["historial"]): MensajeChat[] {
    if (!historial) return []
    return historial.map((h) => ({ rol: h.rol, contenido: h.contenido }))
}

async function evaluarCaso(caso: CasoPrueba, opciones: OpcionesEjecucion): Promise<ResultadoCaso> {
    const base: ResultadoCaso["observado"] = {
        mensajeFinal: null,
        escaladoHumano: false,
        herramientas: [],
        latenciaMs: 0
    }

    const estadoKey = `banco:${caso.id}`
    try {
        await limpiarEstadoConversacion(estadoKey)
        const resp = await ejecutarTurnoAgente(caso.mensajeCliente, historialToChat(caso.historial), {
            ...opciones,
            estadoKey
        })
        const herramientas = (resp.herramientasEjecutadas || []).map((h) => h.nombre)
        const observado: ResultadoCaso["observado"] = {
            mensajeFinal: resp.mensajeFinal,
            escaladoHumano: resp.escaladoHumano,
            motivoEscalado: resp.motivoEscalado,
            herramientas,
            latenciaMs: resp.latenciaMs
        }

        const fallos: string[] = []
        const esperado = caso.resultadoEsperado

        if (esperado.debeEscalarHumano !== undefined && resp.escaladoHumano !== esperado.debeEscalarHumano) {
            fallos.push(`escaladoHumano: esperado ${esperado.debeEscalarHumano}, obtenido ${resp.escaladoHumano}`)
        }

        if (esperado.debeGuardarSilencio !== undefined) {
            const guardoSilencio = resp.mensajeFinal == null
            if (guardoSilencio !== esperado.debeGuardarSilencio) {
                fallos.push(`silencio: esperado ${esperado.debeGuardarSilencio}, obtenido ${guardoSilencio}`)
            }
        }

        if (esperado.debeLlamarHerramientas && esperado.debeLlamarHerramientas.length > 0) {
            const faltantes = esperado.debeLlamarHerramientas.filter((h) => !herramientas.includes(h))
            if (faltantes.length > 0) {
                fallos.push(`herramientas faltantes: ${faltantes.join(", ")} (llamadas: ${herramientas.join(", ") || "ninguna"})`)
            }
        }

        if (esperado.patronRespuesta) {
            if (!resp.mensajeFinal || !esperado.patronRespuesta.test(resp.mensajeFinal)) {
                fallos.push(`patronRespuesta no matchea: ${esperado.patronRespuesta}`)
            }
        }

        return { id: caso.id, titulo: caso.titulo, ok: fallos.length === 0, fallos, observado }
    } catch (err: any) {
        return {
            id: caso.id,
            titulo: caso.titulo,
            ok: false,
            fallos: ["excepcion durante la ejecucion"],
            observado: base,
            error: err?.message || String(err)
        }
    }
}

/**
 * Corre el banco completo (o un subconjunto por ids). Secuencial para no
 * saturar la API del proveedor.
 */
export async function correrBancoPruebas(
    opciones: OpcionesEjecucion = {},
    soloIds?: string[]
): Promise<ReporteBanco> {
    const casos = soloIds && soloIds.length > 0
        ? CASOS_PRUEBA_REALES.filter((c) => soloIds.includes(c.id))
        : CASOS_PRUEBA_REALES

    const resultados: ResultadoCaso[] = []
    for (const caso of casos) {
        resultados.push(await evaluarCaso(caso, opciones))
    }

    const pasados = resultados.filter((r) => r.ok).length
    return {
        total: resultados.length,
        pasados,
        fallados: resultados.length - pasados,
        corridoEn: new Date().toISOString(),
        resultados
    }
}
