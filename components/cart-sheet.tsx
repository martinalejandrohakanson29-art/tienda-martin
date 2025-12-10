"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ShoppingCart, Trash } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getConfig } from "@/app/actions/config"
import { useCart } from "@/hooks/use-cart"

export default function CartSheet() {
    const { cart, removeFromCart, mounted } = useCart()
    const [customerName, setCustomerName] = useState("")
    const [whatsappNumber, setWhatsappNumber] = useState("")

    useEffect(() => {
        getConfig().then(config => {
            if (config?.whatsappNumber) setWhatsappNumber(config.whatsappNumber)
        })
    }, [])

    if (!mounted) return null

    const total = cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0)

    const handleCheckout = () => {
        if (!customerName) {
            alert("Por favor ingresa tu nombre")
            return
        }

        const message = `Hola! Quiero confirmar el siguiente pedido:%0A${cart.map(item => `- ${item.product.title} x${item.quantity}: $${Number(item.product.price) * item.quantity}`).join("%0A")}%0A%0ATotal: $${total}%0A%0AMis datos son: ${customerName}`

        const link = `https://wa.me/${whatsappNumber}?text=${message}`
        window.open(link, "_blank")
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                    <ShoppingCart size={20} />
                    {cart.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                            {cart.reduce((acc, item) => acc + item.quantity, 0)}
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Tu Carrito</SheetTitle>
                </SheetHeader>
                <div className="mt-8 space-y-4">
                    {cart.length === 0 ? (
                        <p className="text-center text-gray-500">El carrito está vacío</p>
                    ) : (
                        <>
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                                {cart.map((item) => (
                                    <div key={item.product.id} className="flex justify-between items-center">
                                        <div>
                                            <p className="font-medium">{item.product.title}</p>
                                            <p className="text-sm text-gray-500">
                                                ${Number(item.product.price)} x {item.quantity}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => removeFromCart(item.product.id)}>
                                            <Trash size={16} className="text-red-500" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t pt-4">
                                <div className="flex justify-between font-bold text-lg mb-4">
                                    <span>Total:</span>
                                    <span>${total.toFixed(2)}</span>
                                </div>
                                <div className="space-y-2 mb-4">
                                    <Label htmlFor="name">Tu Nombre</Label>
                                    <Input
                                        id="name"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="Juan Pérez"
                                    />
                                </div>
                                <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleCheckout}>
                                    Confirmar Pedido en WhatsApp
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
