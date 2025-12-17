"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ShoppingCart, CreditCard, Loader2, Send, ExternalLink } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getConfig } from "@/app/actions/config"
import { useCart } from "@/hooks/use-cart"
import { formatPrice } from "@/lib/utils"

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

    const getFinalPrice = (price: any, discount: number | null) => {
        const numPrice = Number(price)
        const numDiscount = discount || 0
        return numPrice * (1 - numDiscount / 100)
    }

    const total = cart.reduce((sum, item) => {
        const unitPrice = getFinalPrice(item.product.price, item.product.discount)
        return sum + unitPrice * item.quantity
    }, 0)

    const isMercadoPagoOption = (method: string) => {
        const normalized = method.toLowerCase()
        return normalized.includes("link") || normalized.includes("mercado pago") || normalized.includes("mercadopago")
    }

    const isMercadoLibreOption = (method: string) => {
        return method.toLowerCase().includes("mercadolibre") || method.toLowerCase().includes("ml")
    }

    const isML = isMercadoLibreOption(paymentMethod)
    const isMP = isMercadoPagoOption(paymentMethod) && !isML

    const handleCheckout = async () => {
        if (!customerName) return alert("Por favor ingresa tu nombre")
        if (!paymentMethod) return alert("Por favor selecciona una forma de pago")

        setLoading(true)

        if (isMP) {
            try {
                const response = await fetch("/api/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: cart }),
                })
                const data = await response.json()
                if (data.url) window.location.href = data.url
                else alert("Error al generar el link.")
            } catch (error) {
                alert("Error de conexión.")
            } finally {
                setLoading(false)
            }
            return
        }

        const message = `Hola! Quiero confirmar el siguiente pedido:%0A%0A${cart.map(item => {
            const unitPrice = getFinalPrice(item.product.price, item.product.discount)
            const subtotal = unitPrice * item.quantity
            return `- ${item.product.title} x${item.quantity}: ${formatPrice(subtotal)}`
        }).join("%0A")}%0A%0ATotal: ${formatPrice(total)}%0A%0AMis datos:%0A- Nombre: ${customerName}%0A- Forma de pago: ${paymentMethod}`

        const link = `https://wa.me/${whatsappNumber}?text=${message}`
        window.open(link, "_blank")
        setLoading(false)
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                {/* 👇 CAMBIO 1: Botón mucho más grande (h-14/16) y borde más grueso */}
                <Button 
                    variant="outline" 
                    className="relative h-14 w-14 md:h-16 md:w-16 rounded-full border-2 border-gray-300 hover:border-blue-600 hover:bg-blue-50 transition-all shadow-sm"
                >
                    {/* 👇 CAMBIO 2: Ícono Gigante (size={32}) */}
                    <ShoppingCart size={32} className="text-gray-700" />
                    
                    {cart.length > 0 && (
                        /* 👇 CAMBIO 3: Badge más grande y mejor posicionado */
                        <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-6 h-6 md:w-7 md:h-7 flex items-center justify-center text-xs md:text-sm font-bold border-2 border-white shadow-sm animate-in zoom-in">
                            {cart.reduce((acc, item) => acc + item.quantity, 0)}
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent className="h-full overflow-y-auto w-full sm:max-w-md flex flex-col">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-2xl">Tu Carrito</SheetTitle>
                </SheetHeader>
                
                {/* LISTADO DE PRODUCTOS */}
                <div className="flex-1 space-y-6 overflow-y-auto min-h-0">
                    {cart.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed rounded-lg">
                            <ShoppingCart className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">Tu carrito está vacío.</p>
                        </div>
                    ) : (
                        cart.map((item) => {
                            const finalUnitPrice = getFinalPrice(item.product.price, item.product.discount)
                            const itemSubtotal = finalUnitPrice * item.quantity
                            return (
                                <div key={item.product.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100 relative">
                                        {(item.product.discount || 0) > 0 && (
                                            <span className="absolute top-0 right-0 bg-green-600 text-white text-[10px] font-bold px-1 py-0.5 rounded-bl-md z-10">
                                                -{item.product.discount}%
                                            </span>
                                        )}
                                        <img src={item.product.imageUrl} alt={item.product.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                    </div>
                                    <div className="flex flex-1 flex-col">
                                        <div className="flex justify-between text-sm font-medium text-gray-900">
                                            <h3 className="pr-2 leading-tight">{item.product.title}</h3>
                                            {/* PRECIO VISUAL VERDE */}
                                            <p className="font-bold text-green-700">{formatPrice(itemSubtotal)}</p>
                                        </div>
                                        <div className="flex items-center justify-between text-xs mt-2">
                                            <p className="text-gray-500">Cant: {item.quantity}</p>
                                            <Button variant="ghost" size="sm" onClick={() => removeFromCart(item.product.id)} className="text-red-500 h-6 px-2">Borrar</Button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* ZONA DE PAGO */}
                {cart.length > 0 && (
                    <div className="border-t border-gray-200 pt-6 space-y-4 bg-gray-50 -mx-6 px-6 pb-6 mt-auto">
                        <div className="flex justify-between text-base font-medium text-gray-900">
                            <span>Total a Pagar</span>
                            <span className="text-xl font-bold text-green-700">{formatPrice(total)}</span>
                        </div>

                        <div>
                            <Label htmlFor="payment" className="text-xs uppercase text-gray-500 font-bold">1. Elige cómo pagar</Label>
                            <select 
                                id="payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary mt-1"
                            >
                                <option value="" disabled>Selecciona una opción...</option>
                                {availablePaymentMethods.map(method => (
                                    <option key={method} value={method}>{method}</option>
                                ))}
                            </select>
                        </div>

                        {isML ? (
                            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                <div className="text-yellow-800 bg-yellow-50 p-3 rounded border border-yellow-200 text-sm font-medium text-center">
                                    Aquí tienes los links directos a nuestras publicaciones:
                                </div>
                                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                                    {cart.map((item, index) => {
                                        const mlLink = (item.product as any).mercadolibreUrl;
                                        return (
                                            <div key={index} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 shadow-sm">
                                                <span className="text-xs font-medium flex-1 pr-2 leading-tight">{item.product.title}</span>
                                                {mlLink ? (
                                                    <a 
                                                        href={mlLink} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors shrink-0"
                                                    >
                                                        Ver en ML <ExternalLink size={10} />
                                                    </a>
                                                ) : (
                                                    <span className="text-[10px] text-gray-400 italic px-2">Sin Link</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in">
                                <div>
                                    <Label htmlFor="name" className="text-xs uppercase text-gray-500 font-bold">2. Tus Datos</Label>
                                    <Input id="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tu nombre completo" className="mt-1 bg-white"/>
                                </div>

                                <Button 
                                    className={`w-full h-12 text-lg font-bold shadow-md ${isMP ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`} 
                                    onClick={handleCheckout}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <> <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Procesando... </>
                                    ) : isMP ? (
                                        <> Pagar ahora <CreditCard className="ml-2 h-5 w-5" /> </>
                                    ) : (
                                        <> Enviar Pedido <Send className="ml-2 h-5 w-5" /> </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
