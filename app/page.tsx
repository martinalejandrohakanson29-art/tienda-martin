import { getCarouselItems } from "@/app/actions/carousel"
import { getFeaturedProducts, getProducts } from "@/app/actions/products" 
import { getConfig } from "@/app/actions/config"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import HomeSearch from "@/components/home-search"
import QuickAddButton from "@/components/quick-add-button"
import HomeCarousel from "@/components/home-carousel"
import { formatPrice } from "@/lib/utils" // 👈 1. Importamos la función de formato

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
            <Link key={product.id} href={`/products/${product.id}`}>
              <Card className="h-full hover:shadow-lg transition-shadow border-0 shadow-sm cursor-pointer group flex flex-col">
                <div className="aspect-square relative overflow-hidden rounded-t-lg bg-gray-100">
                  {product.discount > 0 && (
                    <span className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10 shadow-sm">
                      {product.discount}% OFF
                    </span>
                  )}
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <CardContent className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-lg truncate">{product.title}</h3>
                  <p className="text-gray-500 text-sm truncate mb-3">{product.category}</p>
                  
                  <div className="mt-auto flex items-end justify-between">
                    <div className="flex flex-col">
                        {product.discount > 0 && (
                            <span className="text-xs text-gray-400 line-through">
                                {/* 👇 2. Corregimos precio original */}
                                {formatPrice(Number(product.price))}
                            </span>
                        )}
                        <span className={`text-xl font-bold ${product.discount > 0 ? 'text-green-700' : 'text-gray-900'}`}>
                            {/* 👇 3. Corregimos precio final con descuento */}
                            {formatPrice(Number(product.price) * (1 - (product.discount || 0) / 100))}
                        </span>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs">Ver</Button>
                        <QuickAddButton product={product} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
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
