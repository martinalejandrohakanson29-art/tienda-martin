import { EventEmitter } from "events"
import type { MensajeConversacion } from "@/lib/chatwoot-bot"

export type EventoChatwootEnVivo = {
    tipo:
        | "message_created"
        | "message_updated"
        | "conversation_created"
        | "conversation_updated"
        | "conversation_status_changed"
        | "conversation_read"
        | "bot_pausado_updated"
        | "sync"
    conversationId: number
    account_id?: number
    botPausado?: boolean
    mensaje?: MensajeConversacion
    conversacion?: {
        id: number
        nombre: string
        telefono: string
        status: string
        ultimoMensaje: string
        ultimoMensajePropio: boolean
        noLeidos: number
        ultimaActividad: string
        botPausado?: boolean
    }
}

declare global {
    // eslint-disable-next-line no-var
    var chatwootEventBus: EventEmitter | undefined
}

export const chatwootEventBus = global.chatwootEventBus || new EventEmitter()
chatwootEventBus.setMaxListeners(200)

if (process.env.NODE_ENV !== "production") {
    global.chatwootEventBus = chatwootEventBus
}

export function emitirEventoChatwoot(evento: EventoChatwootEnVivo) {
    try {
        chatwootEventBus.emit("chatwoot_event", evento)
    } catch (e) {
        console.error("Error emitiendo evento de chatwoot:", e)
    }
}
