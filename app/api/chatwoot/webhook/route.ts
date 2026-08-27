import { NextResponse } from "next/server"
import { guardarConversacionesEnEspejo } from "@/lib/chatwoot-chats-vivo"
import { emitirEventoChatwoot, type EventoChatwootEnVivo } from "@/lib/chatwoot-events"

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

        // Si el evento es message_created / message_updated, la conversación suele venir en body.conversation
        if (!conversacion && body.conversation_id) {
            conversacion = {
                id: body.conversation_id,
                inbox_id: body.inbox_id,
                status: body.status || "open",
                meta: body.meta || { sender: body.sender },
                unread_count: body.unread_count || 0,
                last_non_activity_message: body.content ? { content: body.content, message_type: body.message_type } : undefined,
                last_activity_at: Math.floor(Date.now() / 1000),
            }
        }

        if (conversacion && conversacion.id) {
            await guardarConversacionesEnEspejo([conversacion])
        }

        // Si vino un mensaje en el webhook, armar el objeto para emitir en vivo al cliente
        let mensajeEmitido: EventoChatwootEnVivo["mensaje"] | undefined
        let cambioBotPausado: boolean | undefined

        if (body.content || body.messages?.[0]) {
            const m = body.messages?.[0] || body
            const saliente = m.message_type === 1 || m.message_type === "outgoing"
            const creado = typeof m.created_at === "number" ? m.created_at * 1000 : Date.parse(m.created_at ?? "")
            const contenido = (m.content || "").toString()
            const txt = contenido.trim().toLowerCase()

            const senderId = Number(m.sender?.id || m.sender_id || 0)
            const senderName = (m.sender?.name || "").toString().trim().toLowerCase()
            const esBot = senderId === 2 || senderName === "bot"

            mensajeEmitido = {
                id: Number(m.id || Date.now()),
                contenido,
                privado: Boolean(m.private),
                saliente,
                remitente: m.sender?.name || (saliente ? (esBot ? "Bot" : "Nosotros") : "Cliente"),
                creadoEn: new Date(Number.isFinite(creado) ? creado : Date.now()).toISOString(),
            }

            if (txt === "/bot off") {
                cambioBotPausado = true
            } else if (txt === "/bot on") {
                cambioBotPausado = false
            } else if (saliente && !m.private && m.sender?.type === "user" && !esBot) {
                // Humano (agente real, no el bot) respondiendo en público -> el workflow de n8n pausa el bot
                cambioBotPausado = true
            }

            if (conversationId > 0 && cambioBotPausado !== undefined) {
                const { actualizarBotPausadoEnEspejo } = await import("@/lib/chatwoot-chats-vivo")
                await actualizarBotPausadoEnEspejo(conversationId, cambioBotPausado).catch(() => {})
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
