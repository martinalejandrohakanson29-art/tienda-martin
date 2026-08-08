import { listarPendientesEquipo } from "@/app/actions/pendientes-equipo"
import { PendientesClient } from "./pendientes-client"

export const dynamic = "force-dynamic"

export default async function PendientesPage() {
    let panel: Awaited<ReturnType<typeof listarPendientesEquipo>> | null = null
    let error: string | null = null
    try {
        panel = await listarPendientesEquipo()
    } catch (e) {
        error = e instanceof Error ? e.message : "No se pudieron leer las preguntas pendientes"
    }

    // Para el link "ver en Chatwoot": la misma instancia que usa el bot, sin el
    // /api/v1 del final.
    const chatwootUrl = (process.env.CHATWOOT_API_URL || "https://chat.revolucionmotos.tech/api/v1").replace(
        /\/api\/v1\/?$/,
        ""
    )

    return <PendientesClient inicial={panel} error={error} chatwootUrl={chatwootUrl} />
}
