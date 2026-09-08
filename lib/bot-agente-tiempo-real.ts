import { prisma } from "@/lib/prisma"
import {
    botDentroDeHorario,
    calcularBotPausadoDesdeHistorial,
    chatwootConfig,
    chatwootFetch,
    enviarImagenChatwoot,
    enviarMensajeChatwoot,
    enviarNotaPrivadaChatwoot,
    esPlaceholderDeChatwoot,
} from "@/lib/chatwoot-bot"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { escalarAHumano } from "@/bot-agente/herramientas/escalar-humano"
import { MensajeChat } from "@/bot-agente/tipos"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"
import { cerrarEscaladoPendienteSiRespondioHumano } from "@/bot-agente/nucleo/estado-persistente"

// Puente entre el webhook real de Chatwoot y el motor bot-agente para las
// conversaciones marcadas como piloto (tabla `bot_agente_piloto`). Corre en el
// mismo proceso Node de la app (mismo supuesto que lib/chatwoot-cola.ts), asi
// que un Map en memoria alcanza para el debounce de rafaga: no sobrevive a un
// reinicio del server, pero eso solo afecta al piloto controlado, no a
// produccion real (que todavia la maneja n8n).

type BufferConversacion = {
    mensajes: string[]
    timer: NodeJS.Timeout
    /**
     * Veces que este lote se reencoló porque, al ir a mandarlo, el propio bot ya
     * había contestado otra cosa. Tope para no entrar en loop.
     */
    reencolados?: number
}

const buffers = new Map<number, BufferConversacion>()

/**
 * Conversaciones con un turno EN VUELO (modelo + herramientas + demora humana:
 * hasta ~2 min). Sin este candado, una ráfaga partida en dos turnos corría en
 * paralelo, ambos generaban respuesta y el segundo se descartaba al ver que ya
 * había un saliente más nuevo — la pregunta del cliente quedaba sin contestar.
 * Pasó en la conv 3561 (07/09): "Un Motomel s2" + "Hay q modificar sigueñal?"
 * en 24 segundos; se contestó la moto y la del cigüeñal se tiró a la basura.
 */
const turnosEnVuelo = new Set<number>()

/** Cuánto esperar para reintentar cuando la conversación tiene un turno en vuelo. */
const ESPERA_TURNO_EN_VUELO_MS = 10_000

/** Tope de reencolados por lote (mejor un mensaje sin contestar que un loop). */
const MAX_REENCOLADOS = 1

const dormirMs = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Cálculo puro (testeable) de cuántos ms falta esperar para que la respuesta no
 * salga instantánea y parezca escrita por una persona: se elige un objetivo
 * aleatorio en [min, max] segundos y se descuenta lo que ya tardó el turno
 * (modelo + herramientas), así el total percibido por el cliente cae siempre
 * dentro de esa ventana. Nunca espera más que `maxSeg` ni menos que 0.
 */
export function calcularEsperaCadenciaHumanaMs(
    minSeg: number,
    maxSeg: number,
    transcurridoMs: number,
    rnd: number = Math.random()
): number {
    const min = Math.max(0, minSeg) * 1000
    const max = Math.max(min, maxSeg * 1000)
    const objetivo = min + Math.max(0, Math.min(1, rnd)) * (max - min)
    return Math.max(0, Math.min(objetivo - Math.max(0, transcurridoMs), max))
}

/** Aplica la demora deliberada leyendo la config de `chat_config`. */
async function esperarCadenciaHumana(inicioTurnoMs: number) {
    const config = await obtenerConfiguracionAgente().catch(() => null)
    if (!config || !config.respuestaDelayActivo) return
    const restante = calcularEsperaCadenciaHumanaMs(
        config.respuestaDelayMinSeg,
        config.respuestaDelayMaxSeg,
        Date.now() - inicioTurnoMs
    )
    if (restante > 0) await dormirMs(restante)
}

/**
 * ¿El equipo sacó al bot de esta conversación? Solo aplica en modo global: ahí
 * `/bot off` (switch de /admin/chatwoot/chats-vivo) y una respuesta pública de
 * un humano real significan "me hago cargo, callate" — y ya no está n8n para
 * respetarlo. En modo piloto (global apagado) `/bot off` es el mecanismo de
 * corte de n8n y NO debe frenar al motor nuevo, así que devolvemos false.
 */
async function debeCallarsePorPausaHumana(accountId: number, conversationId: number): Promise<boolean> {
    const global = await botAgenteGlobalActivo().catch(() => false)
    if (!global) return false
    const pausado = await calcularBotPausadoDesdeHistorial(accountId, conversationId).catch(() => null)
    return pausado === true
}

/**
 * ¿El bot-agente está en modo global (responde TODAS las conversaciones, no solo
 * las de `bot_agente_piloto`)? Se prende con la clave `bot_agente_global` en
 * chat_config. Requiere que n8n esté apagado para no responder por duplicado.
 */
export async function botAgenteGlobalActivo(): Promise<boolean> {
    try {
        const filas = await prisma.$queryRaw<{ valor: string }[]>`
            SELECT valor FROM chat_config WHERE clave = 'bot_agente_global' LIMIT 1
        `
        return filas[0]?.valor === "true"
    } catch {
        return false
    }
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

type MensajeRaw = {
    contenido: string
    privado: boolean
    saliente: boolean
    creadoEn: number
    /** true si lo mandó el usuario Bot de Chatwoot (no un humano del equipo). */
    delBot: boolean
}

async function traerTranscripcion(accountId: number, conversationId: number): Promise<MensajeRaw[]> {
    const { api, token, botUserId } = chatwootConfig()
    const res = await chatwootFetch(`${api}/accounts/${accountId}/conversations/${conversationId}/messages`, {
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
                delBot: saliente && Number(m?.sender?.id) === botUserId,
            }
        })
        // Los carteles de Chatwoot ("This message is unavailable.") no son parte
        // de la charla: fuera del historial y fuera de lo que se responde.
        .filter((m) => m.contenido.length > 0 && !m.privado && !esPlaceholderDeChatwoot(m.contenido))
        .sort((a, b) => a.creadoEn - b.creadoEn)
}

/**
 * Historial previo de un turno: el hilo completo MENOS los mensajes que este
 * turno va a responder (los del buffer, que ya viajan como mensaje del cliente).
 *
 * Se recortan del final y solo mientras coincidan uno a uno con el buffer. Todo
 * lo demas queda: en particular los mensajes del cliente que quedaron SIN
 * respuesta (escalado en silencio del turno anterior), que antes se perdian.
 * Exportada para poder testearla sin Chatwoot.
 */
export function recortarMensajesDelTurno<T extends { contenido: string; saliente: boolean }>(
    transcripcion: T[],
    mensajesDelTurno: string[]
): T[] {
    const pendientes = mensajesDelTurno.map((m) => m.trim()).filter(Boolean)
    let corte = transcripcion.length
    while (corte > 0 && pendientes.length > 0) {
        const m = transcripcion[corte - 1]
        if (m.saliente) break
        if (m.contenido.trim() !== pendientes[pendientes.length - 1]) break
        pendientes.pop()
        corte--
    }
    return transcripcion.slice(0, corte)
}

/**
 * Silencio a partir del cual el tramo anterior del hilo se considera una charla
 * distinta (el cliente volvio dias/semanas despues).
 */
const GAP_NUEVA_SESION_MS = 6 * 60 * 60 * 1000

/**
 * Arma el historial para el motor a partir del hilo previo (ya sin los mensajes
 * del turno actual). Si adentro hay un silencio de +6hs, todo lo anterior a ese
 * silencio es una charla vieja: se deja en el contexto pero con una nota para que
 * el modelo la use como dato de fondo (la moto, el kit que miraba) y NO reabra
 * preguntas que el cliente no volvio a mencionar.
 *
 * conv 2931 (08/09): el cliente volvio a los 11 dias con un "Hola" y el bot le
 * contesto un "tienen levas levantadas?" de la charla vieja, ofreciendole un
 * combo con escape que nunca pidio. Exportada para testear sin Chatwoot.
 */
export function armarHistorialPrevio<T extends { contenido: string; saliente: boolean; creadoEn: number }>(
    hiloPrevio: T[]
): MensajeChat[] {
    const aMensaje = (m: T): MensajeChat => ({ rol: m.saliente ? "assistant" : "user", contenido: m.contenido })

    let corte = 0
    for (let i = 1; i < hiloPrevio.length; i++) {
        if (hiloPrevio[i].creadoEn - hiloPrevio[i - 1].creadoEn > GAP_NUEVA_SESION_MS) corte = i
    }
    if (corte === 0) return hiloPrevio.map(aMensaje)

    const dias = Math.max(1, Math.round((hiloPrevio[corte].creadoEn - hiloPrevio[corte - 1].creadoEn) / 86_400_000))
    return [
        ...hiloPrevio.slice(0, corte).map(aMensaje),
        {
            rol: "system",
            contenido:
                `[Lo de arriba es de una charla anterior de hace ~${dias} dia(s). ` +
                `Puede tener preguntas del cliente que quedaron sin responder: NO las retomes por tu cuenta. ` +
                `Responde solo lo que el cliente escribe ahora. Podes usar datos de esa charla (su moto, el kit que miraba) ` +
                `pero no reabras temas que el no volvio a mencionar.]`,
        },
        ...hiloPrevio.slice(corte).map(aMensaje),
    ]
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
    // Un solo turno a la vez por conversación: si hay uno en vuelo, el lote se
    // queda en el buffer y se reprograma. Cuando le toque, el historial ya
    // incluirá la respuesta del turno anterior y el modelo contestará lo que
    // falta en vez de duplicar o perderse.
    if (turnosEnVuelo.has(conversationId)) {
        const enEspera = buffers.get(conversationId)
        if (enEspera) {
            clearTimeout(enEspera.timer)
            enEspera.timer = setTimeout(
                () => void procesarTurno(accountId, conversationId),
                ESPERA_TURNO_EN_VUELO_MS
            )
        }
        return
    }

    const buffer = buffers.get(conversationId)
    buffers.delete(conversationId)
    if (!buffer || buffer.mensajes.length === 0) return

    const mensajesDelTurno = buffer.mensajes
    const reencoladosPrevios = buffer.reencolados || 0
    const mensajeUsuario = mensajesDelTurno.join("\n")
    const inicio = Date.now()
    turnosEnVuelo.add(conversationId)

    /**
     * Devuelve este lote al buffer para que un turno posterior lo reconsidere
     * con el historial ya actualizado. Se usa cuando la respuesta se descarta
     * por una causa que NO significa "ya está atendido" (el propio bot contestó
     * otro pedazo de la ráfaga). Si contestó un HUMANO no se reencola: el
     * equipo se hizo cargo.
     */
    const reencolarLote = (): boolean => {
        if (reencoladosPrevios >= MAX_REENCOLADOS) return false
        const nuevo = buffers.get(conversationId)
        if (nuevo) {
            nuevo.mensajes.unshift(...mensajesDelTurno)
            nuevo.reencolados = Math.max(nuevo.reencolados || 0, reencoladosPrevios + 1)
        } else {
            buffers.set(conversationId, {
                mensajes: [...mensajesDelTurno],
                reencolados: reencoladosPrevios + 1,
                timer: setTimeout(
                    () => void procesarTurno(accountId, conversationId),
                    ESPERA_TURNO_EN_VUELO_MS
                ),
            })
        }
        return true
    }

    // El webhook dejó una fila en `bot_agente_entrantes_pendientes` al recibir
    // el mensaje (antes de este trabajo async). Se borra cuando este turno lo
    // atiende de verdad (respondió, escaló, o alguien más contestó). Si el
    // proceso se cae antes de eso, la fila queda y el barrido la recupera.
    // NO se borra si: local cerrado (espera la apertura) o llegó una ráfaga
    // nueva (la maneja el próximo turno).
    let pendienteResuelto = false

    // Si llega un mensaje nuevo del cliente mientras este turno estaba en vuelo,
    // `manejarMensajeEntrantePiloto` crea un buffer nuevo. En vez de tirar los
    // mensajes que este turno ya tenía (se perdían: el turno siguiente arrancaba
    // solo con el mensaje nuevo), los devolvemos al frente del buffer nuevo para
    // que el próximo turno los procese todos juntos.
    const devolverMensajesSiHayRafagaNueva = () => {
        const nuevo = buffers.get(conversationId)
        if (nuevo) nuevo.mensajes.unshift(...mensajesDelTurno)
    }

    try {
        // Local cerrado: NO se llama al modelo y NO se encola una respuesta por
        // mensaje. La fila de `bot_agente_entrantes_pendientes` (la puso el
        // webhook) queda tal cual; al abrir el local, `atenderEntrantesPendientes()`
        // reconstruye el hilo completo y responde UNA sola vez. Así se corta la
        // lluvia de mensajes desfasados que salía cuando cada mensaje de la
        // noche encolaba su propia respuesta (convs 3528 / 3565 / 2900).
        const dentroDeHorario = await botDentroDeHorario().catch(() => true)
        if (!dentroDeHorario) {
            // Defensivo por si el webhook no llegó a registrarlo.
            await marcarEntrantePendiente(accountId, conversationId)
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: null,
                escaladoHumano: false,
                herramientas: [],
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "encolado",
                detalleEnvio: "Local cerrado: se responde consolidado al abrir",
            })
            return
        }

        // El equipo puede sacar al bot de esta charla (switch de
        // /admin/chatwoot/chats-vivo -> `/bot off`, o una respuesta pública de un
        // humano). En modo global ya no está n8n para respetarlo: lo hacemos acá.
        if (await debeCallarsePorPausaHumana(accountId, conversationId)) {
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: null,
                escaladoHumano: false,
                herramientas: [],
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: "Bot en pausa para esta conversación (/bot off o un humano del equipo se hizo cargo)",
            })
            pendienteResuelto = true
            return
        }

        const transcripcion = await traerTranscripcion(accountId, conversationId)

        // Si un compañero ya contestó en el chat después de un escalado, ese
        // pendiente deja de pesar en la memoria de la charla.
        const ultimaHumana = [...transcripcion].reverse().find((m) => m.saliente && !m.delBot)
        await cerrarEscaladoPendienteSiRespondioHumano(
            String(conversationId),
            ultimaHumana?.creadoEn || null
        ).catch(() => {})

        // Chequeo de seguridad: si justo mientras esperaba el debounce alguien
        // del equipo (o el propio bot) ya le contestó a este cliente en
        // Chatwoot, el ultimo mensaje del hilo real es saliente -- no volver a
        // contestar por encima. Se descarta el buffer sin mandar nada.
        const ultimoDelHilo = transcripcion[transcripcion.length - 1]
        if (ultimoDelHilo?.saliente) {
            // Si contestó el propio BOT (otro turno de la misma ráfaga), este
            // lote todavía puede tener preguntas sin responder: se reencola para
            // que el próximo turno lo vea junto con esa respuesta en el historial.
            // Si contestó un HUMANO, el equipo se hizo cargo: se descarta.
            const reencolado = ultimoDelHilo.delBot && reencolarLote()
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: null,
                escaladoHumano: false,
                herramientas: [],
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: reencolado
                    ? "El bot ya contestó otro tramo de la ráfaga: lote reencolado para responder lo que falta"
                    : "Ya hay una respuesta mas nueva en Chatwoot (humano o bot) cuando se iba a contestar",
            })
            pendienteResuelto = !reencolado
            return
        }

        // Historial real = todo el hilo MENOS los mensajes de este buffer (que
        // van como mensaje del turno). Antes se cortaba en el ultimo saliente:
        // los mensajes del cliente que habian quedado SIN respuesta saliente
        // desaparecian del contexto. Pasa siempre despues de un escalado en
        // silencio -- conv 3637 (08/09): se escalo "escape paolucci para
        // varillero s2 motomel", el cliente insistio con "??" y el modelo, que
        // ya no veia esa pregunta, contesto sobre el kit 170 de media hora antes.
        const historialPrevio: MensajeChat[] = armarHistorialPrevio(
            recortarMensajesDelTurno(transcripcion, mensajesDelTurno)
        )

        const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historialPrevio, {
            conversationId,
            estadoKey: String(conversationId),
        })

        if (respuesta.escaladoHumano) {
            // El motor ya deja el pendiente en la bandeja del equipo en casi todas
            // sus salidas de escalado. Solo se persiste acá cuando no lo hizo (ej.
            // `limite_pasos_react_superado`); antes se insertaba siempre y cada
            // escalado dejaba DOS filas en el panel de pendientes (conv 3599).
            if (!respuesta.escaladoPersistido) {
                await escalarAHumano({
                    motivo: respuesta.motivoEscalado || "otro",
                    resumen_consulta: `[Piloto bot-agente en vivo] ${mensajeUsuario.slice(0, 300)}`,
                    conversation_id: conversationId,
                }).catch((err) => console.error("[bot-agente-tiempo-real] fallo al persistir escalado:", err))
            }

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
            pendienteResuelto = true
            return
        }

        if (!respuesta.mensajeFinal) {
            // El motor decidió no decir nada (y no escaló): es una decisión, no
            // un error — se da por atendido para no reintentarlo en loop.
            pendienteResuelto = true
            return
        }

        // Cadencia humana: demora deliberada para no responder al instante.
        await esperarCadenciaHumana(inicio)

        // Durante la espera pudo contestar un humano del equipo (o llegar un
        // mensaje nuevo que reinició el debounce). Si el hilo real ya tiene una
        // respuesta saliente más nueva, se descarta sin pisar.
        const transcripcionPostEspera = await traerTranscripcion(accountId, conversationId).catch(() => transcripcion)
        const ultimoPostEspera = transcripcionPostEspera[transcripcionPostEspera.length - 1]
        if (ultimoPostEspera?.saliente) {
            const reencolado = ultimoPostEspera.delBot && reencolarLote()
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: reencolado
                    ? "El bot contestó otro tramo durante la demora: lote reencolado para responder lo que falta"
                    : "Apareció una respuesta más nueva en Chatwoot durante la demora de cadencia humana",
            })
            pendienteResuelto = !reencolado
            return
        }
        if (buffers.has(conversationId)) {
            devolverMensajesSiHayRafagaNueva()
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
        // Durante la demora el equipo pudo tocar `/bot off` (nota privada, que no
        // aparece como mensaje saliente en el chequeo de arriba). Re-chequeo.
        if (await debeCallarsePorPausaHumana(accountId, conversationId)) {
            await registrarTurno({
                conversationId,
                accountId,
                mensajeCliente: mensajeUsuario,
                respuestaBot: respuesta.mensajeFinal,
                escaladoHumano: false,
                herramientas: respuesta.herramientasEjecutadas,
                latenciaMs: Date.now() - inicio,
                resultadoEnvio: "salteado",
                detalleEnvio: "El bot quedó en pausa durante la demora de cadencia humana (/bot off o un humano se hizo cargo)",
            })
            pendienteResuelto = true
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
            pendienteResuelto = true
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
        // NO se marca resuelto: la fila queda y el barrido reintenta (con tope).
    } finally {
        // Liberar la conversación ANTES de cualquier await pendiente: si quedó
        // un lote reencolado, su timer ya puede arrancar.
        turnosEnVuelo.delete(conversationId)

        // Se atendió (respondió / escaló / alguien más contestó / silencio
        // deliberado): borrar la fila del webhook. El guard por `ultimo_mensaje_en`
        // evita pisar una ráfaga nueva que entró durante este turno.
        if (pendienteResuelto) {
            await prisma.$executeRaw`
                DELETE FROM bot_agente_entrantes_pendientes
                WHERE conversation_id = ${conversationId}
                  AND ultimo_mensaje_en <= ${new Date(inicio)}
            `.catch((err) =>
                console.error("[bot-agente-tiempo-real] no se pudo borrar entrante pendiente:", err)
            )
        }
    }
}

/**
 * Registro DURABLE de un mensaje entrante, ANTES de arrancar el trabajo async.
 * El webhook lo llama con cada mensaje del cliente que rutea al motor. Si el
 * proceso se cae antes de responder (deploy, crash) la fila queda y el barrido
 * `atenderEntrantesPendientes()` la recupera. `procesarTurno` la borra al
 * atenderla (guard por `ultimo_mensaje_en` para no pisar una ráfaga nueva).
 */
export async function marcarEntrantePendiente(accountId: number, conversationId: number): Promise<void> {
    await prisma.$executeRaw`
        INSERT INTO bot_agente_entrantes_pendientes
            (conversation_id, account_id, primer_mensaje_en, ultimo_mensaje_en, actualizado_en)
        VALUES (${conversationId}, ${accountId}, now(), now(), now())
        ON CONFLICT (conversation_id) DO UPDATE
        SET ultimo_mensaje_en = now(), actualizado_en = now()
    `.catch((err) =>
        console.error("[bot-agente-tiempo-real] no se pudo marcar entrante pendiente:", err)
    )
}

/**
 * Punto de entrada desde el webhook: acumula el mensaje entrante de una
 * conversacion en piloto y reinicia el debounce de rafaga (mismo criterio de
 * cadencia humana que usa el simulador).
 */
export async function manejarMensajeEntrantePiloto(accountId: number, conversationId: number, texto: string) {
    if (!texto || !texto.trim()) return

    const config = await obtenerConfiguracionAgente().catch(() => null)
    // Con debounce off igual agrupamos 5s: 3s partía ráfagas reales de WhatsApp
    // en turnos separados y las respuestas se pisaban entre sí (conv 3579).
    const debounceMs = config?.debounceActivo ? (config.debounceSegundos || 15) * 1000 : 5000

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

// --- Barrido de ENTRANTES PENDIENTES ----------------------------------------
// Se guarda el MOMENTO en que arrancó (no un booleano) para que un run colgado
// no bloquee para siempre -- mismo patrón que `despachandoDesde` en la cola.
const BARRIDO_MAX_MS = 5 * 60 * 1000
// Grace: no tocar filas más nuevas que esto -- un turno vivo (modelo + demora
// humana 50-70s) puede tardar ~2 min; recién pasado ese margen asumimos que
// murió y hay que recuperarlo.
const BARRIDO_GRACE_MS = 4 * 60 * 1000
let barridoDesde: number | null = null
const barridoEnCurso = () => barridoDesde !== null && Date.now() - barridoDesde < BARRIDO_MAX_MS

/** Dispara el barrido sin bloquear a quien lo gatilló (webhook, cola, setInterval). */
export function atenderEntrantesPendientesEnSegundoPlano() {
    void atenderEntrantesPendientes().catch((err) =>
        console.error("[bot-agente-tiempo-real] falló el barrido de entrantes pendientes:", err)
    )
}

/**
 * BARRIDO de entrantes pendientes: recorre `bot_agente_entrantes_pendientes`
 * (la puebla el webhook con cada mensaje del cliente; `procesarTurno` borra la
 * fila cuando atendió). Las filas que sobreviven al grace de 4 min son:
 *   - conversaciones que escribieron con el local CERRADO (esperan la apertura),
 *   - turnos que murieron en vuelo (deploy de Coolify, crash) y Chatwoot ya no
 *     reintenta porque recibió el 200 del webhook (conv 3575, 07/09).
 * Por cada una reconstruye el hilo desde Chatwoot y responde UNA sola vez
 * (o escala en silencio). Escalonado entre conversaciones.
 *
 * Se dispara oportunista: webhook con cada mensaje entrante, `sincronizarEstadoBot`
 * al abrir el local, un `setInterval` cada 3 min, y a mano con
 * `scripts/atender-pendientes.ts`. Se auto-protege: no hace nada fuera de
 * horario (salvo `forzar`), ni con otro barrido en curso, ni sin filas vencidas.
 */
export async function atenderEntrantesPendientes(
    opciones: { forzar?: boolean } = {}
): Promise<void> {
    if (barridoEnCurso()) return
    if (!opciones.forzar && !(await botDentroDeHorario().catch(() => false))) return

    const graceCutoff = new Date(Date.now() - (opciones.forzar ? 0 : BARRIDO_GRACE_MS))
    const filas = await prisma.$queryRaw<
        { conversation_id: bigint; account_id: bigint; intentos: number }[]
    >`
        SELECT conversation_id, account_id, intentos
        FROM bot_agente_entrantes_pendientes
        WHERE ultimo_mensaje_en <= ${graceCutoff}
        ORDER BY primer_mensaje_en ASC
    `
    if (filas.length === 0) return

    barridoDesde = Date.now()
    try {
        let primera = true
        for (const fila of filas) {
            const conversationId = Number(fila.conversation_id)
            const accountId = Number(fila.account_id)

            const quitarFila = async () => {
                await prisma.$executeRaw`
                    DELETE FROM bot_agente_entrantes_pendientes WHERE conversation_id = ${conversationId}
                `.catch((e) =>
                    console.error(`[entrantes-pendientes] no se pudo borrar la fila de conv ${conversationId}:`, e.message)
                )
            }

            if (!primera) await dormir(ESPERA_ENTRE_CONVERSACIONES_MS)
            primera = false

            try {
                // Corte anti-loop: si esta conversación ya falló 3 barridos, se
                // saca de la cola y se escala para que la vea un humano.
                if (fila.intentos >= 3) {
                    await escalarAHumano({
                        motivo: "entrante_pendiente_sin_resolver",
                        resumen_consulta: `[entrantes-pendientes] conv ${conversationId}: ${fila.intentos} intentos fallidos`,
                        conversation_id: conversationId,
                    }).catch(() => {})
                    await quitarFila()
                    continue
                }
                await prisma.$executeRaw`
                    UPDATE bot_agente_entrantes_pendientes
                    SET intentos = intentos + 1, actualizado_en = now()
                    WHERE conversation_id = ${conversationId}
                `

                const transcripcion = await traerTranscripcion(accountId, conversationId)
                if (transcripcion.length === 0) {
                    await quitarFila()
                    continue
                }

                const ultimo = transcripcion[transcripcion.length - 1]
                if (ultimo.saliente) {
                    // Ya contestó un humano o el bot mientras tanto.
                    await quitarFila()
                    continue
                }

                if (Date.now() - ultimo.creadoEn > VENTANA_24HS_MARGEN_MS) {
                    await registrarTurno({
                        conversationId,
                        accountId,
                        mensajeCliente: ultimo.contenido,
                        respuestaBot: null,
                        escaladoHumano: false,
                        herramientas: [],
                        latenciaMs: 0,
                        resultadoEnvio: "salteado",
                        detalleEnvio: "Barrido: ventana de 24hs de WhatsApp cerrada, requiere plantilla o que el cliente vuelva a escribir",
                    })
                    await quitarFila()
                    continue
                }

                if (await debeCallarsePorPausaHumana(accountId, conversationId)) {
                    await quitarFila()
                    continue
                }

                let cortIdx = transcripcion.length - 1
                while (cortIdx >= 0 && !transcripcion[cortIdx].saliente) cortIdx--
                const historialPrevio: MensajeChat[] = armarHistorialPrevio(transcripcion.slice(0, cortIdx + 1))
                const mensajeUsuario = transcripcion
                    .slice(cortIdx + 1)
                    .map((m) => m.contenido)
                    .join("\n")
                if (!mensajeUsuario.trim()) {
                    await quitarFila()
                    continue
                }

                const inicio = Date.now()
                const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historialPrevio, {
                    conversationId,
                    estadoKey: String(conversationId),
                })

                if (respuesta.escaladoHumano) {
                    // Igual que en el camino en vivo: el motor ya dejó el pendiente
                    // salvo en sus salidas sin persistencia. Insertar siempre
                    // duplicaba la fila en el panel del equipo.
                    if (!respuesta.escaladoPersistido) {
                        await escalarAHumano({
                            motivo: respuesta.motivoEscalado || "otro",
                            resumen_consulta: `[barrido entrantes pendientes] ${mensajeUsuario.slice(0, 300)}`,
                            conversation_id: conversationId,
                        }).catch((err) => console.error("[entrantes-pendientes] fallo al persistir escalado:", err))
                    }
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
                        detalleEnvio: "Barrido: escalado a humano en silencio",
                    })
                    await quitarFila()
                    continue
                }

                if (!respuesta.mensajeFinal) {
                    await registrarTurno({
                        conversationId,
                        accountId,
                        mensajeCliente: mensajeUsuario,
                        respuestaBot: null,
                        escaladoHumano: false,
                        herramientas: respuesta.herramientasEjecutadas,
                        latenciaMs: Date.now() - inicio,
                        resultadoEnvio: "salteado",
                        detalleEnvio: "Barrido: el motor no devolvió mensaje ni escalado",
                    })
                    await quitarFila()
                    continue
                }

                try {
                    await enviarMensajeChatwoot({ accountId, conversationId, content: respuesta.mensajeFinal })
                    if (respuesta.fotoUrl) {
                        await enviarImagenChatwoot({ accountId, conversationId, fotoUrl: respuesta.fotoUrl }).catch(
                            (err) => console.error("[entrantes-pendientes] no se pudo mandar la foto:", err)
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
                        detalleEnvio: "Barrido: respuesta consolidada del hilo completo",
                    })
                    await quitarFila()
                } catch (err: any) {
                    console.error(`[entrantes-pendientes] fallo el envío a Chatwoot en conv ${conversationId}:`, err)
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
                    // NO se borra la fila: se reintenta en el próximo barrido (hasta 3).
                }
            } catch (err: any) {
                console.error(`[entrantes-pendientes] error procesando conv ${conversationId}:`, err)
                // La fila queda para reintento en el próximo barrido.
            }
        }
    } finally {
        barridoDesde = null
    }
}

// Barrido periódico: recupera conversaciones cuyo turno murió a mitad de camino
// (deploy, crash) aunque no llegue tráfico nuevo que lo dispare. Idempotente y
// con lock propio; `unref` para no mantener vivo el proceso por sí solo.
if (typeof setInterval === "function" && !(globalThis as any).__botAgenteBarridoInterval) {
    const t = setInterval(() => atenderEntrantesPendientesEnSegundoPlano(), 3 * 60 * 1000)
    if (typeof (t as any).unref === "function") (t as any).unref()
    ;(globalThis as any).__botAgenteBarridoInterval = t
}

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
    const global = await botAgenteGlobalActivo().catch(() => false)

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

            // Mismo criterio que el vivo: en global, `/bot off` o un humano que
            // ya se hizo cargo dejan la conversación fuera del alcance del motor.
            if (global && (await calcularBotPausadoDesdeHistorial(accountId, conversationId).catch(() => null)) === true) {
                resumen.push({ conversationId, contacto, resultado: "salteado", detalle: "bot en pausa (/bot off o un humano se hizo cargo)" })
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
            const historialPrevio: MensajeChat[] = armarHistorialPrevio(transcripcion.slice(0, cortIdx + 1))
            const mensajeUsuario = transcripcion.slice(cortIdx + 1).map((m) => m.contenido).join("\n")
            const inicio = Date.now()

            const respuesta = await ejecutarTurnoAgente(mensajeUsuario, historialPrevio, {
                conversationId,
                estadoKey: String(conversationId),
            })

            if (respuesta.escaladoHumano) {
                // Ver el comentario del camino en vivo: solo se persiste si el
                // motor no lo hizo, para no duplicar el pendiente del equipo.
                if (!respuesta.escaladoPersistido) {
                    await escalarAHumano({
                        motivo: respuesta.motivoEscalado || "otro",
                        resumen_consulta: `[Reproceso cola con bot-agente] ${mensajeUsuario.slice(0, 300)}`,
                        conversation_id: conversationId,
                    }).catch((err) => console.error("[bot-agente-tiempo-real] fallo al persistir escalado:", err))
                }

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
            // En modo global el webhook ya enruta TODO al motor nuevo, así que
            // marcar el piloto (y mandar `/bot off`) es redundante y encima
            // dispararía el gate de pausa en el próximo turno.
            if (!global) {
                await activarPilotoBotAgente(conversationId, accountId, quien).catch((err) =>
                    console.error(`[bot-agente-tiempo-real] no se pudo activar el piloto en conv ${conversationId}:`, err)
                )
            }

            resumen.push({ conversationId, contacto, resultado: "enviado", detalle: respuesta.mensajeFinal.slice(0, 200) })
        } catch (err: any) {
            console.error(`[bot-agente-tiempo-real] error reprocesando conv ${conversationId}:`, err)
            resumen.push({ conversationId, contacto, resultado: "error", detalle: err.message || String(err) })
        }
    }

    return resumen
}
