"use client"

import { Product } from "@prisma/client"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShoppingCart, ChevronLeft, ChevronRight, Truck } from "lucide-react"
import { formatPrice } from "@/lib/utils"
import { useCart } from "@/hooks/use-cart"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

import { slugify } from "@/lib/seo-utils"

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

    const productSlug = slugify(product.title)
    const productHref = `/products/${product.id}${productSlug ? `/${productSlug}` : ""}`

    const goToProduct = () => {
        router.push(productHref)
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
            className="group relative overflow-hidden border-0 ring-1 ring-white/10 hover:ring-red-600/60 bg-[#111] text-white transition-all duration-300 cursor-pointer h-full flex flex-col rounded-lg shadow-lg hover:shadow-[0_8px_30px_rgba(220,38,38,0.2)]"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Red top accent line */}
            <div className="h-[3px] w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700 flex-shrink-0" />

            {/* Image area — white bg so JPEGs look natural */}
            <div className="aspect-square relative overflow-hidden bg-white flex-shrink-0">
                {hasDiscount && (
                    <div className="absolute top-0 left-0 z-10 bg-red-600 text-white text-[11px] font-black px-3 py-1 leading-none"
                         style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' }}>
                        -{product.discount}%
                    </div>
                )}

                <img
                    src={images[currentImageIndex]}
                    alt={product.title}
                    className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=Sin+Imagen" }}
                />

                {images.length > 1 && isHovered && (
                    <>
                        <button onClick={prevImage} className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black text-white rounded-full p-1 shadow transition-all z-20">
                            <ChevronLeft size={15} />
                        </button>
                        <button onClick={nextImage} className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black text-white rounded-full p-1 shadow transition-all z-20">
                            <ChevronRight size={15} />
                        </button>
                    </>
                )}

                {images.length > 1 && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 pointer-events-none">
                        {images.map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-full transition-all duration-200 ${i === currentImageIndex ? 'w-3 h-1.5 bg-red-500' : 'w-1.5 h-1.5 bg-gray-400/70'}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Info area — dark */}
            <CardContent className="p-3 flex-1 flex flex-col bg-[#111]">
                <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-0.5">
                    {product.category}
                </p>
                <h3 className="font-semibold text-gray-100 text-sm leading-tight line-clamp-2 h-9">
                    {product.title}
                </h3>

                <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/10">
                    <div className="flex flex-col">
                        {hasDiscount && (
                            <span className="text-[10px] text-gray-500 line-through leading-none mb-0.5">
                                {formatPrice(Number(product.price))}
                            </span>
                        )}
                        <span className={`text-lg font-extrabold leading-none ${hasDiscount ? 'text-red-400' : 'text-white'}`}>
                            {formatPrice(finalPrice)}
                        </span>
                    </div>

                    {product.freeShipping && (
                        <div className="flex items-center gap-1 bg-red-950/70 text-red-400 border border-red-900/50 px-2 py-1 rounded text-[9px] font-black uppercase tracking-tight">
                            <Truck size={10} />
                            Envío Gratis
                        </div>
                    )}
                </div>
            </CardContent>

            <CardFooter className="p-3 pt-0 bg-[#111]">
                <Button
                    className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold transition-all shadow-sm h-10 text-xs sm:text-sm"
                    onClick={onAddToCart}
                >
                    <ShoppingCart size={14} className="mr-1.5" /> Agregar al Carrito
                </Button>
            </CardFooter>
        </Card>
    )
}
