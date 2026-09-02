import { getCarouselItems } from "@/app/actions/carousel"
import { getFeaturedProducts, getProducts, getHomeShowcaseProducts, getComboProducts } from "@/app/actions/products"
import { getConfig } from "@/app/actions/config"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import HomeSearch from "@/components/home-search"
import HomeCarousel from "@/components/home-carousel"
import ProductCard from "@/components/ui/product-card"
import { Zap } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function Home() {
  const carouselItems = await getCarouselItems()
  const featuredProducts = await getFeaturedProducts()
  const showcaseProducts = await getHomeShowcaseProducts()
  const comboProducts = await getComboProducts()
  const allProducts = await getProducts()
  const config = await getConfig()

  const carouselItemsJson = JSON.parse(JSON.stringify(carouselItems))
  const configJson = JSON.parse(JSON.stringify(config))

  const hasCarousel = carouselItems.length > 0

  const categories = Array.from(
    new Set((allProducts as any[]).map((p) => p.category).filter(Boolean))
  ) as string[]

  return (
    <div className="bg-[#0D0D0D] min-h-screen pb-16">

      {/* CARRUSEL */}
      {hasCarousel && (
        <HomeCarousel items={carouselItemsJson} config={configJson} />
      )}

      {/* FRANJA DE CATEGORÍAS */}
      {categories.length > 0 && (
        <div className="border-b border-white/5 bg-[#0A0A0A]">
          <div className="container mx-auto px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <Link
                href="/shop"
                className="flex-shrink-0 px-4 py-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide transition-colors"
              >
                Todo
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/shop?category=${encodeURIComponent(cat)}`}
                  className="flex-shrink-0 px-4 py-1.5 rounded-full bg-[#1A1A1A] hover:bg-red-600/20 hover:text-red-400 border border-white/10 hover:border-red-800/60 text-gray-400 text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BUSCADOR Y ENCABEZADO H1 SEO */}
      <div className={`container mx-auto px-4 relative z-10 ${hasCarousel ? "mt-8" : "mt-10 md:mt-14"}`}>
        <div className="text-center mb-6 max-w-3xl mx-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
            Repuestos y Accesorios para Motos
          </h1>
          <p className="text-gray-400 text-sm sm:text-base mt-2 font-medium">
            Kits de potenciación, cilindros, levas y repuestos exclusivos con envíos a todo el país
          </p>
        </div>
        <HomeSearch products={JSON.parse(JSON.stringify(allProducts))} />
      </div>

      {/* COMBOS EN OFERTA */}
      {comboProducts.length > 0 && (
        <div className="container mx-auto px-4 mt-14">
          <div className="relative overflow-hidden rounded-lg border border-red-900/40 bg-gradient-to-br from-[#1C0404] via-[#0D0D0D] to-[#0D0D0D] p-6 mb-8">
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.07]">
              <Zap size={110} className="text-red-500" />
            </div>
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-1 h-14 bg-red-600 rounded-full flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-black text-red-500 tracking-widest block mb-1">
                  ⚡ Tiempo Limitado
                </span>
                <h2 className="text-2xl md:text-3xl font-black uppercase text-white tracking-tight">
                  Kits & Combos en Oferta
                </h2>
                <p className="text-gray-500 text-sm mt-0.5">Bundles exclusivos al mejor precio</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {(comboProducts as any[]).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTOS DESTACADOS */}
      <div className="container mx-auto px-4 mt-14">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-1 h-8 bg-red-600 rounded-full flex-shrink-0" />
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">
            Productos Destacados
          </h2>
        </div>

        {featuredProducts.length === 0 ? (
          <p className="text-center text-gray-600 my-8 italic">Aún no hay productos destacados.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {(featuredProducts as any[]).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* TAMBIÉN TE PUEDE INTERESAR */}
      {showcaseProducts.length > 0 && (
        <div className="mt-14 py-12 bg-[#080808] border-y border-white/5">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-1 h-8 bg-red-600 rounded-full flex-shrink-0" />
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">
                También te puede interesar
              </h3>
              <span className="text-[10px] uppercase font-black text-red-400 bg-red-950 border border-red-900/60 px-2.5 py-0.5 rounded-full ml-1">
                Novedades
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
              {(showcaseProducts as any[]).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VER TODOS */}
      <div className="container mx-auto px-4 text-center mt-14">
        <Link href="/shop">
          <Button
            size="lg"
            className="px-10 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black uppercase tracking-wider shadow-lg shadow-red-900/30 hover:scale-105 transition-all border-0 text-base"
          >
            Ver Todos los Productos →
          </Button>
        </Link>
        <p className="text-gray-600 text-sm mt-3">
          {allProducts.length} productos disponibles
        </p>
      </div>

    </div>
  )
}
