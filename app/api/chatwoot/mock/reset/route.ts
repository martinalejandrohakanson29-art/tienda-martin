import { NextResponse } from "next/server";
import { resetAllConversations } from "@/lib/chatwoot-mock-store";

// Borra el historial guardado de TODAS las conversaciones de prueba (botón
// "Borrar todo el historial" en /admin/chatwoot/prueba). A diferencia del
// DELETE de .../conversations/:id/events, que limpia una sola conversación,
// este vacía el store completo.
export async function DELETE() {
    resetAllConversations();
    return NextResponse.json({ success: true });
}
