import { NextResponse } from "next/server";

// Simula el webhook que Chatwoot manda a n8n cuando UN AGENTE (nuestro equipo)
// escribe en la conversación —ya sea respondiendo la nota privada de escalado,
// o mandando "/bot on" para reactivar el bot—. Es el mismo webhook fake que usa
// prueba-mensaje/route.ts para el cliente, pero con sender_type "User" en vez
// de "Contact", para que el workflow lo tome como "respuesta de mi equipo"
// (nodo "¿Es respuesta de mi equipo?": message_type === "outgoing" && sender_type === "User").
const N8N_WEBHOOK_URL = "https://n8n.revolucionmotos.tech/webhook/chatwoot-mensaje";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { conversationId, respuesta } = body;

        if (!conversationId || !respuesta) {
            return NextResponse.json({ error: "Faltan datos (conversationId o respuesta)" }, { status: 400 });
        }

        const ahoraIso = new Date().toISOString();
        const ahoraUnix = Math.floor(Date.now() / 1000);

        const agente = {
            additional_attributes: {},
            custom_attributes: {},
            email: "equipo@revolucionmotos.tech",
            id: 99,
            name: "Equipo Revolución (prueba)",
            type: "user",
        };

        const payloadChatwoot = {
            account: { id: 1, name: "Revolucion" },
            additional_attributes: {},
            content_attributes: {},
            content_type: "text",
            content: respuesta,
            conversation: {
                additional_attributes: {},
                can_reply: true,
                channel: "Channel::Whatsapp",
                id: conversationId,
                inbox_id: 1,
                messages: [
                    {
                        id: Date.now(),
                        content: respuesta,
                        account_id: 1,
                        inbox_id: 1,
                        conversation_id: conversationId,
                        message_type: "outgoing",
                        created_at: ahoraUnix,
                        updated_at: ahoraIso,
                        private: false,
                        status: "sent",
                        content_type: "text",
                        content_attributes: {},
                        sender_type: "User",
                        sender_id: agente.id,
                        sender: agente,
                    },
                ],
                labels: [],
                status: "open",
                custom_attributes: {},
                unread_count: 0,
                last_activity_at: ahoraUnix,
                timestamp: ahoraUnix,
            },
            created_at: ahoraIso,
            id: Date.now(),
            inbox: { id: 1, name: "Prueba Manual" },
            message_type: "outgoing",
            private: false,
            sender: { ...agente, account: { id: 1, name: "Revolucion" } },
            event: "message_created",
        };

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadChatwoot),
        });

        if (!response.ok) {
            const texto = await response.text().catch(() => "");
            throw new Error(`n8n respondió ${response.status}: ${texto}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error al enviar respuesta de equipo de prueba a n8n:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, { status: 500 });
    }
}
