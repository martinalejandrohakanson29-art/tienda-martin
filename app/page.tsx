import { getCarouselItems } from "@/app/actions/carousel"
import { getProducts } from "@/app/actions/products"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function Home() {
  const carouselItems = await getCarouselItems()
  const products = await getProducts()
  const featuredProducts = products.slice(0, 8)

  return (
    <div className="space-y-12 pb-8">
      {/* Carousel */}
      {carouselItems.length > 0 && (
        <div className="w-full relative group">
          <Carousel className="w-full" opts={{ loop: true }}>
            <CarouselContent>
              {carouselItems.map((item) => (
                <CarouselItem key={item.id}>
                  <div className="relative w-full h-[300px] md:h-[500px]">
                    <img
                      src={item.imageUrl}
                      alt="Banner"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer" 
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CarouselNext className="right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Carousel>
        </div>
      )}

      {/* Featured Products */}
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold mb-8 text-center">Productos Destacados</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {featuredProducts.map((product) => (
            <Link key={product.id} href={`/products/${product.id}`}>
              <Card className="h-full hover:shadow-lg transition-shadow border-0 shadow-sm">
                <div className="aspect-square relative overflow-hidden rounded-t-lg bg-gray-100">
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg truncate">{product.title}</h3>
                  <p className="text-gray-500 text-sm truncate">{product.category}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xl font-bold">${Number(product.price).toFixed(2)}</span>
                    <Button size="sm" variant="secondary">Ver</Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/shop">
            <Button size="lg" className="px-8">Ver Todos los Productos</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
