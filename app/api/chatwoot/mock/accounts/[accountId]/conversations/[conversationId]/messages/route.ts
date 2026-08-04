import { NextResponse } from "next/server";
import { addMessageEvent } from "@/lib/chatwoot-mock-store";

// Emula POST /api/v1/accounts/:accountId/conversations/:conversationId/messages
// de la API real de Chatwoot. El workflow de n8n pega acá (respuesta al cliente,
// nota privada de escalado, mensajes de aprendizaje) mientras probamos desde
// /admin/chatwoot/prueba sin depender de una instancia real de Chatwoot.
export async function POST(
    request: Request,
    { params }: { params: { accountId: string; conversationId: string } }
) {
    const body = await request.json().catch(() => ({}));
    const content = typeof body?.content === "string" ? body.content : "";
    const isPrivate = body?.private === true;

    const event = addMessageEvent(params.accountId, params.conversationId, content, isPrivate);

    // Respuesta con la forma general de un mensaje de Chatwoot, lo suficiente
    // para que el workflow no rompa si llegara a leer algo de la respuesta.
    return NextResponse.json({
        id: event.id,
        content,
        private: isPrivate,
        message_type: "outgoing",
        conversation_id: Number(params.conversationId) || params.conversationId,
    });
}
