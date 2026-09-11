import { CatalogoClient } from "./catalogo-client"
import {
    getChatArticulos,
    getChatPacks,
    getChatArticuloCompatibilidades,
    getChatPackGrupos,
    getChatComboCompatibilidades,
} from "@/app/actions/chat-catalogo"
import { getKits } from "@/app/actions/kits-publicidad"
import { getCompatibilidades } from "@/app/actions/compatibilidades"
import { getChatConfig } from "@/app/actions/chat-config"
import { getInfoNegocio } from "@/app/actions/info-negocio"
import { MENSAJE_INCOMPATIBILIDAD_DEFAULT, COSTO_ENVIO_SUELTAS_DEFAULT } from "@/lib/chat-config-constants"

export const dynamic = "force-dynamic"

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; error: string | null }> {
    try {
        return { data: await fn(), error: null }
    } catch (e) {
        return { data: fallback, error: e instanceof Error ? e.message : "Error desconocido" }
    }
}

export default async function CatalogoPage() {
    const [articulos, packs, compatibilidadesArticulos, kits, compatibilidadesKits, grupos, compatibilidadesCombo, config, infoNegocio] = await Promise.all([
        safe(getChatArticulos, []),
        safe(getChatPacks, []),
        safe(getChatArticuloCompatibilidades, []),
        safe(getKits, []),
        safe(getCompatibilidades, []),
        safe(getChatPackGrupos, []),
        safe(getChatComboCompatibilidades, []),
        safe(getChatConfig, {
            mensajeIncompatibilidad: MENSAJE_INCOMPATIBILIDAD_DEFAULT,
            costoEnvioSueltas: COSTO_ENVIO_SUELTAS_DEFAULT,
        }),
        safe(getInfoNegocio, []),
    ])

    return (
        <CatalogoClient
            articulosIniciales={articulos.data}
            articulosError={articulos.error}
            packsIniciales={packs.data}
            packsError={packs.error}
            compatibilidadesArticulosIniciales={compatibilidadesArticulos.data}
            kitsParaCopiar={kits.data}
            compatibilidadesKits={compatibilidadesKits.data}
            gruposIniciales={grupos.data}
            gruposError={grupos.error}
            compatibilidadesComboIniciales={compatibilidadesCombo.data}
            configInicial={config.data}
            configError={config.error}
            infoNegocioInicial={infoNegocio.data}
            infoNegocioError={infoNegocio.error}
        />
    )
}
