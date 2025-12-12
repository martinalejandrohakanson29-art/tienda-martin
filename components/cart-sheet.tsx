"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ShoppingCart, CreditCard, Loader2, Send } from "lucide-react"
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
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        getConfig().then(config => {
            if (config?.whatsappNumber) setWhatsappNumber(config.whatsappNumber)
            if (config?.paymentMethods) {
                setAvailablePaymentMethods(config.paymentMethods.split(",").map(m => m.trim()))
            }
        })
    }, [])

    if (!mounted) return null

    // Helper para calcular precio real
    const getFinalPrice = (price: any, discount: number | null) => {
        const numPrice = Number(price)
        const numDiscount = discount || 0
        return numPrice * (1 - numDiscount / 100)
    }

    const total = cart.reduce((sum, item) => {
        const unitPrice = getFinalPrice(item.product.price, item.product.discount)
        return sum + unitPrice * item.quantity
    }, 0)

    // 👇 AQUÍ ESTÁ EL FILTRO DE PRECISIÓN
    const isMercadoPagoOption = (method: string) => {
        const normalized = method.toLowerCase()
        // Buscamos frases exactas para evitar confundir con "MercadoLibre"
        return normalized.includes("link de pago") || 
               normalized.includes("mercado pago") || 
               normalized.includes("mercadopago")
    }

    const handleCheckout = async () => {
        if (!customerName) return alert("Por favor ingresa tu nombre")
        if (!paymentMethod) return alert("Por favor selecciona una forma de pago")

        setLoading(true)

        // Si es la opción específica de Link de Pago...
        if (isMercadoPagoOption(paymentMethod)) {
            try {
                const response = await fetch("/api/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: cart }),
                })
                const data = await response.json()
                if (data.url) {
                    window.location.href = data.url // Nos vamos a Mercado Pago
                } else {
                    alert("Error al generar el link. Intenta nuevamente.")
                }
            } catch (error) {
                console.error(error)
                alert("Error de conexión con el servidor.")
            } finally {
                setLoading(false)
            }

        } else {
            // Si es cualquier OTRA cosa (incluyendo MercadoLibre por ahora, Efectivo, etc.) -> WhatsApp
            const message = `Hola! Quiero confirmar el siguiente pedido:%0A%0A${cart.map(item => {
                const unitPrice = getFinalPrice(item.product.price, item.product.discount)
                const subtotal = unitPrice * item.quantity
                return `- ${item.product.title} x${item.quantity}: $${subtotal.toFixed(2)}`
            }).join("%0A")}%0A%0ATotal: $${total.toFixed(2)}%0A%0AMis datos:%0A- Nombre: ${customerName}%0A- Forma de pago: ${paymentMethod}`

            const link = `https://wa.me/${whatsappNumber}?text=${message}`
            window.open(link, "_blank")
            setLoading(false)
        }
    }

    // Usamos el mismo filtro para cambiar el color y texto del botón
    const isOnlineSelection = isMercadoPagoOption(paymentMethod)

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
            <SheetContent className="h-full overflow-y-auto w-full sm:max-w-md">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-2xl">Tu Carrito</SheetTitle>
                </SheetHeader>
                
                <div className="space-y-8">
                    {/* LISTA DE PRODUCTOS (Sin cambios) */}
                    <div>
                        {cart.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                <ShoppingCart className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">Tu carrito está vacío.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {cart.map((item) => {
                                    const finalUnitPrice = getFinalPrice(item.product.price, item.product.discount)
                                    const itemSubtotal = finalUnitPrice * item.quantity

                                    return (
                                        <div key={item.product.id} className="flex items-start gap-4 pb-6 border-b last:border-0">
                                            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100 relative">
                                                {(item.product.discount || 0) > 0 && (
                                                    <span className="absolute top-0 right-0 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-bl-md z-10">
                                                        -{item.product.discount}%
                                                    </span>
                                                )}
                                                <img
                                                    src={item.product.imageUrl}
                                                    alt={item.product.title}
                                                    className="h-full w-full object-cover object-center"
                                                    referrerPolicy="no-referrer"
                                                />
                                            </div>
                                            <div className="flex flex-1 flex-col">
                                                <div className="flex justify-between text-base font-medium text-gray-900">
                                                    <h3 className="truncate pr-2">{item.product.title}</h3>
                                                    <div className="text-right">
                                                        <p>${itemSubtotal.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                                <p className="mt-1 text-sm text-gray-500">{item.product.category}</p>
                                                <div className="flex items-end justify-between text-sm mt-2">
                                                    <p className="text-gray-500">Cant: <span className="font-semibold text-gray-900">{item.quantity}</span></p>
                                                    <Button 
                                                        variant="ghost" size="sm" 
                                                        onClick={() => removeFromCart(item.product.id)} 
                                                        className="text-red-500 hover:text-red-700 -mr-2 p-2 h-auto"
                                                    >
                                                        Eliminar
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* CHECKOUT */}
                    {cart.length > 0 && (
                        <div className="border-t border-gray-200 pt-6 space-y-6 bg-gray-50 -mx-6 px-6 pb-6 mt-4">
                            <div className="flex justify-between text-base font-medium text-gray-900">
                                <span className="text-lg">Total a Pagar</span>
                                <span className="text-xl font-bold text-green-700">${total.toFixed(2)}</span>
                            </div>
                          
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
                                    <Label htmlFor="payment">Forma de Pago</Label>
                                    <select 
                                        id="payment"
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary mt-1"
                                    >
                                        <option value="" disabled>Selecciona una opción...</option>
                                        {availablePaymentMethods.map(method => (
                                            <option key={method} value={method}>{method}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <Button 
                                className={`w-full h-12 text-lg font-bold shadow-md mt-6 ${isOnlineSelection ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`} 
                                onClick={handleCheckout}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Procesando...
                                    </>
                                ) : isOnlineSelection ? (
                                    <>
                                        Pagar ahora <CreditCard className="ml-2 h-5 w-5" />
                                    </>
                                ) : (
                                    <>
                                        Enviar Pedido <Send className="ml-2 h-5 w-5" />
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
