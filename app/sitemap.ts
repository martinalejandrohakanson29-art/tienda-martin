import { getProducts } from "@/app/actions/products"
import { MetadataRoute } from "next"

// 👇 ESTA LÍNEA ES LA CLAVE.
// Le dice a Next.js: "No intentes construir esto antes. Hazlo cuando te lo pidan".
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.revolucionmotos.com.ar"

  // Intentamos obtener productos. Si falla la DB, no rompemos todo, devolvemos un mapa básico.
  let products = []
  try {
      products = await getProducts()
  } catch (error) {
      console.error("Error generando sitemap de productos:", error)
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
