"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ShoppingCart, CreditCard, Loader2, Send, ExternalLink, Trash2, Package } from "lucide-react"
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
                setAvailablePaymentMethods(config.paymentMethods.split(",").map((m: string) => m.trim()))
            }
        })
    }, [])

    if (!mounted) return null

    const getFinalPrice = (price: any, discount: number | null) => {
        return Number(price) * (1 - (discount || 0) / 100)
    }

    const total = cart.reduce((sum, item) => {
        return sum + getFinalPrice(item.product.price, item.product.discount) * item.quantity
    }, 0)

    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0)

    const isMercadoPagoOption = (method: string) => {
        const n = method.toLowerCase()
        return n.includes("link") || n.includes("mercado pago") || n.includes("mercadopago")
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

        if (typeof window !== "undefined" && (window as any).fbq) {
            (window as any).fbq('track', 'InitiateCheckout', {
                content_name: 'Carrito de Compras',
                content_ids: cart.map(item => item.product.id),
                content_type: 'product',
                currency: 'ARS',
                value: total,
                num_items: totalItems,
            })
        }

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
            } catch {
                alert("Error de conexión.")
            } finally {
                setLoading(false)
            }
            return
        }

        const message = `Hola! Quiero confirmar el siguiente pedido:%0A%0A${cart.map(item => {
            const unitPrice = getFinalPrice(item.product.price, item.product.discount)
            return `- ${item.product.title} x${item.quantity}: ${formatPrice(unitPrice * item.quantity)}`
        }).join("%0A")}%0A%0ATotal: ${formatPrice(total)}%0A%0AMis datos:%0A- Nombre: ${customerName}%0A- Forma de pago: ${paymentMethod}`

        window.open(`https://wa.me/${whatsappNumber}?text=${message}`, "_blank")
        setLoading(false)
    }

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    className="relative h-11 w-11 rounded-full border border-white/20 hover:border-red-600/60 hover:bg-red-600/10 transition-all"
                >
                    <ShoppingCart size={22} className="text-white" />
                    {cart.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black border border-[#0D0D0D] shadow">
                            {totalItems}
                        </span>
                    )}
                </Button>
            </SheetTrigger>

            <SheetContent className="bg-[#111] border-white/10 text-white h-full overflow-y-auto w-full sm:max-w-md flex flex-col p-0">

                {/* HEADER */}
                <SheetHeader className="px-5 pt-6 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-7 bg-red-600 rounded-full flex-shrink-0" />
                        <SheetTitle className="text-xl font-black uppercase tracking-tight text-white">
                            Tu Carrito
                        </SheetTitle>
                        {cart.length > 0 && (
                            <span className="ml-auto text-xs font-bold text-red-400 bg-red-950 border border-red-900/60 px-2.5 py-0.5 rounded-full">
                                {totalItems} {totalItems === 1 ? 'item' : 'items'}
                            </span>
                        )}
                    </div>
                </SheetHeader>

                {/* LISTADO */}
                <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                <Package size={28} className="text-gray-600" />
                            </div>
                            <div className="text-center">
                                <p className="text-gray-400 font-semibold">Tu carrito está vacío</p>
                                <p className="text-gray-600 text-sm mt-1">Agregá productos para comenzar</p>
                            </div>
                        </div>
                    ) : (
                        cart.map((item) => {
                            const finalUnitPrice = getFinalPrice(item.product.price, item.product.discount)
                            const itemSubtotal = finalUnitPrice * item.quantity
                            const hasDiscount = (item.product.discount || 0) > 0
                            return (
                                <div key={item.product.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
                                    {/* Imagen */}
                                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-white relative">
                                        {hasDiscount && (
                                            <span className="absolute top-0 left-0 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 leading-none z-10">
                                                -{item.product.discount}%
                                            </span>
                                        )}
                                        <img
                                            src={item.product.imageUrl}
                                            alt={item.product.title}
                                            className="h-full w-full object-contain p-1"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>

                                    {/* Info */}
                                    <div className="flex flex-1 flex-col min-w-0">
                                        <p className="text-[10px] text-red-400 uppercase font-bold tracking-wider leading-none mb-1">
                                            {item.product.category}
                                        </p>
                                        <h3 className="text-sm font-semibold text-gray-100 leading-tight line-clamp-2 pr-1">
                                            {item.product.title}
                                        </h3>
                                        <div className="flex items-center justify-between mt-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">x{item.quantity}</span>
                                                <span className={`text-sm font-extrabold ${hasDiscount ? 'text-red-400' : 'text-white'}`}>
                                                    {formatPrice(itemSubtotal)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.product.id)}
                                                className="text-gray-600 hover:text-red-500 active:text-red-600 transition-colors p-2.5 rounded-md hover:bg-red-500/10 min-w-[40px] min-h-[40px] flex items-center justify-center"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* ZONA DE PAGO */}
                {cart.length > 0 && (
                    <div className="border-t border-white/10 bg-[#0A0A0A] px-5 pb-6 pt-5 space-y-4 mt-auto">

                        {/* Total */}
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-400 uppercase tracking-wide">Total a Pagar</span>
                            <span className="text-2xl font-black text-red-400">{formatPrice(total)}</span>
                        </div>

                        {/* Método de pago */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase text-gray-500 font-black tracking-widest">
                                1. Elegí cómo pagar
                            </Label>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full h-10 rounded-md bg-[#1A1A1A] border border-white/15 text-white text-sm px-3 focus:outline-none focus:ring-2 focus:ring-red-600/50 focus:border-red-600/50 transition-all"
                            >
                                <option value="" disabled>Seleccioná una opción...</option>
                                {availablePaymentMethods.map(method => (
                                    <option key={method} value={method} className="bg-[#1A1A1A] text-white">
                                        {method}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Bloque ML */}
                        {isML ? (
                            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                                <div className="text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 p-3 rounded-lg text-sm font-semibold text-center">
                                    Links directos a nuestras publicaciones en ML
                                </div>
                                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-0.5">
                                    {cart.map((item, index) => {
                                        const mlLink = (item.product as any).mercadolibreUrl
                                        return (
                                            <div key={index} className="flex items-center justify-between bg-[#1A1A1A] p-2.5 rounded-lg border border-white/10">
                                                <span className="text-xs font-medium text-gray-300 flex-1 pr-2 leading-tight line-clamp-2">
                                                    {item.product.title}
                                                </span>
                                                {mlLink ? (
                                                    <a
                                                        href={mlLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black px-3 py-1.5 rounded flex items-center gap-1 transition-colors shrink-0"
                                                    >
                                                        Ver en ML <ExternalLink size={10} />
                                                    </a>
                                                ) : (
                                                    <span className="text-[10px] text-gray-600 italic px-2">Sin Link</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in">
                                {/* Nombre */}
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase text-gray-500 font-black tracking-widest">
                                        2. Tus datos
                                    </Label>
                                    <Input
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="Tu nombre completo"
                                        className="bg-[#1A1A1A] border-white/15 text-white placeholder:text-gray-600 focus-visible:ring-red-600/50 focus-visible:border-red-600/50 h-10"
                                    />
                                </div>

                                {/* Botón checkout */}
                                <Button
                                    className={`w-full h-12 text-base font-black uppercase tracking-wide shadow-lg transition-all hover:scale-[1.01] ${
                                        isMP
                                            ? 'bg-[#009EE3] hover:bg-[#0088CC] text-white shadow-blue-900/30'
                                            : 'bg-[#25D366] hover:bg-[#1FB855] text-white shadow-green-900/30'
                                    }`}
                                    onClick={handleCheckout}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Procesando...</>
                                    ) : isMP ? (
                                        <><CreditCard className="mr-2 h-5 w-5" /> Pagar ahora</>
                                    ) : (
                                        <><Send className="mr-2 h-5 w-5" /> Enviar Pedido</>
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
