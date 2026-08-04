// Store en memoria que emula el lado servidor de Chatwoot para las pruebas del
// workflow de n8n en /admin/chatwoot/prueba. Los nodos HTTP del workflow
// (respuesta al cliente, nota privada de escalado, labels) postean acá en vez
// de a una instancia real de Chatwoot; el front hace polling de "eventos"
// para mostrar la respuesta del bot como si fuera un chat real.
//
// Vive en memoria del proceso (Node persistente vía `next start`, no serverless),
// se pierde al reiniciar el server. Es intencional: es solo para pruebas.

export type ChatwootMockEvent =
    | { id: number; kind: "message"; private: boolean; content: string; createdAt: number }
    | { id: number; kind: "label"; labels: string[]; createdAt: number }

type ConversationKey = string

type StoreShape = {
    nextId: number
    conversations: Map<ConversationKey, ChatwootMockEvent[]>
}

const globalForStore = globalThis as unknown as { __chatwootMockStore?: StoreShape }

function getStore(): StoreShape {
    if (!globalForStore.__chatwootMockStore) {
        globalForStore.__chatwootMockStore = { nextId: 1, conversations: new Map() }
    }
    return globalForStore.__chatwootMockStore
}

function key(accountId: string, conversationId: string): ConversationKey {
    return `${accountId}:${conversationId}`
}

export function addMessageEvent(accountId: string, conversationId: string, content: string, isPrivate: boolean) {
    const store = getStore()
    const k = key(accountId, conversationId)
    const list = store.conversations.get(k) ?? []
    const event: ChatwootMockEvent = { id: store.nextId++, kind: "message", private: isPrivate, content, createdAt: Date.now() }
    list.push(event)
    store.conversations.set(k, list)
    return event
}

export function addLabelEvent(accountId: string, conversationId: string, labels: string[]) {
    const store = getStore()
    const k = key(accountId, conversationId)
    const list = store.conversations.get(k) ?? []
    const event: ChatwootMockEvent = { id: store.nextId++, kind: "label", labels, createdAt: Date.now() }
    list.push(event)
    store.conversations.set(k, list)
    return event
}

export function getEventsAfter(accountId: string, conversationId: string, afterId: number) {
    const store = getStore()
    const list = store.conversations.get(key(accountId, conversationId)) ?? []
    return list.filter((e) => e.id > afterId)
}

export function resetConversation(accountId: string, conversationId: string) {
    const store = getStore()
    store.conversations.delete(key(accountId, conversationId))
}
