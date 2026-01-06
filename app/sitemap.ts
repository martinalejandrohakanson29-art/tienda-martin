import { getProducts } from "@/app/actions/products"
import { MetadataRoute } from "next"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Tu dominio real (lo saqué de tu archivo de checkout)
  const baseUrl = "https://www.revolucionmotos.com.ar"

  // 1. Buscamos todos los productos de la base de datos
  const products = await getProducts()

  // 2. Generamos la URL para cada producto
  const productUrls = products.map((product) => ({
    url: `${baseUrl}/products/${product.id}`,
    lastModified: product.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  // 3. Devolvemos el mapa completo (Páginas estáticas + Productos)
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
