import { requireAdmin } from "@/lib/auth-guard"
import { getConfiguracionAgenteAction } from "@/app/actions/agente-bot"
import { SimuladorClient } from "./simulador-client"

export const dynamic = "force-dynamic"

export default async function SimuladorPage() {
    await requireAdmin()
    const configInicial = await getConfiguracionAgenteAction()

    return (
        <div className="container mx-auto py-6 max-w-5xl">
            <SimuladorClient configInicial={configInicial} />
        </div>
    )
}
