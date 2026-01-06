import { getProducts } from "@/app/actions/products"
import { MetadataRoute } from "next"
import { Product } from "@prisma/client" // 👈 1. Importamos el "molde" del Producto

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.revolucionmotos.com.ar"

  // 👇 2. TIPADO FUERTE: Le decimos "Esto es un array de Product"
  let products: Product[] = []

  try {
      products = await getProducts()
  } catch (error) {
      console.error("Error generando sitemap de productos:", error)
      // Si falla, 'products' se queda como array vacío [] y no rompe el sitio
  }

  const productUrls = products.map((product) => ({
    url: `${baseUrl}/products/${product.id}`,
    lastModified: product.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...productUrls,
  ]
}
