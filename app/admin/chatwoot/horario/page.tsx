import { obtenerHorarioBot, type HorarioBot } from "@/app/actions/bot-onoff"
import { HorarioClient } from "./horario-client"

export const dynamic = "force-dynamic"

export default async function HorarioPage() {
    let horario: HorarioBot | null = null
    let error: string | null = null

    try {
        horario = await obtenerHorarioBot()
    } catch (e) {
        error = e instanceof Error ? e.message : "No se pudo leer el horario del bot"
    }

    return <HorarioClient inicial={horario} error={error} />
}
