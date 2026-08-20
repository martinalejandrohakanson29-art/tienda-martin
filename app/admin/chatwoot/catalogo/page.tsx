import { CatalogoClient } from "./catalogo-client"
import { getChatArticulos, getChatPacks } from "@/app/actions/chat-catalogo"

export const dynamic = "force-dynamic"

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; error: string | null }> {
    try {
        return { data: await fn(), error: null }
    } catch (e) {
        return { data: fallback, error: e instanceof Error ? e.message : "Error desconocido" }
    }
}

export default async function CatalogoPage() {
    const [articulos, packs] = await Promise.all([
        safe(getChatArticulos, []),
        safe(getChatPacks, []),
    ])

    return (
        <CatalogoClient
            articulosIniciales={articulos.data}
            articulosError={articulos.error}
            packsIniciales={packs.data}
            packsError={packs.error}
        />
    )
}
