import { prisma } from "@/lib/prisma"
import {
    chatwootConfig,
    enviarImagenChatwoot,
    enviarMensajeChatwoot,
    enviarNotaPrivadaChatwoot,
} from "@/lib/chatwoot-bot"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { escalarAHumano } from "@/bot-agente/herramientas/escalar-humano"
import { MensajeChat } from "@/bot-agente/tipos"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"

// Puente entre el webhook real de Chatwoot y el motor bot-agente para las
// conversaciones marcadas como piloto (tabla `bot_agente_piloto`). Corre en el
// mismo proceso Node de la app (mismo supuesto que lib/chatwoot-cola.ts), asi
// que un Map en memoria alcanza para el debounce de rafaga: no sobrevive a un
// reinicio del server, pero eso solo afecta al piloto controlado, no a
// produccion real (que todavia la maneja n8n).

type BufferConversacion = {
    mensajes: string[]
    timer: NodeJS.Timeout
}

const buffers = new Map<number, BufferConversacion>()

const dormirMs = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Demora deliberada para que la respuesta no salga instantánea y parezca escrita
 * por una persona. Se elige un objetivo aleatorio en [min, max] segundos y se
 * descuenta lo que ya tardó el turno (modelo + herramientas), así el tiempo
 * total percibido por el cliente cae siempre dentro de esa ventana.
 */
async function esperarCadenciaHumana(inicioTurnoMs: number) {
    const config = await obtenerConfiguracionAgente().catch(() => null)
    if (!config || !config.respuestaDelayActivo) return
    const min = config.respuestaDelayMinSeg * 1000
    const max = config.respuestaDelayMaxSeg * 1000
    const objetivo = min + Math.random() * Math.max(0, max - min)
    const transcurrido = Date.now() - inicioTurnoMs
    const restante = Math.min(objetivo - transcurrido, max)
    if (restante > 0) await dormirMs(restante)
}

export async function esConversacionPiloto(conversationId: number): Promise<boolean> {
    try {
        const filas = await prisma.$queryRaw<{ activo: boolean }[]>`
            SELECT activo FROM bot_agente_piloto WHERE conversation_id = ${conversationId} LIMIT 1
        `
        return Boolean(filas[0]?.activo)
    } catch {
        return false
    }
}

/** Activa el piloto en una conversacion: pausa a n8n (/bot off) y la marca en la tabla. */
export async function activarPilotoBotAgente(conversationId: number, accountId = 1, quien = "admin"): Promise<void> {
    await enviarNotaPrivadaChatwoot({ accountId, conversationId, content: "/bot off" })
    await prisma.$executeRaw`
        INSERT INTO bot_agente_piloto (conversation_id, account_id, activo, activado_por, actualizado_en)
        VALUES (${conversationId}, ${accountId}, true, ${quien}, now())
        ON CONFLICT (conversation_id) DO UPDATE
        SET activo = true, activado_por = ${quien}, actualizado_en = now()
    `
}

/** Desactiva el piloto: reactiva a n8n (/bot on) y apaga la marca. */
export async function desactivarPilotoBotAgente(conversationId: number, accountId = 1): Promise<void> {
    await enviarNotaPrivadaChatwoot({ accountId, conversationId, content: "/bot on" })
    await prisma.$executeRaw`
        UPDATE bot_agente_piloto SET activo = false, actualizado_en = now()
        WHERE conversation_id = ${conversationId}
    `
}

type MensajeRaw = { contenido: string; privado: boolean; saliente: boolean; creadoEn: number }

async function traerTranscripcion(accountId: number, conversationId: number): Promise<MensajeRaw[]> {
    const { api, token } = chatwootConfig()
    const res = await fetch(`${api}/accounts/${accountId}/conversations/${conversationId}/messages`, {
        headers: { api_access_token: token },
        cache: "no-store",
    })
    if (!res.ok) throw new Error(`Chatwoot respondio ${res.status}`)
    const data = await res.json()
    const payload: any[] = Array.isArray(data?.payload) ? data.payload : []
    return payload
        .map((m) => {
            const saliente = m?.message_type === 1 || m?.message_type === "outgoing"
            const creado = typeof m?.created_at === "number" ? m.created_at * 1000 : Date.parse(m?.created_at ?? "")
            return {
                contenido: (m?.content || "").toString().trim(),
                privado: Boolean(m?.private),
                saliente,
                creadoEn: Number.isFinite(creado) ? creado : 0,
            }
        })
        .filter((m) => m.contenido.length > 0 && !m.privado)
        .sort((a, b) => a.creadoEn - b.creadoEn)
}

async function registrarTurno(params: {
    conversationId: number
    accountId: number
    mensajeCliente: string
    respuestaBot: string | null
    fotoUrl?: string | null
    escaladoHumano: boolean
    motivoEscalado?: string
    herramientas: any[]
    latenciaMs: number
    resultadoEnvio: "enviado" | "encolado" | "error" | "salteado"
    detalleEnvio?: string
}) {
    try {
        await prisma.$executeRaw`
            INSERT INTO bot_agente_turnos_reales
                (conversation_id, account_id, mensaje_cliente, respuesta_bot, foto_url, escalado_humano, motivo_escalado, herramientas, latencia_ms, resultado_envio, detalle_envio)
            VALUES (${params.conversationId}, ${params.accountId}, ${params.mensajeCliente}, ${params.respuestaBot},
                    ${params.fotoUrl || null}, ${params.escaladoHumano}, ${params.motivoEscalado || null},
                    ${JSON.stringify(params.herramientas || [])}::jsonb, ${params.latenciaMs}, ${params.resultadoEnvio}, ${params.detalleEnvio || null})
        `
    } catch (err) {
        console.error("[bot-agente-tiempo-real] no se pudo registrar el turno:", err)
    }
}

async function procesarTurno(accountId: number, conversationId: number) {
    const buffer = buffers.get(conversationId)
    buffers.delete(conversationId)
    if (!buffer || buffer.mensajes.length === 0) return

    const mensajeUsuario = buffer.mensajes.join("\n")
    const inicio = Date.now()

    try {
        const transcripcion = await traerTranscripcion(accountId, conversationId)

        // Chequeo de seguridad: si justo mientras esperaba el debounce alguien
        // del equipo (o el propio bot) ya le contestó a este cliente en
        // Chatwoot, el ultimo mensaje del hilo real es saliente -- no volver a
        // contestar por encima. Se descarta el buffer sin mandar nada.
        if (transcripcion.length > 0 && transcripcion[transcripcion.length - 1].saliente) {
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: null,
                escaladoHumano: false,
                herramientas: [],
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: "Ya hay una respuesta mas nueva en Chatwoot (humano o bot) cuando se iba a contestar",
            })
            return
        }

        // Todo lo que ya es historial real (todo menos el bloque final que
        // corresponde a este buffer sin responder).
        let cortIdx = transcripcion.length - 1
        while (cortIdx >= 0 && !transcripcion[cortIdx].saliente) cortIdx--
        const historialPrevio: MensajeChat[] = transcripcion.slice(0, cortIdx + 1).map((m) => ({
            rol: m.saliente ? "assistant" : "user",
            contenido: m.contenido,
        }))

        const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historialPrevio, {
            conversationId,
            estadoKey: String(conversationId),
        })

        if (respuesta.escaladoHumano) {
            await escalarAHumano({
                motivo: respuesta.motivoEscalado || "escalado_piloto_tiempo_real",
                resumen_consulta: `[Piloto bot-agente en vivo] ${mensajeUsuario.slice(0, 300)}`,
                conversation_id: conversationId,
            }).catch((err) => console.error("[bot-agente-tiempo-real] fallo al persistir escalado:", err))

            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: null,
                escaladoHumano: true,
                motivoEscalado: respuesta.motivoEscalado,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "encolado",
                detalleEnvio: "Escalado a humano en silencio",
            })
            return
        }

        if (!respuesta.mensajeFinal) return

        // Cadencia humana: demora deliberada para no responder al instante.
        await esperarCadenciaHumana(inicio)

        // Durante la espera pudo contestar un humano del equipo (o llegar un
        // mensaje nuevo que reinició el debounce). Si el hilo real ya tiene una
        // respuesta saliente más nueva, se descarta sin pisar.
        const transcripcionPostEspera = await traerTranscripcion(accountId, conversationId).catch(() => transcripcion)
        if (transcripcionPostEspera.length > 0 && transcripcionPostEspera[transcripcionPostEspera.length - 1].saliente) {
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: "Apareció una respuesta más nueva en Chatwoot durante la demora de cadencia humana",
            })
            return
        }
        if (buffers.has(conversationId)) {
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: "Llegó un mensaje nuevo del cliente durante la demora; se recalcula en el próximo turno",
            })
            return
        }

        try {
            await enviarMensajeChatwoot({ accountId, conversationId, content: respuesta.mensajeFinal })
            if (respuesta.fotoUrl) {
                await enviarImagenChatwoot({ accountId, conversationId, fotoUrl: respuesta.fotoUrl }).catch((err) =>
                    console.error("[bot-agente-tiempo-real] no se pudo mandar la foto:", err)
                )
            }
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                fotoUrl: respuesta.fotoUrl,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "enviado",
            })
        } catch (err: any) {
            console.error("[bot-agente-tiempo-real] fallo el envio a Chatwoot:", err)
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                fotoUrl: respuesta.fotoUrl,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "error",
                detalleEnvio: err.message || String(err),
            })
        }
    } catch (err: any) {
        console.error(`[bot-agente-tiempo-real] error procesando conv ${conversationId}:`, err)
        await registrarTurno({
            conversationId,
            accountId,
            mensajeCliente: mensajeUsuario,
            respuestaBot: null,
            escaladoHumano: false,
            herramientas: [],
            latenciaMs: Date.now() - inicio,
            resultadoEnvio: "error",
            detalleEnvio: err.message || String(err),
        })
    }
}

/**
 * Punto de entrada desde el webhook: acumula el mensaje entrante de una
 * conversacion en piloto y reinicia el debounce de rafaga (mismo criterio de
 * cadencia humana que usa el simulador).
 */
export async function manejarMensajeEntrantePiloto(accountId: number, conversationId: number, texto: string) {
    if (!texto || !texto.trim()) return

    const config = await obtenerConfiguracionAgente().catch(() => null)
    const debounceMs = config?.debounceActivo ? (config.debounceSegundos || 60) * 1000 : 3000

    const existente = buffers.get(conversationId)
    if (existente) {
        clearTimeout(existente.timer)
        existente.mensajes.push(texto)
        existente.timer = setTimeout(() => void procesarTurno(accountId, conversationId), debounceMs)
    } else {
        buffers.set(conversationId, {
            mensajes: [texto],
            timer: setTimeout(() => void procesarTurno(accountId, conversationId), debounceMs),
        })
    }
}

// Mismo margen que lib/chatwoot-cola.ts: pasadas ~23hs desde el ultimo
// mensaje del cliente, WhatsApp rechaza el texto libre (ventana de 24hs
// cerrada) -- hallado el 06/09 reprocesando la cola vieja. No tiene sentido
// intentar mandarlo.
const VENTANA_24HS_MARGEN_MS = 23 * 60 * 60 * 1000

const ESPERA_ENTRE_CONVERSACIONES_MS = 6000
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type ResultadoReprocesoConv = {
    conversationId: number
    contacto: string | null
    resultado: "enviado" | "escalado" | "salteado" | "ventana_24hs_cerrada" | "error"
    detalle: string
}

/**
 * Toma TODA la cola vieja de `respuestas_pendientes` (generada por n8n) y la
 * reprocesa y responde con el motor nuevo: reconstruye la conversacion real
 * desde Chatwoot, genera la respuesta con `ejecutarTurnoAgente`, la manda (o
 * escala en silencio), descarta las filas viejas de esa conversacion, y deja
 * la conversacion en `bot_agente_piloto` para que los mensajes siguientes los
 * siga respondiendo bot-agente en vivo en vez de n8n.
 *
 * Se corre a demanda (botón admin o script) -- no hay cron todavía.
 */
export async function reprocesarColaPendienteConBotAgente(quien = "admin"): Promise<ResultadoReprocesoConv[]> {
    const resumen: ResultadoReprocesoConv[] = []

    const oldest = await prisma.$queryRaw<
        { conversation_id: bigint; account_id: bigint; contacto: string | null; creado_en: Date }[]
    >`
        SELECT DISTINCT ON (conversation_id) conversation_id, account_id, contacto, creado_en
        FROM respuestas_pendientes
        WHERE estado = 'pendiente'
        ORDER BY conversation_id, id ASC
    `

    let primera = true
    for (const conv of oldest) {
        const accountId = Number(conv.account_id)
        const conversationId = Number(conv.conversation_id)
        const contacto = conv.contacto

        if (!primera) await dormir(ESPERA_ENTRE_CONVERSACIONES_MS)
        primera = false

        try {
            const transcripcion = await traerTranscripcion(accountId, conversationId)
            if (transcripcion.length === 0) {
                resumen.push({ conversationId, contacto, resultado: "salteado", detalle: "sin mensajes visibles" })
                continue
            }

            const ultimo = transcripcion[transcripcion.length - 1]
            if (ultimo.saliente) {
                resumen.push({ conversationId, contacto, resultado: "salteado", detalle: "ya respondido en Chatwoot" })
                continue
            }

            if (Date.now() - ultimo.creadoEn > VENTANA_24HS_MARGEN_MS) {
                await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'descartado', motivo = 'Ventana de 24hs de WhatsApp cerrada (bot-agente no lo intento por esto). Requiere plantilla aprobada o que el cliente vuelva a escribir.'
                    WHERE conversation_id = ${conversationId} AND estado = 'pendiente'
                `
                resumen.push({ conversationId, contacto, resultado: "ventana_24hs_cerrada", detalle: "ultimo mensaje del cliente tiene mas de 23hs" })
                continue
            }

            let cortIdx = transcripcion.length - 1
            while (cortIdx >= 0 && !transcripcion[cortIdx].saliente) cortIdx--
            const historialPrevio: MensajeChat[] = transcripcion.slice(0, cortIdx + 1).map((m) => ({
                rol: m.saliente ? "assistant" : "user",
                contenido: m.contenido,
            }))
            const mensajeUsuario = transcripcion.slice(cortIdx + 1).map((m) => m.contenido).join("\n")
            const inicio = Date.now()

            const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historialPrevio, {
                conversationId,
                estadoKey: String(conversationId),
            })

            if (respuesta.escaladoHumano) {
                await escalarAHumano({
                    motivo: respuesta.motivoEscalado || "escalado_reproceso_cola",
                    resumen_consulta: `[Reproceso cola con bot-agente] ${mensajeUsuario.slice(0, 300)}`,
                    conversation_id: conversationId,
                }).catch((err) => console.error("[bot-agente-tiempo-real] fallo al persistir escalado:", err))

                await registrarTurno({
                    conversationId,
                    accountId,
                    mensajeCliente: mensajeUsuario,
                    respuestaBot: null,
                    escaladoHumano: true,
                    motivoEscalado: respuesta.motivoEscalado,
                    herramientas: respuesta.herramientasEjecutadas,
                    latenciaMs: Date.now() - inicio,
                    resultadoEnvio: "encolado",
                    detalleEnvio: "Escalado a humano en silencio (reproceso de cola)",
                })
                await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'descartado', motivo = ${"Escalado a humano por bot-agente: " + (respuesta.motivoEscalado || "")}
                    WHERE conversation_id = ${conversationId} AND estado = 'pendiente'
                `
                resumen.push({ conversationId, contacto, resultado: "escalado", detalle: respuesta.motivoEscalado || "" })
                continue
            }

            if (!respuesta.mensajeFinal) {
                resumen.push({ conversationId, contacto, resultado: "salteado", detalle: "sin mensaje final ni escalado" })
                continue
            }

            await enviarMensajeChatwoot({ accountId, conversationId, content: respuesta.mensajeFinal })
            if (respuesta.fotoUrl) {
                await enviarImagenChatwoot({ accountId, conversationId, fotoUrl: respuesta.fotoUrl }).catch((err) =>
                    console.error("[bot-agente-tiempo-real] no se pudo mandar la foto:", err)
                )
            }

            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                fotoUrl: respuesta.fotoUrl,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "enviado",
            })

            await prisma.$executeRaw`
                UPDATE respuestas_pendientes
                SET estado = 'descartado', motivo = 'Reprocesado y respondido por bot-agente nuevo'
                WHERE conversation_id = ${conversationId} AND estado = 'pendiente'
            `

            // Esta conversacion queda respondida por bot-agente: que los
            // mensajes siguientes tambien los conteste el motor nuevo, no n8n.
            await activarPilotoBotAgente(conversationId, accountId, quien).catch((err) =>
                console.error(`[bot-agente-tiempo-real] no se pudo activar el piloto en conv ${conversationId}:`, err)
            )

            resumen.push({ conversationId, contacto, resultado: "enviado", detalle: respuesta.mensajeFinal.slice(0, 200) })
        } catch (err: any) {
            console.error(`[bot-agente-tiempo-real] error reprocesando conv ${conversationId}:`, err)
            resumen.push({ conversationId, contacto, resultado: "error", detalle: err.message || String(err) })
        }
    }

    return resumen
}
