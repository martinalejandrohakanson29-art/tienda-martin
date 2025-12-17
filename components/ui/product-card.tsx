"use client"

import { Product } from "@prisma/client"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShoppingCart, Eye, ChevronLeft, ChevronRight } from "lucide-react"
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

    // Preparamos las imágenes disponibles
    const images = [
        product.imageUrl,
        product.imageUrl2,
        product.imageUrl3
    ].filter(Boolean) as string[] // Filtramos las que no existen

    // Pre-carga de imágenes para evitar parpadeos
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

    // Calculamos precio final
    const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)

    return (
        <Card 
            onClick={goToProduct}
            className="group relative overflow-hidden border-gray-100 hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 1. SECCIÓN DE IMAGEN (Con Carrusel) */}
            <div className="aspect-square relative overflow-hidden bg-gray-100">
                {/* Badge de Descuento */}
                {(product.discount || 0) > 0 && (
                    <span className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full z-10 shadow-sm">
                        -{product.discount}%
                    </span>
                )}
                
                {/* Imagen Actual */}
                <img 
                    src={images[currentImageIndex]} 
                    alt={product.title} 
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=Sin+Imagen" }}
                />

                {/* Flechas de Navegación (Solo si hay más de 1 imagen y hacemos hover) */}
                {images.length > 1 && isHovered && (
                    <>
                        <button 
                            onClick={prevImage}
                            className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 rounded-full p-1 shadow-md transition-all z-20"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button 
                            onClick={nextImage}
                            className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 rounded-full p-1 shadow-md transition-all z-20"
                        >
                            <ChevronRight size={16} />
                        </button>
                        {/* Indicador de puntitos */}
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-20">
                            {images.map((_, idx) => (
                                <div 
                                    key={idx} 
                                    className={`h-1.5 w-1.5 rounded-full shadow-sm ${idx === currentImageIndex ? 'bg-blue-600' : 'bg-white/70'}`}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* Overlay Oscuro al hacer hover (opcional, para resaltar botones) */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
            </div>

            {/* 2. SECCIÓN DE INFORMACIÓN */}
            <CardContent className="p-3 flex-1 flex flex-col">
                <div className="mb-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        {product.category}
                    </p>
                    
                    {/* 👇 CAMBIO CLAVE AQUÍ: Título Mejorado */}
                    {/* line-clamp-2: Permite 2 líneas y luego pone '...' */}
                    {/* h-10: Altura fija para que todas las tarjetas midan lo mismo aunque el título sea corto */}
                    <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 h-9 mt-1" title={product.title}>
                        {product.title}
                    </h3>
                </div>

                <div className="mt-auto pt-2 flex items-end justify-between border-t border-gray-50">
                    <div className="flex flex-col">
                        {(product.discount || 0) > 0 && (
                            <span className="text-[10px] text-gray-400 line-through">
                                {formatPrice(Number(product.price))}
                            </span>
                        )}
                        <span className="text-lg font-extrabold text-gray-900">
                            {formatPrice(finalPrice)}
                        </span>
                    </div>
                </div>
            </CardContent>

            {/* 3. BOTÓN DE ACCIÓN (Aparece en PC al hover, visible en móvil) */}
            <CardFooter className="p-3 pt-0">
                <Button 
                    className="w-full bg-slate-900 hover:bg-blue-600 text-white transition-colors shadow-sm" 
                    size="sm"
                    onClick={onAddToCart}
                >
                    <ShoppingCart size={16} className="mr-2" /> Agregar
                </Button>
            </CardFooter>
        </Card>
    )
}
