"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ShoppingCart, Trash, CreditCard } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getConfig } from "@/app/actions/config"
import { useCart } from "@/hooks/use-cart"

export default function CartSheet() {
    const { cart, removeFromCart, mounted } = useCart()
    const [customerName, setCustomerName] = useState("")
    const [paymentMethod, setPaymentMethod] = useState("") // Estado para el pago
    const [whatsappNumber, setWhatsappNumber] = useState("")
    const [availablePaymentMethods, setAvailablePaymentMethods] = useState<string[]>([])

    useEffect(() => {
        getConfig().then(config => {
            if (config?.whatsappNumber) setWhatsappNumber(config.whatsappNumber)
            // Convertimos la lista de texto (Efectivo,Transferencia) en un array
            if (config?.paymentMethods) {
                setAvailablePaymentMethods(config.paymentMethods.split(",").map(m => m.trim()))
            }
        })
    }, [])

    if (!mounted) return null

    const total = cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0)

    const handleCheckout = () => {
        if (!customerName) {
            alert("Por favor ingresa tu nombre")
            return
        }
        if (!paymentMethod) {
            alert("Por favor selecciona una forma de pago")
            return
        }

        const message = `Hola! Quiero confirmar el siguiente pedido:%0A%0A${cart.map(item => `- ${item.product.title} x${item.quantity}: $${Number(item.product.price) * item.quantity}`).join("%0A")}%0A%0ATotal: $${total}%0A%0AMis datos:%0A- Nombre: ${customerName}%0A- Forma de pago: ${paymentMethod}`

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
            <SheetContent className="flex flex-col h-full">
                <SheetHeader>
                    <SheetTitle>Tu Carrito</SheetTitle>
                </SheetHeader>
                
                <div className="flex-1 overflow-y-auto mt-4 pr-2">
                    {cart.length === 0 ? (
                        <p className="text-center text-gray-500 mt-10">El carrito está vacío</p>
                    ) : (
                        <div className="space-y-4">
                            {cart.map((item) => (
                                <div key={item.product.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                    <div className="flex-1">
                                        <p className="font-medium truncate pr-2">{item.product.title}</p>
                                        <p className="text-sm text-gray-500">
                                            ${Number(item.product.price)} x {item.quantity}
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => removeFromCart(item.product.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                        <Trash size={16} />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {cart.length > 0 && (
                    <div className="border-t pt-4 mt-auto space-y-4 bg-white">
                        <div className="flex justify-between font-bold text-xl">
                            <span>Total:</span>
                            <span>${total.toFixed(2)}</span>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="name">Tu Nombre</Label>
                                <Input
                                    id="name"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Juan Pérez"
                                    className="mt-1"
                                />
                            </div>

                            {/* 👇 SELECTOR DE PAGO */}
                            <div>
                                <Label htmlFor="payment" className="flex items-center gap-2">
                                    <CreditCard size={14} /> Forma de Pago
                                </Label>
                                <select 
                                    id="payment"
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                                >
                                    <option value="" disabled>Selecciona una opción...</option>
                                    {availablePaymentMethods.map(method => (
                                        <option key={method} value={method}>{method}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <Button className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg" onClick={handleCheckout}>
                            Confirmar Pedido en WhatsApp
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
