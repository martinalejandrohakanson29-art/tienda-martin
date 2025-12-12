import { getProducts } from "@/app/actions/products"
import ShopClient from "./shop-client"

// Forzamos dinamismo para asegurar que el stock siempre esté actualizado
export const dynamic = "force-dynamic"

export default async function ShopPage() {
    // 1. Obtenemos los productos desde la base de datos
    const products = await getProducts()

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8">Tienda</h1>
            
            {/* 👇 CORRECCIÓN: Usamos 'initialProducts' en lugar de 'products' 
                 y quitamos 'categories' porque ShopClient ya no lo necesita */}
            <ShopClient initialProducts={products} />
        </div>
    )
}
