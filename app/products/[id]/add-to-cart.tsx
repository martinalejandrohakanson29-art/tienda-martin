"use client"

import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/use-cart"
import { ShoppingCart } from "lucide-react"

export default function AddToCart({ product }: { product: any }) {
    const { addToCart } = useCart()

    const handleAddToCart = () => {
        // 1. Lógica existente del carrito
        addToCart(product);

        // 2. 👇 Lógica del Píxel de Meta
        if (typeof window !== "undefined" && (window as any).fbq) {
            (window as any).fbq('track', 'AddToCart', {
                content_name: product.title,
                content_ids: [product.id],
                content_type: 'product',
                value: product.price,
                currency: 'ARS'
            });
        }
    }

    return (
        <Button 
            onClick={handleAddToCart} // 👈 Cambiamos esto para usar la nueva función
            size="lg" 
            className="w-full md:w-auto text-lg px-8"
        >
            <ShoppingCart className="mr-2 h-5 w-5" />
            Agregar al Carrito
        </Button>
    )
}
