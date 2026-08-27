"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import {
    actualizarBotPausadoEnEspejo,
    listarChatsVivo,
    registrarMensajeSalienteEnEspejo,
    sincronizarEspejoChatwoot,
    type PanelChatsVivo,
} from "@/lib/chatwoot-chats-vivo"
import {
    enviarMensajeManualChatwoot,
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

/** Sincronización ligera en segundo plano (página 1 de Chatwoot) que actualiza PostgreSQL y retorna el panel */
export async function sincronizarChatsVivoLigero(periodoDias: number): Promise<PanelChatsVivo> {
    await requireAdmin()
    await sincronizarEspejoChatwoot(1).catch(() => {})
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

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, botPausado }
}

/** Envía un mensaje de texto manual al cliente por WhatsApp a través de Chatwoot. */
export async function enviarMensajeChatVivo(
    conversationId: number,
    contenido: string
): Promise<{ success: boolean; mensaje: MensajeConversacion }> {
    await requireAdmin()
    const texto = contenido.trim()
    if (!texto) throw new Error("El mensaje no puede estar vacío")

    const res = await enviarMensajeManualChatwoot({
        accountId: ACCOUNT_ID,
        conversationId,
        content: texto,
    })

    await registrarMensajeSalienteEnEspejo(conversationId, texto)

    const mensaje: MensajeConversacion = {
        id: Number(res?.id || Date.now()),
        contenido: texto,
        privado: false,
        saliente: true,
        remitente: "Nosotros",
        creadoEn: new Date().toISOString(),
    }

    revalidatePath("/admin/chatwoot/chats-vivo")
    return { success: true, mensaje }
}

