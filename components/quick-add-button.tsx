"use client"

import { Button } from "@/components/ui/button"
import { ShoppingCart } from "lucide-react"
import { useCart } from "@/hooks/use-cart"

export default function QuickAddButton({ product }: { product: any }) {
    const { addToCart } = useCart()

    const handleAdd = (e: React.MouseEvent) => {
        e.preventDefault() // Evita entrar al producto al hacer clic
        e.stopPropagation()
        addToCart(product)
    }

    return (
        <Button 
            size="icon" 
            variant="secondary"
            onClick={handleAdd} 
            className="rounded-full hover:bg-green-600 hover:text-white transition-all shadow-sm h-8 w-8"
            title="Agregar al carrito"
        >
            <ShoppingCart className="h-4 w-4" />
        </Button>
    )
}
