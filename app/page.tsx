import { getCarouselItems } from "@/app/actions/carousel"
import { getFeaturedProducts, getProducts } from "@/app/actions/products" 
import { getConfig } from "@/app/actions/config"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import HomeSearch from "@/components/home-search"

export const dynamic = "force-dynamic"

export default async function Home() {
  const carouselItems = await getCarouselItems()
  const featuredProducts = await getFeaturedProducts()
  const allProducts = await getProducts()
  const config = await getConfig()

  const hasCarousel = carouselItems.length > 0

  return (
    <div className="space-y-12 pb-8">
      
      {/* Estilos dinámicos para altura */}
      <style>{`
        .dynamic-carousel-height {
          height: ${config?.carouselHeightMobile || '250px'};
        }
        @media (min-width: 768px) {
          .dynamic-carousel-height {
            height: ${config?.carouselHeightDesktop || '600px'};
          }
        }
      `}</style>

      {hasCarousel && (
        <div className="w-full relative group">
          <Carousel className="w-full" opts={{ loop: true }}>
            <CarouselContent>
              {carouselItems.map((item) => (
                <CarouselItem key={item.id} className="pl-0"> 
                  <div className="relative w-full dynamic-carousel-height bg-black">
                    {item.mediaType === "video" ? (
                      // Video: Se usa el mismo para ambos (difícil tener 2 videos sincronizados)
                      <iframe
                        src={`${item.mediaUrl}`}
                        className="w-full h-full object-cover"
                        allow="autoplay; encrypted-media"
                        title="Video Banner"
                        style={{ border: 0 }}
                      />
                    ) : (
                      <>
                        {/* 🖥️ IMAGEN PARA PC (Visible solo en md o superior) */}
                        <img
                          src={item.mediaUrl}
                          alt="Banner PC"
                          className="hidden md:block w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />

                        {/* 📱 IMAGEN PARA MÓVIL (Visible solo hasta md) */}
                        {/* Si no hay imagen móvil específica, usa la de PC como respaldo */}
                        <img
                          src={item.mediaUrlMobile || item.mediaUrl}
                          alt="Banner Móvil"
                          className="block md:hidden w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </>
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {carouselItems.length > 1 && (
                <>
                    <CarouselPrevious className="left-4 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white z-10" />
                    <CarouselNext className="right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white z-10" />
                </>
            )}
          </Carousel>
        </div>
      )}

      {/* Resto de la página sigue igual... */}
      <div className={`container mx-auto px-4 relative z-10 ${hasCarousel ? "-mt-8" : "mt-8 md:mt-12"}`}>
        <HomeSearch products={JSON.parse(JSON.stringify(allProducts))} />
      </div>
      
      <div className="container mx-auto px-4 pt-4">
        <h2 className="text-3xl font-bold mb-8 text-center">Productos Destacados</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {featuredProducts.map((product) => (
            <Link key={product.id} href={`/products/${product.id}`}>
              <Card className="h-full hover:shadow-lg transition-shadow border-0 shadow-sm cursor-pointer group">
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
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg truncate">{product.title}</h3>
                  <p className="text-gray-500 text-sm truncate">{product.category}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex flex-col">
                        {product.discount > 0 && (
                            <span className="text-xs text-gray-400 line-through">
                                ${Number(product.price).toFixed(2)}
                            </span>
                        )}
                        <span className={`text-xl font-bold ${product.discount > 0 ? 'text-green-700' : 'text-gray-900'}`}>
                            ${(Number(product.price) * (1 - (product.discount || 0) / 100)).toFixed(2)}
                        </span>
                    </div>
                    <Button size="sm" variant="secondary">Ver</Button>
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
