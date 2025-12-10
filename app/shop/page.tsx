import { getProducts } from "@/app/actions/products"
import ShopClient from "./shop-client"

export default async function ShopPage() {
    const products = await getProducts()
    const categories = Array.from(new Set(products.map((p) => p.category)))

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8">Tienda</h1>
            <ShopClient products={products} categories={categories} />
        </div>
    )
}
