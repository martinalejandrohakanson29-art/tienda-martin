import { prisma } from "@/lib/prisma"
import { chatwootConfig, getHorarios, calcularDebeEstarAbierto } from "@/lib/chatwoot-bot"

// Métricas de comportamiento de clientes leídas y persistidas en PostgreSQL
// (tabla chatwoot_metricas_diarias).
// Registra el horario real de llegada de los mensajes (hora Argentina UTC-3),
// los mensajes entrantes fuera del horario operativo del bot y la tasa de
// continuidad de las conversaciones.

const ACCOUNT_ID = 1
const OFFSET_ARGENTINA_HORAS = 3
const CONCURRENCIA_MENSAJES = 10
const TOPE_PAGINAS_CONVERSACIONES = 60
const TOPE_PAGINAS_MENSAJES = 6

type MensajeChatwoot = {
    id: number
    message_type: number // 0 entrante, 1 saliente, 2 actividad
    created_at: number // epoch segundos
    private: boolean
}

type ConversacionFiltro = {
    id: number
}

export type MetricasChatwoot = {
    actualizadoEn: string
    periodoDias: number
    totalConversaciones: number
    totalMensajesEntrantes: number
    totalMensajesFueraHorario: number
    totalEncolados: number
    porHora: { hora: number; cantidad: number }[]
    porDia: { fecha: string; cantidad: number }[]
    horaPico: { hora: number; cantidad: number } | null
    continuidad: {
        conversacionesConRespuesta: number
        conversacionesConContinuacion: number
        porcentaje: number
        porcentajeSobreTotal: number
    }
}

async function chatwootFetch(path: string, init?: RequestInit) {
    const { api, token } = chatwootConfig()
    if (!token) throw new Error("Falta CHATWOOT_API_TOKEN en el entorno de la app")

    const res = await fetch(`${api}${path}`, {
        ...init,
        headers: { api_access_token: token, "Content-Type": "application/json", ...(init?.headers || {}) },
    })
    if (!res.ok) {
        const detalle = await res.text().catch(() => "")
        throw new Error(`Chatwoot respondió ${res.status} en ${path}: ${detalle.slice(0, 200)}`)
    }
    return res.json()
}

/** Todas las conversaciones creadas desde `desdeFechaISO` (yyyy-mm-dd), paginando el endpoint /filter. */
async function listarConversacionesDesde(desdeFechaISO: string): Promise<ConversacionFiltro[]> {
    const resultado: ConversacionFiltro[] = []
    for (let pagina = 1; pagina <= TOPE_PAGINAS_CONVERSACIONES; pagina++) {
        const j = await chatwootFetch(`/accounts/${ACCOUNT_ID}/conversations/filter?page=${pagina}`, {
            method: "POST",
            body: JSON.stringify({
                payload: [
                    {
                        attribute_key: "created_at",
                        filter_operator: "is_greater_than",
                        values: [desdeFechaISO],
                        query_operator: null,
                    },
                ],
            }),
        })
        const items: { id: number }[] = j?.payload || []
        if (items.length === 0) break
        resultado.push(...items.map((c) => ({ id: c.id })))
        if (items.length < 25) break
    }
    return resultado
}

/** Historial de una conversación (paginado con `before`, orden ascendente). */
async function listarMensajesConversacion(conversationId: number): Promise<MensajeChatwoot[]> {
    const mensajes: MensajeChatwoot[] = []
    let before: number | undefined
    for (let pagina = 0; pagina < TOPE_PAGINAS_MENSAJES; pagina++) {
        const qs = before ? `?before=${before}` : ""
        const j = await chatwootFetch(`/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages${qs}`)
        const items: MensajeChatwoot[] = j?.payload || []
        if (items.length === 0) break
        mensajes.unshift(...items)
        if (items.length < 20) break
        before = items[items.length - 1].id
    }
    return mensajes
}

export function fechaArgentinaDesdeEpochSeg(epochSeg: number) {
    const desplazado = new Date(epochSeg * 1000 - OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000)
    return {
        fecha: desplazado.toISOString().slice(0, 10),
        hora: desplazado.getUTCHours(),
        diaSemana: desplazado.getUTCDay(),
        minutosDelDia: desplazado.getUTCHours() * 60 + desplazado.getUTCMinutes(),
    }
}

export async function asegurarTablaMetricasDiarias() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS chatwoot_metricas_diarias (
            fecha DATE PRIMARY KEY,
            total_conversaciones INTEGER NOT NULL DEFAULT 0,
            total_mensajes_entrantes INTEGER NOT NULL DEFAULT 0,
            total_mensajes_salientes INTEGER NOT NULL DEFAULT 0,
            por_hora JSONB NOT NULL DEFAULT '[]'::jsonb,
            conversaciones_con_respuesta INTEGER NOT NULL DEFAULT 0,
            conversaciones_con_continuacion INTEGER NOT NULL DEFAULT 0,
            mensajes_fuera_horario INTEGER NOT NULL DEFAULT 0,
            actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `)
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS chatwoot_metricas_diarias_fecha_idx
            ON chatwoot_metricas_diarias (fecha DESC)
    `)
}

/**
 * Sincroniza métricas desde Chatwoot para los últimos `diasAtras` días
 * y consolida los resultados en la tabla `chatwoot_metricas_diarias`.
 */
export async function sincronizarMetricasChatwoot(diasAtras: number = 30): Promise<void> {
    await asegurarTablaMetricasDiarias()
    const horarios = await getHorarios().catch(() => [])

    const ahoraMs = Date.now()
    const desdeMs = ahoraMs - diasAtras * 24 * 60 * 60 * 1000
    const desdeFechaISO = new Date(desdeMs - OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000).toISOString().slice(0, 10)

    const conversaciones = await listarConversacionesDesde(desdeFechaISO)

    type MetricasDiaAcumulador = {
        conversacionesSet: Set<number>
        mensajesEntrantes: number
        mensajesSalientes: number
        porHora: number[]
        mensajesFueraHorario: number
        conversacionesConRespuesta: number
        conversacionesConContinuacion: number
    }

    const mapaDias = new Map<string, MetricasDiaAcumulador>()

    function getOrCreateDia(fechaStr: string): MetricasDiaAcumulador {
        let dia = mapaDias.get(fechaStr)
        if (!dia) {
            dia = {
                conversacionesSet: new Set(),
                mensajesEntrantes: 0,
                mensajesSalientes: 0,
                porHora: new Array(24).fill(0),
                mensajesFueraHorario: 0,
                conversacionesConRespuesta: 0,
                conversacionesConContinuacion: 0,
            }
            mapaDias.set(fechaStr, dia)
        }
        return dia
    }

    for (let i = 0; i < conversaciones.length; i += CONCURRENCIA_MENSAJES) {
        const lote = conversaciones.slice(i, i + CONCURRENCIA_MENSAJES)
        const mensajesPorConv = await Promise.all(
            lote.map((c) =>
                listarMensajesConversacion(c.id)
                    .then((ms) => ({ convId: c.id, mensajes: ms }))
                    .catch(() => ({ convId: c.id, mensajes: [] as MensajeChatwoot[] }))
            )
        )

        for (const { convId, mensajes } of mensajesPorConv) {
            const relevantes = mensajes.filter((m) => !m.private && m.message_type !== 2)
            const entrantes = relevantes.filter((m) => m.message_type === 0).sort((a, b) => a.created_at - b.created_at)
            const salientes = relevantes.filter((m) => m.message_type === 1).sort((a, b) => a.created_at - b.created_at)

            for (const m of entrantes) {
                const { fecha, hora, diaSemana, minutosDelDia } = fechaArgentinaDesdeEpochSeg(m.created_at)
                if (fecha < desdeFechaISO) continue

                const diaAcc = getOrCreateDia(fecha)
                diaAcc.conversacionesSet.add(convId)
                diaAcc.mensajesEntrantes++
                diaAcc.porHora[hora]++

                if (horarios.length > 0) {
                    const abierto = calcularDebeEstarAbierto(horarios, { diaSemana, minutosDelDia })
                    if (!abierto) {
                        diaAcc.mensajesFueraHorario++
                    }
                }
            }

            for (const m of salientes) {
                const { fecha } = fechaArgentinaDesdeEpochSeg(m.created_at)
                if (fecha < desdeFechaISO) continue
                const diaAcc = getOrCreateDia(fecha)
                diaAcc.mensajesSalientes++
            }

            if (entrantes.length > 0) {
                const primerEntrante = entrantes[0]
                const { fecha: fechaPrimerEntrante } = fechaArgentinaDesdeEpochSeg(primerEntrante.created_at)
                if (fechaPrimerEntrante >= desdeFechaISO) {
                    const primeraRespuesta = salientes.find((m) => m.created_at > primerEntrante.created_at)
                    if (primeraRespuesta) {
                        const diaAcc = getOrCreateDia(fechaPrimerEntrante)
                        diaAcc.conversacionesConRespuesta++
                        const siguioEscribiendo = entrantes.some((m) => m.created_at > primeraRespuesta.created_at)
                        if (siguioEscribiendo) {
                            diaAcc.conversacionesConContinuacion++
                        }
                    }
                }
            }
        }
    }

    // Persistir cada día consolidado en PostgreSQL
    for (const [fecha, acc] of mapaDias.entries()) {
        await prisma.$executeRaw`
            INSERT INTO chatwoot_metricas_diarias (
                fecha,
                total_conversaciones,
                total_mensajes_entrantes,
                total_mensajes_salientes,
                por_hora,
                conversaciones_con_respuesta,
                conversaciones_con_continuacion,
                mensajes_fuera_horario,
                actualizado_en
            ) VALUES (
                ${fecha}::date,
                ${acc.conversacionesSet.size},
                ${acc.mensajesEntrantes},
                ${acc.mensajesSalientes},
                ${JSON.stringify(acc.porHora)}::jsonb,
                ${acc.conversacionesConRespuesta},
                ${acc.conversacionesConContinuacion},
                ${acc.mensajesFueraHorario},
                now()
            )
            ON CONFLICT (fecha) DO UPDATE SET
                total_conversaciones = EXCLUDED.total_conversaciones,
                total_mensajes_entrantes = EXCLUDED.total_mensajes_entrantes,
                total_mensajes_salientes = EXCLUDED.total_mensajes_salientes,
                por_hora = EXCLUDED.por_hora,
                conversaciones_con_respuesta = EXCLUDED.conversaciones_con_respuesta,
                conversaciones_con_continuacion = EXCLUDED.conversaciones_con_continuacion,
                mensajes_fuera_horario = EXCLUDED.mensajes_fuera_horario,
                actualizado_en = now()
        `
    }
}

/**
 * Consulta de alta velocidad (<10ms) directamente de PostgreSQL.
 * Agrega el rango solicitado (7d, 30d, 90d) y garantiza continuidad de fechas.
 */
export async function obtenerMetricasDesdeBD(periodoDias: number): Promise<MetricasChatwoot> {
    await asegurarTablaMetricasDiarias()

    const ahoraMs = Date.now() - OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000
    const fechaHastaStr = new Date(ahoraMs).toISOString().slice(0, 10)
    const desdeMs = ahoraMs - (periodoDias - 1) * 24 * 60 * 60 * 1000
    const fechaDesdeStr = new Date(desdeMs).toISOString().slice(0, 10)

    type FilaBD = {
        fecha: Date
        total_conversaciones: number
        total_mensajes_entrantes: number
        total_mensajes_salientes: number
        por_hora: number[] | string
        conversaciones_con_respuesta: number
        conversaciones_con_continuacion: number
        mensajes_fuera_horario: number
        actualizado_en: Date
    }

    let filas = await prisma.$queryRaw<FilaBD[]>`
        SELECT fecha, total_conversaciones, total_mensajes_entrantes, total_mensajes_salientes,
               por_hora, conversaciones_con_respuesta, conversaciones_con_continuacion,
               mensajes_fuera_horario, actualizado_en
        FROM chatwoot_metricas_diarias
        WHERE fecha >= ${fechaDesdeStr}::date AND fecha <= ${fechaHastaStr}::date
        ORDER BY fecha ASC
    `

    // Si no hay datos en la base, realizamos la primera sincronización
    if (filas.length === 0) {
        const conteo = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*)::bigint AS count FROM chatwoot_metricas_diarias
        `
        if (Number(conteo[0]?.count || 0) === 0) {
            await sincronizarMetricasChatwoot(Math.max(periodoDias, 30))
            filas = await prisma.$queryRaw<FilaBD[]>`
                SELECT fecha, total_conversaciones, total_mensajes_entrantes, total_mensajes_salientes,
                       por_hora, conversaciones_con_respuesta, conversaciones_con_continuacion,
                       mensajes_fuera_horario, actualizado_en
                FROM chatwoot_metricas_diarias
                WHERE fecha >= ${fechaDesdeStr}::date AND fecha <= ${fechaHastaStr}::date
                ORDER BY fecha ASC
            `
        }
    }

    // Consultar respuestas encoladas en respuestas_pendientes en este período
    const encoladosRes = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM respuestas_pendientes
        WHERE creado_en >= ${fechaDesdeStr}::date
    `.catch(() => [{ count: BigInt(0) }])
    const totalEncolados = Number(encoladosRes[0]?.count || 0)

    const filaMap = new Map<string, FilaBD>()
    let ultimaActualizacion: Date | null = null

    for (const f of filas) {
        const fStr = f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : String(f.fecha).slice(0, 10)
        filaMap.set(fStr, f)
        if (!ultimaActualizacion || (f.actualizado_en && f.actualizado_en > ultimaActualizacion)) {
            ultimaActualizacion = f.actualizado_en
        }
    }

    const porDia: { fecha: string; cantidad: number }[] = []
    const porHoraAcum = new Array(24).fill(0) as number[]
    let totalConversaciones = 0
    let totalMensajesEntrantes = 0
    let totalMensajesFueraHorario = 0
    let conversacionesConRespuesta = 0
    let conversacionesConContinuacion = 0

    for (let i = 0; i < periodoDias; i++) {
        const dMs = desdeMs + i * 24 * 60 * 60 * 1000
        const dStr = new Date(dMs).toISOString().slice(0, 10)
        const fila = filaMap.get(dStr)

        const cantidad = fila ? fila.total_mensajes_entrantes : 0
        porDia.push({ fecha: dStr, cantidad })

        if (fila) {
            totalConversaciones += fila.total_conversaciones
            totalMensajesEntrantes += fila.total_mensajes_entrantes
            totalMensajesFueraHorario += fila.mensajes_fuera_horario
            conversacionesConRespuesta += fila.conversaciones_con_respuesta
            conversacionesConContinuacion += fila.conversaciones_con_continuacion

            const arrHora: number[] = Array.isArray(fila.por_hora)
                ? fila.por_hora
                : typeof fila.por_hora === "string"
                ? JSON.parse(fila.por_hora)
                : []

            for (let h = 0; h < 24; h++) {
                porHoraAcum[h] += arrHora[h] || 0
            }
        }
    }

    const porHoraArr = porHoraAcum.map((cantidad, hora) => ({ hora, cantidad }))
    const horaPico = porHoraArr.reduce<{ hora: number; cantidad: number } | null>(
        (max, cur) => (cur.cantidad > (max?.cantidad ?? 0) ? cur : max),
        null
    )

    return {
        actualizadoEn: ultimaActualizacion ? ultimaActualizacion.toISOString() : new Date().toISOString(),
        periodoDias,
        totalConversaciones,
        totalMensajesEntrantes,
        totalMensajesFueraHorario,
        totalEncolados,
        porHora: porHoraArr,
        porDia,
        horaPico: horaPico && horaPico.cantidad > 0 ? horaPico : null,
        continuidad: {
            conversacionesConRespuesta,
            conversacionesConContinuacion,
            porcentaje:
                conversacionesConRespuesta > 0
                    ? Math.round((conversacionesConContinuacion / conversacionesConRespuesta) * 1000) / 10
                    : 0,
            porcentajeSobreTotal:
                totalConversaciones > 0
                    ? Math.round((conversacionesConContinuacion / totalConversaciones) * 1000) / 10
                    : 0,
        },
    }
}

