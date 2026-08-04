import { ConocimientoClient } from "./conocimiento-client"
import { getKits } from "@/app/actions/kits-publicidad"
import { getInfoNegocio } from "@/app/actions/info-negocio"
import { getPreciosStock } from "@/app/actions/precios-stock"
import { getCompatibilidades } from "@/app/actions/compatibilidades"

export const dynamic = "force-dynamic"

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; error: string | null }> {
    try {
        return { data: await fn(), error: null }
    } catch (e) {
        return { data: fallback, error: e instanceof Error ? e.message : "Error desconocido" }
    }
}

export default async function ConocimientoPage() {
    const [kits, infoNegocio, precios, compatibilidades] = await Promise.all([
        safe(getKits, []),
        safe(getInfoNegocio, []),
        safe(getPreciosStock, []),
        safe(getCompatibilidades, []),
    ])

    return (
        <ConocimientoClient
            kitsIniciales={kits.data}
            kitsError={kits.error}
            infoNegocioIniciales={infoNegocio.data}
            infoNegocioError={infoNegocio.error}
            preciosIniciales={precios.data}
            preciosError={precios.error}
            compatibilidadesIniciales={compatibilidades.data}
            compatibilidadesError={compatibilidades.error}
        />
    )
}
