"use client"

import * as React from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "./date-range-picker"
import { toast } from "sonner" 
import { clearPendingOrders } from "@/app/actions/imports"

export function ImportsHeader() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [dates, setDates] = React.useState({ 
        from: searchParams.get("from") || "", 
        to: searchParams.get("to") || "" 
    })
    
    const [isSyncing, setIsSyncing] = React.useState(false)

    const handleRangeChange = (from: string, to: string) => {
        setDates({ from, to })
        const params = new URLSearchParams(searchParams)
        if (from) params.set("from", from)
        if (to) params.set("to", to)
        router.push(`${pathname}?${params.toString()}`)
    }

    const handleSync = async () => {
        setIsSyncing(true)
        const syncToast = toast.loading("Iniciando limpieza de datos...")

        try {
            await clearPendingOrders()
            toast.loading("Actualizando stock y órdenes de compra...", { id: syncToast })

            const [respStock, respCarritos] = await Promise.all([
                fetch("https://n8n.revolucionmotos.tech/webhook/actualizar-stock-proveedor", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                }),
                fetch("https://n8n.revolucionmotos.tech/webhook/importar-carrito", {
                    method: "GET"
                })
            ])

            if (respStock.ok && respCarritos.ok) {
                toast.success("Stock y órdenes actualizados con éxito.", { id: syncToast })
                router.refresh()
            } else {
                toast.warning("Atención: Algunos procesos devolvieron error.", { id: syncToast })
            }
        } catch (error) {
            console.error("Error sincronizando:", error)
            toast.error("Error de conexión con n8n.", { id: syncToast })
        } finally {
            setIsSyncing(false)
        }
    }

    return (
        <div className="bg-white border-b px-8 py-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
                <Link href="/admin/mercadolibre">
                    <Button variant="outline" size="sm" className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tablero de Importaciones</h1>
                    <p className="text-sm text-slate-500">Ventas desde mostrador · Stock desde Cover</p>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <DateRangePicker onRangeChange={handleRangeChange} />
                <Button onClick={handleSync} disabled={isSyncing} variant="default" className="gap-2 bg-blue-600">
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Actualizar Stock'}
                </Button>
            </div>
        </div>
    )
}
