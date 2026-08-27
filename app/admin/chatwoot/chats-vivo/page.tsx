import { obtenerChatsVivo } from "@/app/actions/chats-vivo"
import { ChatsVivoClient } from "./chats-vivo-client"
import { sincronizarEspejoChatwoot, type PanelChatsVivo } from "@/lib/chatwoot-chats-vivo"

export const dynamic = "force-dynamic"

const PERIODO_INICIAL_DIAS = 3

export default async function ChatsVivoPage() {
    let panel: PanelChatsVivo | null = null
    let error: string | null = null
    try {
        // Sincronizar en segundo plano la página 1 de Chatwoot para traer mensajes recientes al abrir o recargar
        await sincronizarEspejoChatwoot(1).catch(() => {})
        panel = await obtenerChatsVivo(PERIODO_INICIAL_DIAS)
    } catch (e) {
        error = e instanceof Error ? e.message : "No se pudieron leer las conversaciones de Chatwoot"
    }

    // Para el link "Ver en Chatwoot": la misma instancia que usa el bot, sin el /api/v1 del final.
    const chatwootUrl = (process.env.CHATWOOT_API_URL || "https://chat.revolucionmotos.tech/api/v1").replace(
        /\/api\/v1\/?$/,
        ""
    )

    return <ChatsVivoClient inicial={panel} error={error} periodoInicialDias={PERIODO_INICIAL_DIAS} chatwootUrl={chatwootUrl} />
}
