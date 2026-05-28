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
            const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)
            ;(window as any).fbq("track", "AddToCart", {
                content_name: product.title,
                content_ids: [product.id],
                content_type: "product",
                contents: [{ id: product.id, quantity: 1, item_price: finalPrice }],
                value: finalPrice,
                currency: "ARS",
            })
        }
    }

    return (
        <Button
            onClick={handleAddToCart}
            className="w-full h-14 text-base font-black uppercase tracking-wide bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-lg shadow-red-900/30 hover:scale-[1.01] transition-all border-0"
        >
            <ShoppingCart className="mr-2 h-5 w-5" />
            Agregar al Carrito
        </Button>
    )
}
