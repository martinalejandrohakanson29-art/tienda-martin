"use server"

import { requireAdmin } from "@/lib/auth-guard"
import {
    listarChatsVivo,
    sincronizarEspejoChatwoot,
    type PanelChatsVivo,
} from "@/lib/chatwoot-chats-vivo"
import { getMensajesConversacion, type MensajeConversacion } from "@/lib/chatwoot-bot"

export type { PanelChatsVivo, MensajeConversacion }

const ACCOUNT_ID = 1

export async function obtenerChatsVivo(periodoDias: number): Promise<PanelChatsVivo> {
    await requireAdmin()
    return listarChatsVivo(periodoDias)
}

/** Fuerza una sincronización rápida desde Chatwoot y retorna el listado actualizado. */
export async function forzarSincronizacionChatsVivo(periodoDias: number): Promise<PanelChatsVivo> {
    await requireAdmin()
    await sincronizarEspejoChatwoot(2)
    return listarChatsVivo(periodoDias)
}

/** Hilo real de una conversación (de solo lectura), para el panel de detalle. */
export async function obtenerHiloChatVivo(conversationId: number): Promise<MensajeConversacion[]> {
    await requireAdmin()
    return getMensajesConversacion(ACCOUNT_ID, conversationId)
}
