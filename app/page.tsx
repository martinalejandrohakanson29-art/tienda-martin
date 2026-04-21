import { getCarouselItems } from "@/app/actions/carousel"
// 👇 1. Importamos la nueva función getHomeShowcaseProducts
import { getFeaturedProducts, getProducts, getHomeShowcaseProducts, getComboProducts } from "@/app/actions/products" 
import { getConfig } from "@/app/actions/config"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import HomeSearch from "@/components/home-search"
import HomeCarousel from "@/components/home-carousel"
import ProductCard from "@/components/ui/product-card"
import { Store, ShoppingBag } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function Home() {
  const carouselItems = await getCarouselItems()
  const featuredProducts = await getFeaturedProducts()
  // 👇 2. Traemos los productos de la Vidriera
  const showcaseProducts = await getHomeShowcaseProducts() 
  const comboProducts = await getComboProducts()
  const allProducts = await getProducts()
  const config = await getConfig()

  // Serializamos los datos
  const carouselItemsJson = JSON.parse(JSON.stringify(carouselItems))
  const configJson = JSON.parse(JSON.stringify(config))

  const hasCarousel = carouselItems.length > 0

  return (
    <div className="space-y-12 pb-8">
      
      {/* CARRUSEL */}
      {hasCarousel && (
        <HomeCarousel items={carouselItemsJson} config={configJson} />
      )}

      {/* BUSCADOR */}
      <div className={`container mx-auto px-4 relative z-10 ${hasCarousel ? "-mt-8" : "mt-8 md:mt-12"}`}>
        <HomeSearch products={JSON.parse(JSON.stringify(allProducts))} />
      </div>
      
      {/* SECCIÓN 0: COMBOS EN OFERTA (Nueva) */}
      {comboProducts.length > 0 && (
        <div className="container mx-auto px-4 pt-4">
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-6 rounded-2xl shadow-xl mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
                    <ShoppingBag size={120} />
                </div>
                <div className="relative z-10">
                    <h2 className="text-3xl font-bold mb-2">Combos en oferta</h2>
                    <p className="text-yellow-50 opacity-90">Aprovechá estas ofertas exclusivas por tiempo limitado</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {comboProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                ))}
            </div>
        </div>
      )}

      {/* SECCIÓN 1: PRODUCTOS DESTACADOS (Grandes) */}
      <div className="container mx-auto px-4 pt-4">
        <h2 className="text-3xl font-bold mb-8 text-center">Productos Destacados</h2>
        
        {featuredProducts.length === 0 ? (
            <p className="text-center text-gray-500 my-8 italic">Aún no hay productos destacados.</p>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
            ))}
            </div>
        )}
      </div>

      {/* 👇 SECCIÓN 2: VIDRIERA / ÚLTIMOS INGRESOS (Más compacta y distinta) */}
      {showcaseProducts.length > 0 && (
        <div className="bg-slate-50 py-12 border-y border-slate-200">
            <div className="container mx-auto px-4">
                <div className="flex items-center gap-2 mb-6">
                    <Store className="text-indigo-600" />
                    <h3 className="text-xl md:text-2xl font-bold text-slate-800">
                        TAMBIEN TE PUEDE INTERESAR
                    </h3>
                    <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full ml-2">
                        Novedades
                    </span>
                </div>
                
                {/* Grilla más densa (hasta 6 columnas) y tarjetas un poco más chicas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {showcaseProducts.map((product) => (
                        // Usamos scale-95 para que se vean un poco más "compactos" visualmente
                        <div key={product.id} className="transform scale-95 origin-top hover:scale-100 transition-transform duration-200">
                            <ProductCard product={product} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* BOTÓN VER TODOS */}
      <div className="container mx-auto px-4 text-center mt-8">
        <Link href="/shop">
          <Button size="lg" className="px-8 shadow-lg font-bold text-lg hover:scale-105 transition-transform">
            Ver Todos los Productos
          </Button>
        </Link>
      </div>
    </div>
  )
}
