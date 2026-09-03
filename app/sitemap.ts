import { getProducts, getUniqueCategories } from "@/app/actions/products"
import { MetadataRoute } from "next"
import { Product } from "@prisma/client"
import { slugify } from "@/lib/seo-utils"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.revolucionmotos.com.ar"

  let products: Product[] = []
  let categories: string[] = []

  try {
    const [fetchedProducts, fetchedCategories] = await Promise.all([
      getProducts(),
      getUniqueCategories(),
    ])
    products = fetchedProducts
    categories = fetchedCategories
  } catch (error) {
    console.error("Error generando sitemap:", error)
  }

  // URLs de Categorías dedicadas (prioridad alta para Google)
  const categoryUrls = categories.map((cat) => ({
    url: `${baseUrl}/categoria/${slugify(cat)}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.9,
  }))

  // URLs de Productos con slug semántico
  const productUrls = products.map((product) => ({
    url: `${baseUrl}/products/${product.id}/${slugify(product.title)}`,
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
    {
      url: `${baseUrl}/mayoristas`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...categoryUrls,
    ...productUrls,
  ]
}

