import { EventEmitter } from "events"

export type EventoChatwootEnVivo = {
    tipo: "message_created" | "message_updated" | "conversation_created" | "conversation_updated" | "conversation_status_changed" | "conversation_read" | "sync"
    conversationId: number
    account_id?: number
    mensaje?: {
        id: number
        contenido: string
        privado: boolean
        saliente: boolean
        remitente: string
        creadoEn: string
    }
    conversacion?: {
        id: number
        nombre: string
        telefono: string
        status: string
        ultimoMensaje: string
        ultimoMensajePropio: boolean
        noLeidos: number
        ultimaActividad: string
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
