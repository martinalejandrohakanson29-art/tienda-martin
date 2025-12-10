"use client"

import { Button } from "@/components/ui/button"
import { useCart } from "@/hooks/use-cart"
import { ShoppingCart } from "lucide-react"

// Recibimos el producto completo como propiedad
export default function AddToCart({ product }: { product: any }) {
    const { addToCart } = useCart()

    return (
        <Button 
            onClick={() => addToCart(product)} 
            size="lg" 
            className="w-full md:w-auto text-lg px-8"
        >
            <ShoppingCart className="mr-2 h-5 w-5" />
            Agregar al Carrito
        </Button>
    )
}
