import { getProducts } from "@/app/actions/products"
import ProductsClient from "./products-client"

export const dynamic = "force-dynamic"

export default async function AdminProductsPage() {
    // Obtenemos los productos de la BD
    const productsData = await getProducts()
    
    // Truco importante: Convertimos los datos a JSON simple para evitar errores con los números decimales de la BD
    const products = JSON.parse(JSON.stringify(productsData))

    return <ProductsClient initialProducts={products} />
}
