import { listarBorradores } from "@/app/actions/carga-kit-chat"
import { CargarKitClient } from "./cargar-kit-client"

export const dynamic = "force-dynamic"

export default async function CargarKitPage() {
    let borradores: Awaited<ReturnType<typeof listarBorradores>> = []
    let error: string | null = null
    try {
        borradores = await listarBorradores()
    } catch (e) {
        error = e instanceof Error ? e.message : "No se pudieron leer los borradores"
    }

    return <CargarKitClient borradoresIniciales={borradores} error={error} />
}
