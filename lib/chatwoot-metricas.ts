import { chatwootConfig } from "@/lib/chatwoot-bot"

// Métricas del bot leídas en vivo desde la API real de Chatwoot (no de n8n ni
// de una tabla propia): cuenta mensajes entrantes, arma el histograma de hora
// de llegada y mide cuántas conversaciones el cliente sigue escribiendo
// después de nuestra primera respuesta. Todo en hora Argentina (UTC-3 fijo,
// mismo criterio que ahoraEnArgentina() en chatwoot-bot.ts).

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
    porHora: { hora: number; cantidad: number }[]
    porDia: { fecha: string; cantidad: number }[]
    horaPico: { hora: number; cantidad: number } | null
    continuidad: {
        conversacionesConRespuesta: number
        conversacionesConContinuacion: number
        porcentaje: number
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

/** Historial completo de una conversación (paginado con `before`, viene en orden ascendente por id). */
async function listarMensajesConversacion(conversationId: number): Promise<MensajeChatwoot[]> {
    const mensajes: MensajeChatwoot[] = []
    let before: number | undefined
    for (let pagina = 0; pagina < TOPE_PAGINAS_MENSAJES; pagina++) {
        const qs = before ? `?before=${before}` : ""
        const j = await chatwootFetch(`/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages${qs}`)
        const items: MensajeChatwoot[] = j?.payload || []
        if (items.length === 0) break
        mensajes.unshift(...items) // cada página trae un tramo más viejo; lo ascendente global va adelante
        if (items.length < 20) break
        before = items[0].id
    }
    return mensajes
}

function horaYFechaArgentina(epochSeg: number) {
    const desplazado = new Date(epochSeg * 1000 - OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000)
    return { hora: desplazado.getUTCHours(), fecha: desplazado.toISOString().slice(0, 10) }
}

export async function calcularMetricasChatwoot(periodoDias: number): Promise<MetricasChatwoot> {
    const ahoraMs = Date.now()
    const desdeMs = ahoraMs - periodoDias * 24 * 60 * 60 * 1000
    const desdeEpochSeg = Math.floor(desdeMs / 1000)
    const desdeFechaISO = new Date(desdeMs).toISOString().slice(0, 10)

    const conversaciones = await listarConversacionesDesde(desdeFechaISO)

    const porHora = new Array(24).fill(0) as number[]
    const porDiaMap = new Map<string, number>()
    let totalMensajesEntrantes = 0
    let conversacionesConRespuesta = 0
    let conversacionesConContinuacion = 0

    for (let i = 0; i < conversaciones.length; i += CONCURRENCIA_MENSAJES) {
        const lote = conversaciones.slice(i, i + CONCURRENCIA_MENSAJES)
        const mensajesPorConv = await Promise.all(
            lote.map((c) => listarMensajesConversacion(c.id).catch(() => [] as MensajeChatwoot[]))
        )

        for (const mensajes of mensajesPorConv) {
            // Descarta notas privadas (escalados internos) y eventos de actividad:
            // no son tráfico real con el cliente.
            const relevantes = mensajes.filter(
                (m) => !m.private && m.message_type !== 2 && m.created_at >= desdeEpochSeg
            )
            const entrantes = relevantes.filter((m) => m.message_type === 0).sort((a, b) => a.created_at - b.created_at)
            const salientes = relevantes.filter((m) => m.message_type === 1).sort((a, b) => a.created_at - b.created_at)

            for (const m of entrantes) {
                totalMensajesEntrantes++
                const { hora, fecha } = horaYFechaArgentina(m.created_at)
                porHora[hora]++
                porDiaMap.set(fecha, (porDiaMap.get(fecha) ?? 0) + 1)
            }

            if (entrantes.length === 0) continue
            const primerEntrante = entrantes[0].created_at
            const primeraRespuesta = salientes.find((m) => m.created_at > primerEntrante)
            if (!primeraRespuesta) continue

            conversacionesConRespuesta++
            const siguioEscribiendo = entrantes.some((m) => m.created_at > primeraRespuesta.created_at)
            if (siguioEscribiendo) conversacionesConContinuacion++
        }
    }

    const porHoraArr = porHora.map((cantidad, hora) => ({ hora, cantidad }))
    const horaPico = porHoraArr.reduce<{ hora: number; cantidad: number } | null>(
        (max, cur) => (cur.cantidad > (max?.cantidad ?? 0) ? cur : max),
        null
    )
    const porDia = [...porDiaMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, cantidad]) => ({ fecha, cantidad }))

    return {
        actualizadoEn: new Date().toISOString(),
        periodoDias,
        totalConversaciones: conversaciones.length,
        totalMensajesEntrantes,
        porHora: porHoraArr,
        porDia,
        horaPico,
        continuidad: {
            conversacionesConRespuesta,
            conversacionesConContinuacion,
            porcentaje:
                conversacionesConRespuesta > 0
                    ? Math.round((conversacionesConContinuacion / conversacionesConRespuesta) * 1000) / 10
                    : 0,
        },
    }
}
