"use client"

import { useState, useEffect } from "react"
import { Product } from "@prisma/client"

// Evento personalizado para sincronizar el carrito al instante
const CART_UPDATED_EVENT = "cart-updated"

export const useCart = () => {
    const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
    const [mounted, setMounted] = useState(false)

    // Función auxiliar para leer siempre la versión más fresca del carrito
    const getCartFromStorage = () => {
        if (typeof window === "undefined") return []
        const stored = localStorage.getItem("cart")
        return stored ? JSON.parse(stored) : []
    }

    useEffect(() => {
        setMounted(true)
        // 1. Carga inicial
        setCart(getCartFromStorage())

        // 2. Escuchar el "grito" de actualización
        const handleCartUpdate = () => {
            setCart(getCartFromStorage())
        }

        // Nos suscribimos a los eventos (tanto en esta pestaña como en otras)
        window.addEventListener(CART_UPDATED_EVENT, handleCartUpdate)
        window.addEventListener("storage", handleCartUpdate)

        return () => {
            window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdate)
            window.removeEventListener("storage", handleCartUpdate)
        }
    }, [])

    const saveCart = (newCart: { product: Product; quantity: number }[]) => {
        // 1. Guardar en disco
        localStorage.setItem("cart", JSON.stringify(newCart))
        // 2. Avisar a TODOS los componentes que hubo un cambio
        window.dispatchEvent(new Event(CART_UPDATED_EVENT))
        // 3. Actualizar el estado local
        setCart(newCart)
    }

    const addToCart = (product: Product) => {
        // Siempre leemos del disco para no perder nada
        const currentCart = getCartFromStorage()
        const existing = currentCart.find((item: any) => item.product.id === product.id)
        
        let newCart
        if (existing) {
            newCart = currentCart.map((item: any) => 
                item.product.id === product.id 
                    ? { ...item, quantity: item.quantity + 1 } 
                    : item
            )
        } else {
            newCart = [...currentCart, { product, quantity: 1 }]
        }
        
        saveCart(newCart)
        // Opcional: Podrías poner un alert o toast aquí, pero por ahora es silencioso y rápido
    }

    const removeFromCart = (productId: string) => {
        const currentCart = getCartFromStorage()
        const newCart = currentCart.filter((item: any) => item.product.id !== productId)
        saveCart(newCart)
    }

    const clearCart = () => saveCart([])

    return { cart, addToCart, removeFromCart, clearCart, mounted }
}
