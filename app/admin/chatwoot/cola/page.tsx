import { obtenerPanelBot, type PanelBot } from "@/app/actions/bot-onoff"
import { ColaClient } from "./cola-client"

export const dynamic = "force-dynamic"

export default async function ColaPage() {
    let panel: PanelBot | null = null
    let error: string | null = null

    try {
        panel = await obtenerPanelBot()
    } catch (e) {
        error = e instanceof Error ? e.message : "No se pudo leer la cola de respuestas"
    }

    // Para el link "ver en Chatwoot": la misma instancia que usa el bot, sin el
    // /api/v1 del final.
    const chatwootUrl = (process.env.CHATWOOT_API_URL || "https://chat.revolucionmotos.tech/api/v1").replace(
        /\/api\/v1\/?$/,
        ""
    )

    return <ColaClient inicial={panel} error={error} chatwootUrl={chatwootUrl} />
}
