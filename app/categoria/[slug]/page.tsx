import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Metadata } from "next"
import { Home, ChevronRight, MessageSquare, ArrowLeft } from "lucide-react"
import ProductCard from "@/components/ui/product-card"
import { Button } from "@/components/ui/button"
import { getConfig } from "@/app/actions/config"
import { getUniqueCategories } from "@/app/actions/products"
import { slugify, getCategorySeoData, matchCategoryFromSlug } from "@/lib/seo-utils"

export const dynamic = "force-dynamic"

interface CategoryPageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const categories = await getUniqueCategories()
  const matchedCategory = matchCategoryFromSlug(params.slug, categories)

  if (!matchedCategory) {
    return {
      title: "Categoría no encontrada | Revolución Motos",
      description: "Explorá nuestro catálogo de repuestos para motos en Revolución Motos.",
    }
  }

  const seoData = getCategorySeoData(matchedCategory)
  const canonicalUrl = `https://www.revolucionmotos.com.ar/categoria/${params.slug}`

  return {
    title: seoData.title,
    description: seoData.description,
    keywords: seoData.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: seoData.title,
      description: seoData.description,
      url: canonicalUrl,
      type: "website",
      siteName: "Revolución Motos",
      images: [
        {
          url: "/icon.png",
          width: 1024,
          height: 1024,
          alt: `${matchedCategory} - Revolución Motos`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seoData.title,
      description: seoData.description,
      images: ["/icon.png"],
    },
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const [allCategories, config] = await Promise.all([
    getUniqueCategories(),
    getConfig(),
  ])

  const matchedCategory = matchCategoryFromSlug(params.slug, allCategories)

  if (!matchedCategory) {
    notFound()
  }

  const rawProducts = await prisma.product.findMany({
    where: {
      category: {
        equals: matchedCategory,
        mode: "insensitive",
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Ordenamiento por prioridad (order = 0 va al final)
  const sortedProducts = rawProducts.sort((a, b) => {
    const orderA = a.order === 0 ? 999999 : a.order
    const orderB = b.order === 0 ? 999999 : b.order
    if (orderA !== orderB) return orderA - orderB
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const products = JSON.parse(JSON.stringify(sortedProducts))
  const seoData = getCategorySeoData(matchedCategory)

  // JSON-LD BreadcrumbList para Google Search Console
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Inicio",
        "item": "https://www.revolucionmotos.com.ar",
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Tienda",
        "item": "https://www.revolucionmotos.com.ar/shop",
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": matchedCategory,
        "item": `https://www.revolucionmotos.com.ar/categoria/${params.slug}`,
      },
    ],
  }

  return (
    <div className="bg-[#0D0D0D] min-h-screen text-white pb-20">
      {/* Marcado estructurado para Google */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Migas de pan (Breadcrumbs) */}
      <div className="border-b border-white/5 bg-[#090909]">
        <div className="container mx-auto px-4 py-3">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Link href="/" className="hover:text-white transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              <span>Inicio</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />
            <Link href="/shop" className="hover:text-white transition-colors">
              Tienda
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />
            <span className="text-red-500 font-bold uppercase">{matchedCategory}</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Encabezado H1 y descripción SEO de categoría */}
        <div className="border-b border-white/10 pb-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-1.5 h-12 bg-red-600 rounded-full flex-shrink-0 mt-1" />
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono font-black uppercase text-red-500 tracking-widest bg-red-950/50 px-2 py-0.5 rounded border border-red-900/40">
                  Categoría
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  {products.length} productos disponibles
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
                {matchedCategory}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 max-w-3xl leading-relaxed">
                {seoData.description}
              </p>
            </div>
          </div>

          {/* OTRAS CATEGORÍAS RELACIONADAS */}
          <div className="mt-6 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-mono font-bold uppercase text-zinc-600 mr-1">
              Ver también:
            </span>
            {allCategories
              .filter((cat) => cat.toLowerCase() !== matchedCategory.toLowerCase())
              .map((cat) => (
                <Link
                  key={cat}
                  href={`/categoria/${slugify(cat)}`}
                  className="px-3 py-1 rounded bg-[#161616] hover:bg-red-600/20 hover:text-red-400 border border-white/10 hover:border-red-600/50 text-zinc-400 text-xs font-mono font-semibold uppercase transition-all"
                >
                  {cat}
                </Link>
              ))}
          </div>
        </div>

        {/* LISTADO DE PRODUCTOS */}
        {products.length === 0 ? (
          <div className="text-center py-16 bg-[#111] rounded-lg border border-white/5">
            <p className="text-zinc-500 text-sm mb-4">
              Actualmente no hay stock disponible en esta categoría.
            </p>
            <Link href="/shop">
              <Button variant="outline" className="text-xs border-zinc-700 text-zinc-300">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Ver Todo el Catálogo
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {products.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {/* ASISTENCIA TÉCNICA DE CATEGORÍA */}
        {config?.whatsappNumber && (
          <div className="mt-16 p-6 rounded-lg bg-[#111] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                ¿Buscás una medida o modelo específico de {matchedCategory.toLowerCase()}?
              </h3>
              <p className="text-xs text-zinc-400">
                Consultanos directamente por WhatsApp con el modelo y año de tu moto.
              </p>
            </div>
            <a
              href={`https://wa.me/${config.whatsappNumber}?text=Hola!%20Estoy%20buscando%20repuestos%20en%20la%20categoria%20${encodeURIComponent(matchedCategory)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider transition-colors shrink-0 shadow-lg shadow-red-950/40"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Consultar Stock por WhatsApp</span>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
