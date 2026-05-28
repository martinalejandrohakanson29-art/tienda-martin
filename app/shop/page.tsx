import { getProducts } from "@/app/actions/products"
import ShopClient from "./shop-client"
import Link from "next/link"
import { Home } from "lucide-react"

// Forzamos dinamismo para asegurar que el stock siempre esté actualizado
export const dynamic = "force-dynamic"

export default async function ShopPage() {
    // 1. Obtenemos los productos desde la base de datos
    const products = await getProducts()

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Navegación y Botón Atrás */}
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 border-b border-white/10 pb-4">
                <Link href="/" className="hover:text-gray-200 transition-colors flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    <span>Inicio</span>
                </Link>
                <span>/</span>
                <span className="text-gray-200 font-medium">Tienda</span>
            </div>

            <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-8">Tienda</h1>
            
            {/* 👇 CORRECCIÓN: Usamos 'initialProducts' en lugar de 'products' 
                 y quitamos 'categories' porque ShopClient ya no lo necesita */}
            <ShopClient initialProducts={products} />
        </div>
    )
}
