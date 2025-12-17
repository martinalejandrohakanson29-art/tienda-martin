"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShoppingCart } from "lucide-react"
import Link from "next/link"
// 👇 CORRECCIÓN: Usamos llaves { } para importar porque no es un export default
import { useCart } from "@/hooks/use-cart"
import { toast } from "sonner"
import { formatPrice } from "@/lib/utils"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

interface ProductCardProps {
    product: any
}

export default function ProductCard({ product }: ProductCardProps) {
    // 👇 CORRECCIÓN: Extraemos la función correcta 'addToCart'
    const { addToCart } = useCart()

    const onAddToCart = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // 👇 CORRECCIÓN: Usamos el nombre correcto de la función
        addToCart(product)
        toast.success("Producto agregado al carrito")
    }

    const preventLinkAction = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)
    
    // Filtramos imágenes vacías
    const images = [product.imageUrl, product.imageUrl2, product.imageUrl3].filter(img => img && img.trim() !== "")

    return (
        <Link href={`/products/${product.id}`} className="block h-full">
            <Card className="h-full hover:shadow-lg transition-shadow duration-300 cursor-pointer group overflow-hidden border-0 bg-white shadow-sm ring-1 ring-gray-100">
                
                {/* ZONA DE IMAGEN / CARRUSEL */}
                <div className="aspect-square relative overflow-hidden bg-gray-100">
                    {product.discount > 0 && (
                         <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10 shadow-sm">
                            -{product.discount}%
                        </span>
                    )}
                    
                    {images.length > 1 ? (
                        <Carousel className="w-full h-full" opts={{ loop: true }}>
                             <CarouselContent>
                                {images.map((img, index) => (
                                    <CarouselItem key={index} className="pl-0"> 
                                        <div className="aspect-square relative w-full h-full">
                                            <img 
                                                src={img} 
                                                alt={product.title} 
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        </div>
                                    </CarouselItem>
                                ))}
                             </CarouselContent>
                             
                             <div 
                                onClick={preventLinkAction} 
                                className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20"
                             >
                                <CarouselPrevious className="h-8 w-8 relative static translate-y-0 bg-white/80 hover:bg-white" />
                             </div>
                             
                             <div 
                                onClick={preventLinkAction} 
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20"
                             >
                                <CarouselNext className="h-8 w-8 relative static translate-y-0 bg-white/80 hover:bg-white" />
                             </div>
                        </Carousel>
                    ) : (
                        <img 
                            src={images[0] || product.imageUrl} 
                            alt={product.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                        />
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 hidden md:block z-30">
                        <Button 
                            className="w-full bg-white text-black hover:bg-gray-100 shadow-lg" 
                            size="sm" 
                            onClick={onAddToCart}
                        >
                            <ShoppingCart size={16} className="mr-2" /> Agregar
                        </Button>
                    </div>
                </div>
                
                <CardContent className="p-3">
                    <h3 className="font-medium text-sm text-gray-800 line-clamp-2 min-h-[2.5rem] leading-tight group-hover:text-blue-600 transition-colors">
                        {product.title}
                    </h3>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="font-bold text-lg text-gray-900">
                            {formatPrice(finalPrice)}
                        </span>
                        {product.discount > 0 && (
                            <span className="text-xs text-gray-400 line-through">
                                {formatPrice(Number(product.price))}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
