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
    const [paymentMethod, setPaymentMethod] = useState("")
    const [whatsappNumber, setWhatsappNumber] = useState("")
    const [availablePaymentMethods, setAvailablePaymentMethods] = useState<string[]>([])

    useEffect(() => {
        getConfig().then(config => {
            if (config?.whatsappNumber) setWhatsappNumber(config.whatsappNumber)
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
            {/* 👇 CAMBIO 1: Quitamos el flex layout para que todo fluya junto y tenga scroll */}
            <SheetContent className="h-full overflow-y-auto w-full sm:max-w-md">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-2xl">Tu Carrito</SheetTitle>
                </SheetHeader>
                
                <div className="space-y-8"> {/* Contenedor principal con espaciado */}
                    
                    {/* SECCIÓN LISTA DE PRODUCTOS */}
                    <div>
                        {cart.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                <ShoppingCart className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">Tu carrito está vacío.</p>
                                <p className="text-sm text-gray-400 mt-1">¡Agrega algo para empezar!</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {cart.map((item) => (
                                    // 👇 CAMBIO 2: Estructura con imagen
                                    <div key={item.product.id} className="flex items-start gap-4 pb-6 border-b last:border-0">
                                        {/* Miniatura de Imagen */}
                                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                                            <img
                                                src={item.product.imageUrl}
                                                alt={item.product.title}
                                                className="h-full w-full object-cover object-center"
                                                referrerPolicy="no-referrer"
                                            />
                                        </div>

                                        {/* Detalles del Producto */}
                                        <div className="flex flex-1 flex-col">
                                            <div className="flex justify-between text-base font-medium text-gray-900">
                                                <h3 className="truncate pr-2">{item.product.title}</h3>
                                                <p className="ml-4 shrink-0">
                                                    ${(Number(item.product.price) * item.quantity).toFixed(2)}
                                                </p>
                                            </div>
                                            <p className="mt-1 text-sm text-gray-500">{item.product.category}</p>
                                            
                                            <div className="flex items-end justify-between text-sm mt-2">
                                                <p className="text-gray-500">Cant: <span className="font-semibold text-gray-900">{item.quantity}</span></p>

                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => removeFromCart(item.product.id)} 
                                                    className="text-red-500 hover:text-red-700 -mr-2 p-2 h-auto"
                                                >
                                                    Eliminar
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* SECCIÓN RESUMEN Y FORMULARIO (Solo se muestra si hay ítems) */}
                    {cart.length > 0 && (
                        <div className="border-t border-gray-200 pt-6 space-y-6 bg-gray-50 -mx-6 px-6 pb-6 mt-4">
                            <div className="flex justify-betweentext-base font-medium text-gray-900">
                                <span className="text-lg">Subtotal</span>
                                <span className="text-xl font-bold">${total.toFixed(2)}</span>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">El envío y los impuestos se calculan al confirmar.</p>

                            <div className="space-y-4 pt-4">
                                <h4 className="font-medium flex items-center gap-2"><CreditCard size={18}/> Datos para el Pedido</h4>
                                <div>
                                    <Label htmlFor="name">Tu Nombre Completo</Label>
                                    <Input
                                        id="name"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="Ej: Juan Pérez"
                                        className="mt-1 bg-white"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="payment">Forma de Pago Preferida</Label>
                                    <select 
                                        id="payment"
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                                    >
                                        <option value="" disabled>Selecciona una opción...</option>
                                        {availablePaymentMethods.map(method => (
                                            <option key={method} value={method}>{method}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <Button className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg font-bold shadow-md mt-6" onClick={handleCheckout}>
                                Finalizar Pedido por WhatsApp
                            </Button>
                            <p className="text-xs text-center text-gray-500 mt-2">Serás redirigido a WhatsApp para enviar el detalle.</p>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
