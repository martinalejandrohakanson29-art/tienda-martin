"use client"

import { useState, useEffect } from "react"
import { Product } from "@prisma/client"

export const useCart = () => {
    const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const stored = localStorage.getItem("cart")
        if (stored) setCart(JSON.parse(stored))
    }, [])

    const saveCart = (newCart: { product: Product; quantity: number }[]) => {
        setCart(newCart)
        localStorage.setItem("cart", JSON.stringify(newCart))
    }

    const addToCart = (product: Product) => {
        const existing = cart.find((item) => item.product.id === product.id)
        if (existing) {
            saveCart(cart.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
        } else {
            saveCart([...cart, { product, quantity: 1 }])
        }
    }

    const removeFromCart = (productId: string) => {
        saveCart(cart.filter((item) => item.product.id !== productId))
    }

    const clearCart = () => saveCart([])

    return { cart, addToCart, removeFromCart, clearCart, mounted }
}
