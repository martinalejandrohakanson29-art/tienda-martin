import { obtenerMetricasChatwoot } from "@/app/actions/chatwoot-metricas"
import { MetricasChatwootClient } from "./metricas-client"

export const dynamic = "force-dynamic"

const PERIODO_INICIAL = 30

export default async function MetricasChatwootPage() {
    const resultado = await obtenerMetricasChatwoot(PERIODO_INICIAL)

    return (
        <MetricasChatwootClient
            periodoInicial={PERIODO_INICIAL}
            datosIniciales={resultado.success ? resultado.datos : null}
            errorInicial={resultado.success ? null : resultado.error}
        />
    )
}

