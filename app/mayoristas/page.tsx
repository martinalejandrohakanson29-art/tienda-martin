import type { Metadata } from "next"
import { getArticulosMayoristasPublicos } from "@/app/actions/articulos-mayoristas"
import MayoristasClient from "./mayoristas-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Venta Mayorista de Repuestos y Potenciación para Motos",
    description: "Catálogo y lista de precios mayorista en repuestos, kits de potenciación y accesorios para motos. Atención a talleres, revendedores y comercios con envíos a todo el país.",
    openGraph: {
        title: "Venta Mayorista de Repuestos para Motos | Revolución Motos",
        description: "Precios directos de distribuidor en repuestos y kits de competición para motos con envíos a toda Argentina.",
        url: "https://www.revolucionmotos.com.ar/mayoristas",
    },
}

export default async function MayoristasPage() {
    const articulos = await getArticulosMayoristasPublicos()

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                    Lista Mayorista de Repuestos y Potenciación
                </h1>
                <p className="text-gray-400 text-sm mt-1">
                    Precios directos para talleres mecánicos, revendedores y casas de repuestos con envíos a todo el país.
                </p>
            </div>

            <MayoristasClient articulos={articulos} />
        </div>
    )
}
