import { NextResponse } from "next/server";
import { addLabelEvent } from "@/lib/chatwoot-mock-store";

// Emula POST /api/v1/accounts/:accountId/conversations/:conversationId/labels
// de la API real de Chatwoot (nodo "Escalar - Agregar Label" del workflow).
export async function POST(
    request: Request,
    { params }: { params: { accountId: string; conversationId: string } }
) {
    const body = await request.json().catch(() => ({}));
    const labels: string[] = Array.isArray(body?.labels) ? body.labels : [];

    const event = addLabelEvent(params.accountId, params.conversationId, labels);

    return NextResponse.json({ payload: labels, id: event.id });
}
