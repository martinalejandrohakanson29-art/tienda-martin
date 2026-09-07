import { NextResponse } from "next/server"
import { guardarConversacionesEnEspejo } from "@/lib/chatwoot-chats-vivo"
import { emitirEventoChatwoot, type EventoChatwootEnVivo } from "@/lib/chatwoot-events"
import { calcularBotPausadoDesdeHistorial, chatwootConfig } from "@/lib/chatwoot-bot"
import { botAgenteGlobalActivo, esConversacionPiloto, manejarMensajeEntrantePiloto } from "@/lib/bot-agente-tiempo-real"
import { empujarCola } from "@/lib/chatwoot-cola"

export const dynamic = "force-dynamic"

/**
 * Webhook de Chatwoot para mantener la tabla espejo de conversaciones actualizada en tiempo real.
 *
 * Configurable en Chatwoot (Settings -> Integrations -> Webhooks) con la URL:
 * https://revolucionmotos.tech/api/chatwoot/webhook
 *
 * Totalmente independiente de n8n: no interfiere con los webhooks que ya procesa n8n.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) {
            return NextResponse.json({ ok: false, error: "Cuerpo vacío" }, { status: 400 })
        }

        const eventoNombre = (body.event || "").toString()
        let conversacion = body.conversation || (body.id && body.meta ? body : null)
        const conversationId = Number(conversacion?.id || body.conversation?.id || body.conversation_id || 0)

        // Solo un mensaje realmente nuevo (o una conversación nueva) cuenta como
        // "actividad" que reordena la lista y reescribe el último mensaje del
        // espejo. Chatwoot también dispara message_updated / conversation_updated
        // por cosas que NO son un mensaje nuevo (checks de lectura, cambio de
        // etiqueta/asignado, transcripción de audio); si esos también movieran la
        // fecha, una conversación vieja aparecía arriba de todo con un mensaje
        // viejo y "hace un rato" (falso "le respondimos fuera de horario").
        const esActividadNueva = eventoNombre === "message_created" || eventoNombre === "conversation_created"

        // Si el evento es message_created, asegurar que conversacion tenga el último mensaje
        const m = body.messages?.[0] || body
        if (esActividadNueva && conversacion && (body.content !== undefined || body.attachments || body.messages?.[0])) {
            conversacion = {
                ...conversacion,
                meta: conversacion.meta || { sender: body.sender || m.sender },
                last_non_activity_message: {
                    content: m.content,
                    message_type: m.message_type,
                    attachments: m.attachments || body.attachments,
                },
                last_activity_at: Math.floor(Date.now() / 1000),
            }
        } else if (esActividadNueva && !conversacion && body.conversation_id) {
            conversacion = {
                id: body.conversation_id,
                inbox_id: body.inbox_id,
                status: body.status || "open",
                meta: body.meta || { sender: body.sender },
                unread_count: body.unread_count || 1,
                last_non_activity_message: body.content ? { content: body.content, message_type: body.message_type } : undefined,
                last_activity_at: Math.floor(Date.now() / 1000),
            }
        }

        if (esActividadNueva && conversacion && conversacion.id) {
            await guardarConversacionesEnEspejo([conversacion])
        }

        // bot-agente: responde las conversaciones en modo global (todas) o, si el
        // global está apagado, solo las marcadas en `bot_agente_piloto`. n8n debe
        // estar apagado cuando el global está prendido, para no duplicar.
        //
        // OJO: esto se AWAITEA antes de responder el webhook. Un `void promise`
        // acá no es confiable: Next puede cerrar el contexto del request y dejar
        // sin ejecutar las continuaciones async (por eso el piloto no producía
        // turnos y la cola no drenaba). El trabajo pesado (`procesarTurno`) sí
        // corre después vía setTimeout — el server es un proceso vivo — pero el
        // buffer hay que dejarlo registrado antes de devolver la respuesta.
        if (eventoNombre === "message_created" && conversationId > 0) {
            const mensajeEntrante = body.messages?.[0] || body
            const esEntrante = mensajeEntrante?.message_type === 0 || mensajeEntrante?.message_type === "incoming"
            // Un mensaje `incoming` no privado ES del cliente. NO exigir
            // `sender.type === "contact"`: el payload del webhook de Chatwoot no
            // siempre trae ese campo (a diferencia de la API REST), y cuando
            // faltaba, este bloque entero no se ejecutaba — el piloto nunca
            // recibió un turno por webhook y la cola no drenaba (07/09).
            const esDeCliente = !mensajeEntrante?.private
            const textoEntrante = (mensajeEntrante?.content || "").toString().trim()

            console.log(
                `[webhook bot-agente] conv=${conversationId} event=${eventoNombre} mtype=${JSON.stringify(mensajeEntrante?.message_type)} priv=${mensajeEntrante?.private} senderType=${JSON.stringify(mensajeEntrante?.sender?.type)} entrante=${esEntrante} cliente=${esDeCliente} texto=${textoEntrante.length}`
            )

            if (esEntrante && esDeCliente && textoEntrante) {
                try {
                    // Cada mensaje entrante del cliente es una oportunidad de
                    // drenar la cola diferida (reemplaza el gatillo que antes
                    // daba n8n vía /api/chatwoot/enviar).
                    await empujarCola()

                    const [global, piloto] = await Promise.all([
                        botAgenteGlobalActivo(),
                        esConversacionPiloto(conversationId),
                    ])
                    if (global || piloto) {
                        await manejarMensajeEntrantePiloto(1, conversationId, textoEntrante)
                    }
                } catch (err) {
                    console.error("[webhook chatwoot] error en bot-agente:", err)
                }
            }
        }

        // Si vino un mensaje en el webhook, armar el objeto para emitir en vivo al cliente
        let mensajeEmitido: EventoChatwootEnVivo["mensaje"] | undefined
        let cambioBotPausado: boolean | undefined

        if (body.content || body.messages?.[0] || body.attachments?.[0]) {
            const m = body.messages?.[0] || body
            const saliente = m.message_type === 1 || m.message_type === "outgoing"
            const creado = typeof m.created_at === "number" ? m.created_at * 1000 : Date.parse(m.created_at ?? "")
            const contenido = (m.content || "").toString()
            const txt = contenido.trim().toLowerCase()

            const rawAttachments: any[] = Array.isArray(m.attachments) ? m.attachments : (Array.isArray(body.attachments) ? body.attachments : [])
            const hostBase = (process.env.CHATWOOT_API_URL || "https://chat.revolucionmotos.tech/api/v1").replace(/\/api\/v1\/?$/, "")

            const adjuntos = rawAttachments.map((att: any) => {
                let url = (att?.data_url || att?.url || "").toString()
                if (url && url.startsWith("/")) {
                    url = `${hostBase}${url}`
                }
                let thumbUrl = (att?.thumb_url || "").toString()
                if (thumbUrl && thumbUrl.startsWith("/")) {
                    thumbUrl = `${hostBase}${thumbUrl}`
                }
                return {
                    id: att?.id || Math.random().toString(),
                    tipo: (att?.file_type || "file").toString(),
                    url,
                    thumbUrl: thumbUrl || null,
                    nombre: att?.file_name || null,
                    tamano: typeof att?.file_size === "number" ? att.file_size : null,
                    contentType: att?.content_type || null,
                    transcripcion: (att?.transcribed_text || "").toString() || null,
                }
            }).filter((att) => Boolean(att.url))

            const senderId = Number(m.sender?.id || m.sender_id || 0)
            const senderName = (m.sender?.name || "").toString().trim().toLowerCase()
            const esBot = senderId === chatwootConfig().botUserId || senderName === "bot"

            mensajeEmitido = {
                id: Number(m.id || Date.now()),
                contenido,
                privado: Boolean(m.private),
                saliente,
                remitente: m.sender?.name || (saliente ? (esBot ? "Bot" : "Nosotros") : "Cliente"),
                creadoEn: new Date(Number.isFinite(creado) ? creado : Date.now()).toISOString(),
                adjuntos: adjuntos.length > 0 ? adjuntos : undefined,
            }

            // Reconciliar bot_pausado contra el historial REAL de Chatwoot (no
            // adivinar solo con este mensaje suelto) cada vez que llega algo, así
            // el espejo no queda pegado en un estado viejo para conversaciones que
            // nadie tiene abiertas en /admin/chatwoot/chats-vivo en este momento.
            if (conversationId > 0) {
                const pausado = await calcularBotPausadoDesdeHistorial(1, conversationId)
                if (pausado !== null) {
                    cambioBotPausado = pausado
                    const { actualizarBotPausadoEnEspejo } = await import("@/lib/chatwoot-chats-vivo")
                    await actualizarBotPausadoEnEspejo(conversationId, pausado).catch(() => {})
                }
            }
        }

        if (conversationId > 0) {
            emitirEventoChatwoot({
                tipo: (eventoNombre as any) || "conversation_updated",
                conversationId,
                botPausado: cambioBotPausado,
                mensaje: mensajeEmitido,
                conversacion: conversacion
                    ? {
                          id: conversationId,
                          nombre: conversacion.meta?.sender?.name || conversacion.meta?.sender?.phone_number || `Conversación ${conversationId}`,
                          telefono: conversacion.meta?.sender?.phone_number || "",
                          status: conversacion.status || "open",
                          ultimoMensaje: conversacion.last_non_activity_message?.content || mensajeEmitido?.contenido || "",
                          ultimoMensajePropio: mensajeEmitido ? mensajeEmitido.saliente : false,
                          noLeidos: Number(conversacion.unread_count || 0),
                          ultimaActividad: new Date().toISOString(),
                          botPausado: cambioBotPausado,
                      }
                    : undefined,
            })
        }

        return NextResponse.json({ ok: true, event: eventoNombre })
    } catch (error) {
        console.error("Error procesando webhook de chatwoot:", error)
        return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
    }
}
