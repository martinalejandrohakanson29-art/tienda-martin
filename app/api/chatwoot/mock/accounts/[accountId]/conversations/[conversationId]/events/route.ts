import { NextResponse } from "next/server";
import { getEventsAfter, resetConversation } from "@/lib/chatwoot-mock-store";

export const dynamic = "force-dynamic";

// Endpoint propio (no forma parte de la API de Chatwoot) que usa el front de
// /admin/chatwoot/prueba para hacer polling de lo que el workflow fue posteando
// (respuesta al cliente, nota privada, labels) para esa conversación.
export async function GET(
    request: Request,
    { params }: { params: { accountId: string; conversationId: string } }
) {
    const { searchParams } = new URL(request.url);
    const after = Number(searchParams.get("after") ?? 0) || 0;

    const events = getEventsAfter(params.accountId, params.conversationId, after);
    return NextResponse.json({ events });
}

// Limpia el estado guardado de una conversación de prueba (se usa al arrancar
// una conversación nueva desde la UI).
export async function DELETE(
    _request: Request,
    { params }: { params: { accountId: string; conversationId: string } }
) {
    resetConversation(params.accountId, params.conversationId);
    return NextResponse.json({ success: true });
}
