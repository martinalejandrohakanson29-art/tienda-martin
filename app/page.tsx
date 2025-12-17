import { getCarouselItems } from "@/app/actions/carousel"
import { getFeaturedProducts, getProducts } from "@/app/actions/products" 
import { getConfig } from "@/app/actions/config"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import HomeSearch from "@/components/home-search"
import HomeCarousel from "@/components/home-carousel"
// 👇 1. Importamos el componente de tarjeta que ya tiene el carrusel de imágenes
import ProductCard from "@/components/ui/product-card"

export const dynamic = "force-dynamic"

export default async function Home() {
  const carouselItems = await getCarouselItems()
  const featuredProducts = await getFeaturedProducts()
  const allProducts = await getProducts()
  const config = await getConfig()

  // Serializamos los datos para evitar errores de fechas
  const carouselItemsJson = JSON.parse(JSON.stringify(carouselItems))
  const configJson = JSON.parse(JSON.stringify(config))

  const hasCarousel = carouselItems.length > 0

  return (
    <div className="space-y-12 pb-8">
      
      {hasCarousel && (
        <HomeCarousel items={carouselItemsJson} config={configJson} />
      )}

      <div className={`container mx-auto px-4 relative z-10 ${hasCarousel ? "-mt-8" : "mt-8 md:mt-12"}`}>
        <HomeSearch products={JSON.parse(JSON.stringify(allProducts))} />
      </div>
      
      <div className="container mx-auto px-4 pt-4">
        <h2 className="text-3xl font-bold mb-8 text-center">Productos Destacados</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {featuredProducts.map((product) => (
            // 👇 2. Usamos ProductCard que ya incluye la lógica de flechas/carrusel
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        
        {featuredProducts.length === 0 && (
            <p className="text-center text-gray-500 my-8">Aún no hay productos destacados.</p>
        )}

        <div className="mt-12 text-center">
          <Link href="/shop">
            <Button size="lg" className="px-8">Ver Todos los Productos</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
