"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import {
    actualizarBotPausadoEnEspejo,
    listarChatsVivo,
    sincronizarEspejoChatwoot,
    type PanelChatsVivo,
} from "@/lib/chatwoot-chats-vivo"
import {
    enviarNotaPrivadaChatwoot,
    getMensajesConversacion,
    type MensajeConversacion,
} from "@/lib/chatwoot-bot"
import { emitirEventoChatwoot } from "@/lib/chatwoot-events"

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
    const mensajes = await getMensajesConversacion(ACCOUNT_ID, conversationId)

    // Sincronizar el estado del bot si existe algún comando /bot off o /bot on en el hilo
    let ultimoComandoBot: boolean | null = null
    for (let i = mensajes.length - 1; i >= 0; i--) {
        const txt = mensajes[i].contenido.trim().toLowerCase()
        if (txt === "/bot off") {
            ultimoComandoBot = true
            break
        }
        if (txt === "/bot on") {
            ultimoComandoBot = false
            break
        }
    }

    if (ultimoComandoBot !== null) {
        await actualizarBotPausadoEnEspejo(conversationId, ultimoComandoBot)
    }

    return mensajes
}

/** Prende o apaga el bot en una conversación específica enviando /bot on o /bot off como nota privada. */
export async function cambiarEstadoBotChatVivo(
    conversationId: number,
    encendido: boolean
): Promise<{ success: boolean; botPausado: boolean }> {
    await requireAdmin()

    const content = encendido ? "/bot on" : "/bot off"
    await enviarNotaPrivadaChatwoot({
        accountId: ACCOUNT_ID,
        conversationId,
        content,
    })

    const botPausado = !encendido
    await actualizarBotPausadoEnEspejo(conversationId, botPausado)

    emitirEventoChatwoot({
        tipo: "bot_pausado_updated",
        conversationId,
        botPausado,
        mensaje: {
            id: Date.now(),
            contenido: content,
            privado: true,
            saliente: true,
            remitente: "Nosotros",
            creadoEn: new Date().toISOString(),
        },
    })

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, botPausado }
}

