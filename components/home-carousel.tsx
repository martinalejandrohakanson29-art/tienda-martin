"use client"

import * as React from "react"
import Autoplay from "embla-carousel-autoplay"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"

export default function HomeCarousel({ items, config }: { items: any[], config: any }) {
  // CORRECCIÓN: Usamos la configuración nativa del plugin para el mouse
  const plugin = React.useRef(
    Autoplay({ 
        delay: 2000, 
        stopOnInteraction: false, // Sigue rodando después de que lo tocas
        stopOnMouseEnter: true    // Se detiene solo si pones el mouse encima
    })
  )

  if (items.length === 0) return null

  return (
    <div className="w-full relative group">
      {/* Estilos dinámicos para la altura */}
      <style jsx global>{`
        .dynamic-carousel-height {
          height: ${config?.carouselHeightMobile || '250px'};
        }
        @media (min-width: 768px) {
          .dynamic-carousel-height {
            height: ${config?.carouselHeightDesktop || '600px'};
          }
        }
      `}</style>

      {/* Eliminamos los eventos manuales onMouse... que causaban el error */}
      <Carousel
        plugins={[plugin.current]}
        className="w-full"
        opts={{ loop: true }}
      >
        <CarouselContent>
          {items.map((item) => (
            <CarouselItem key={item.id} className="pl-0">
              <div className="relative w-full dynamic-carousel-height bg-black">
                {item.mediaType === "video" ? (
                  <>
                    <div className="hidden md:block w-full h-full">
                      <iframe
                        src={`${item.mediaUrl}`}
                        className="w-full h-full object-cover"
                        allow="autoplay; encrypted-media"
                        title="Video PC"
                        style={{ border: 0 }}
                      />
                    </div>
                    <div className="block md:hidden w-full h-full">
                      <iframe
                        src={`${item.mediaUrlMobile || item.mediaUrl}`}
                        className="w-full h-full object-cover"
                        allow="autoplay; encrypted-media"
                        title="Video Móvil"
                        style={{ border: 0 }}
                      />
                    </div>
                    {/* Capa transparente para permitir arrastrar sobre el video */}
                    <div className="absolute inset-0 bg-transparent pointer-events-none md:pointer-events-auto" />
                  </>
                ) : (
                  <>
                    <img
                      src={item.mediaUrl}
                      alt="Banner PC"
                      className="hidden md:block w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
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
        {items.length > 1 && (
          <>
            <CarouselPrevious className="left-4 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white z-10" />
            <CarouselNext className="right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white z-10" />
          </>
        )}
      </Carousel>
    </div>
  )
}
