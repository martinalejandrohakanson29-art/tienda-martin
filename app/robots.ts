import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.revolucionmotos.com.ar"

  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/shop",
        "/products/",
        "/mayoristas",
      ],
      disallow: [
        "/admin/",
        "/api/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}