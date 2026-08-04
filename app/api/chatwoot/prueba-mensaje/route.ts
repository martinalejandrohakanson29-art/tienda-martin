import { NextResponse } from "next/server";

// Simula el webhook que Chatwoot manda a n8n cuando llega un mensaje de WhatsApp,
// para poder probar el workflow de IA sin depender de un mensaje real.
const N8N_WEBHOOK_URL = "https://n8n.revolucionmotos.tech/webhook/chatwoot-mensaje";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { conversationId, telefono, nombre, mensaje, audioUrl } = body;

        if (!conversationId || !telefono || (!mensaje && !audioUrl)) {
            return NextResponse.json({ error: "Faltan datos (conversationId, telefono, y mensaje o audioUrl)" }, { status: 400 });
        }

        const ahoraIso = new Date().toISOString();
        const ahoraUnix = Math.floor(Date.now() / 1000);
        const telefonoConMas = telefono.startsWith("+") ? telefono : `+${telefono}`;
        // Si viene audioUrl simulamos un mensaje de voz (sin texto, con adjunto de
        // audio) — así el workflow lo manda por la rama "Audio" del switch "Tipo de
        // Mensaje" en vez de la rama "Texto".
        const esAudio = Boolean(audioUrl);
        const contenido = esAudio ? "" : mensaje;

        const payloadChatwoot = {
            account: { id: 1, name: "Revolucion" },
            additional_attributes: {},
            content_attributes: {},
            content_type: esAudio ? "audio" : "text",
            content: contenido,
            conversation: {
                additional_attributes: {},
                can_reply: true,
                channel: "Channel::Whatsapp",
                contact_inbox: {
                    id: 1,
                    contact_id: 1,
                    inbox_id: 1,
                    source_id: telefono.replace("+", ""),
                    created_at: ahoraIso,
                    updated_at: ahoraIso,
                    hmac_verified: false,
                },
                id: conversationId,
                inbox_id: 1,
                messages: [
                    {
                        id: Date.now(),
                        content: contenido,
                        account_id: 1,
                        inbox_id: 1,
                        conversation_id: conversationId,
                        message_type: 0,
                        created_at: ahoraUnix,
                        updated_at: ahoraIso,
                        private: false,
                        status: "sent",
                        content_type: esAudio ? "audio" : "text",
                        content_attributes: {},
                        ...(esAudio ? { attachments: [{ id: 1, file_type: "audio", data_url: audioUrl }] } : {}),
                        sender_type: "Contact",
                        sender_id: 1,
                        sender: {
                            additional_attributes: {},
                            custom_attributes: {},
                            email: null,
                            id: 1,
                            identifier: null,
                            name: nombre || "Cliente Prueba",
                            phone_number: telefonoConMas,
                            thumbnail: "",
                            blocked: false,
                            type: "contact",
                        },
                    },
                ],
                labels: [],
                status: "open",
                custom_attributes: {},
                unread_count: 1,
                last_activity_at: ahoraUnix,
                timestamp: ahoraUnix,
            },
            created_at: ahoraIso,
            id: Date.now(),
            inbox: { id: 1, name: "Prueba Manual" },
            message_type: "incoming",
            private: false,
            sender: {
                account: { id: 1, name: "Revolucion" },
                additional_attributes: {},
                avatar: "",
                custom_attributes: {},
                email: null,
                id: 1,
                identifier: null,
                name: nombre || "Cliente Prueba",
                phone_number: telefonoConMas,
                thumbnail: "",
                blocked: false,
            },
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
        console.error("Error al enviar mensaje de prueba a n8n:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, { status: 500 });
    }
}
