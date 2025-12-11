import { getCarouselItems } from "@/app/actions/carousel"
import { getFeaturedProducts, getProducts } from "@/app/actions/products" 
import { getConfig } from "@/app/actions/config" // 👈 Importamos getConfig
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
  const config = await getConfig() // 👈 Obtenemos la config

  const hasCarousel = carouselItems.length > 0

  return (
    <div className="space-y-12 pb-8">
      
      {/* 👇 ESTILO DINÁMICO PARA EL CARRUSEL */}
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

      {/* Carrusel Multimedia */}
      {hasCarousel && (
        <div className="w-full relative group">
          <Carousel className="w-full" opts={{ loop: true }}>
            <CarouselContent>
              {carouselItems.map((item) => (
                <CarouselItem key={item.id} className="pl-0"> 
                  {/* 👇 Usamos la clase dinámica aquí en lugar de h-[...] fijos */}
                  <div className="relative w-full dynamic-carousel-height bg-black">
                    {item.mediaType === "video" ? (
                      <iframe
                        src={`${item.mediaUrl}`}
                        className="w-full h-full object-cover" // object-cover hace que se "acomode"
                        allow="autoplay; encrypted-media"
                        title="Video Banner"
                        style={{ border: 0 }}
                      />
                    ) : (
                      <img
                        src={item.mediaUrl}
                        alt="Banner"
                        className="w-full h-full object-cover" // object-cover hace que se "acomode"
                        referrerPolicy="no-referrer"
                      />
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

      {/* ... (El resto de tu código del buscador y productos sigue igual) ... */}
      <div className={`container mx-auto px-4 relative z-10 ${hasCarousel ? "-mt-8" : "mt-8 md:mt-12"}`}>
        <HomeSearch products={JSON.parse(JSON.stringify(allProducts))} />
      </div>
      
      {/* ... Featured Products ... */}
    </div>
  )
}
