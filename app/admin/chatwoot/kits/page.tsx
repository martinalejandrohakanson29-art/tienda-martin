import { KitsClient } from "./kits-client"
import { getKits } from "@/app/actions/kits-publicidad"

export const dynamic = "force-dynamic"

export default async function KitsPage() {
    let kits: Awaited<ReturnType<typeof getKits>> = []
    let error: string | null = null

    try {
        kits = await getKits()
    } catch (e) {
        error = e instanceof Error ? e.message : "Error desconocido al leer los kits"
    }

    return <KitsClient kitsIniciales={kits} errorInicial={error} />
}
