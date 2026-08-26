import { NextResponse } from "next/server"
import { guardarConversacionesEnEspejo } from "@/lib/chatwoot-chats-vivo"

export const dynamic = "force-dynamic"

/**
 * Webhook de Chatwoot para mantener la tabla espejo de conversaciones actualizada en tiempo real.
 *
 * Configurable en Chatwoot (Settings -> Integrations -> Webhooks) con la URL:
 * https://tudominio.com/api/chatwoot/webhook
 *
 * Totalmente independiente de n8n: no interfiere con los webhooks que ya procesa n8n.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) {
            return NextResponse.json({ ok: false, error: "Cuerpo vacío" }, { status: 400 })
        }

        const evento = body.event || ""
        let conversacion = body.conversation || (body.id && body.meta ? body : null)

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

        return NextResponse.json({ ok: true, event: evento })
    } catch (error) {
        console.error("Error procesando webhook de chatwoot:", error)
        return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
    }
}
