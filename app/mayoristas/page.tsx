import { getArticulosMayoristasPublicos } from "@/app/actions/articulos-mayoristas"
import { getConfig } from "@/app/actions/config"
import MayoristasClient from "./mayoristas-client"

export const dynamic = "force-dynamic"

export const metadata = {
    title: "Lista Mayorista - Potenciación y Repuestos",
    description: "Catálogo mayorista de kits de potenciación y repuestos para motos",
}

export default async function MayoristasPage() {
    const [articulos, config] = await Promise.all([
        getArticulosMayoristasPublicos(),
        getConfig(),
    ])

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-6">Lista Mayorista</h1>

            <MayoristasClient articulos={articulos} whatsappNumber={config?.whatsappNumber || null} />
        </div>
    )
}
