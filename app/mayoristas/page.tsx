import { getArticulosMayoristasPublicos } from "@/app/actions/articulos-mayoristas"
import MayoristasClient from "./mayoristas-client"
import Link from "next/link"
import { Home } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
    title: "Lista Mayorista - Potenciación y Repuestos",
    description: "Catálogo mayorista de kits de potenciación y repuestos para motos",
}

export default async function MayoristasPage() {
    const articulos = await getArticulosMayoristasPublicos()

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 border-b border-white/10 pb-4">
                <Link href="/" className="hover:text-gray-200 transition-colors flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    <span>Inicio</span>
                </Link>
                <span>/</span>
                <span className="text-gray-200 font-medium">Mayoristas</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-2">Lista Mayorista</h1>
            <p className="text-sm sm:text-base text-gray-400 mb-6 sm:mb-8">Potenciación y repuestos. Precios exclusivos para clientes mayoristas.</p>

            <MayoristasClient articulos={articulos} />
        </div>
    )
}
