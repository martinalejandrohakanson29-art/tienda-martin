"use client"

import { Product } from "@prisma/client"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react"
import { formatPrice } from "@/lib/utils"
import { useCart } from "@/hooks/use-cart"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

interface ProductCardProps {
    product: Product
}

export default function ProductCard({ product }: ProductCardProps) {
    const cart = useCart()
    const router = useRouter()
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    const images = [
        product.imageUrl,
        product.imageUrl2,
        product.imageUrl3
    ].filter(Boolean) as string[]

    useEffect(() => {
        images.forEach((src) => {
            const img = new Image()
            img.src = src
        })
    }, [images])

    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation()
        setCurrentImageIndex((prev) => (prev + 1) % images.length)
    }

    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation()
        setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
    }

    const goToProduct = () => {
        router.push(`/products/${product.id}`)
    }

    const onAddToCart = (e: React.MouseEvent) => {
        e.stopPropagation()
        cart.addToCart(product)
    }

    const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)
    const hasDiscount = (product.discount || 0) > 0

    return (
        <Card 
            onClick={goToProduct}
            className="group relative overflow-hidden border-gray-100 hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="aspect-square relative overflow-hidden bg-gray-100">
                {/* 👇 CAMBIO 1: Badge Verde */}
                {hasDiscount && (
                    <span className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full z-10 shadow-sm">
                        -{product.discount}%
                    </span>
                )}
                
                <img 
                    src={images[currentImageIndex]} 
                    alt={product.title} 
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=Sin+Imagen" }}
                />

                {images.length > 1 && isHovered && (
                    <>
                        <button onClick={prevImage} className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 rounded-full p-1 shadow-md transition-all z-20">
                            <ChevronLeft size={16} />
                        </button>
                        <button onClick={nextImage} className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 rounded-full p-1 shadow-md transition-all z-20">
                            <ChevronRight size={16} />
                        </button>
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-20">
                            {images.map((_, idx) => (
                                <div key={idx} className={`h-1.5 w-1.5 rounded-full shadow-sm ${idx === currentImageIndex ? 'bg-blue-600' : 'bg-white/70'}`} />
                            ))}
                        </div>
                    </>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
            </div>

            <CardContent className="p-3 flex-1 flex flex-col">
                <div className="mb-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        {product.category}
                    </p>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 h-9 mt-1" title={product.title}>
                        {product.title}
                    </h3>
                </div>

                <div className="mt-auto pt-2 flex items-end justify-between border-t border-gray-50">
                    <div className="flex flex-col">
                        {hasDiscount && (
                            <span className="text-[10px] text-gray-400 line-through">
                                {formatPrice(Number(product.price))}
                            </span>
                        )}
                        {/* 👇 CAMBIO 2: Precio Verde si hay descuento o normal si no */}
                        <span className={`text-lg font-extrabold ${hasDiscount ? 'text-green-700' : 'text-gray-900'}`}>
                            {formatPrice(finalPrice)}
                        </span>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="p-3 pt-0">
                <Button className="w-full bg-slate-900 hover:bg-blue-600 text-white transition-colors shadow-sm" size="sm" onClick={onAddToCart}>
                    <ShoppingCart size={16} className="mr-2" /> Agregar
                </Button>
            </CardFooter>
        </Card>
    )
}
