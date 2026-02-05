"use client"

import * as React from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "./date-range-picker"
import { toast } from "sonner" 
import { clearPendingOrders } from "@/app/actions/imports" // 👈 Importamos la nueva acción

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
        if (!dates.from || !dates.to) {
            toast.error("Por favor selecciona un rango de fechas")
            return
        }

        setIsSyncing(true)
        const syncToast = toast.loading("Iniciando limpieza de datos...")

        try {
            // 1. Limpiamos los pedidos pendientes actuales para no tener "fantasmas"
            const clearResult = await clearPendingOrders()
            if (!clearResult.success) {
                toast.error("Error al limpiar datos antiguos. Abortando.")
                setIsSyncing(false)
                return
            }

            toast.loading("Sincronizando con n8n...", { id: syncToast })

            // 2. Ejecutamos los 3 procesos de n8n en paralelo
           const [respVentas, respStock, respCarritos] = await Promise.all([
    fetch("https://n8n-on-render-production-52f0.up.railway.app/webhook/ventas-cover", { // 👈 Cambiado de ventas-ml a ventas-cover
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: dates.from, to: dates.to })
    }),
                fetch("https://n8n-on-render-production-52f0.up.railway.app/webhook/actualizar-stock-proveedor", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                }),
                fetch("https://n8n-on-render-production-52f0.up.railway.app/webhook/importar-carrito", {
                    method: "GET"
                })
            ])

            if (respVentas.ok && respStock.ok && respCarritos.ok) {
                toast.success("🚀 Sincronización completa. Datos actualizados.", {
                    id: syncToast
                })
                router.refresh() 
            } else {
                toast.warning("Atención: Algunos procesos de n8n devolvieron error.", {
                    id: syncToast
                })
            }
        } catch (error) {
            console.error("Error sincronizando:", error)
            toast.error("No se pudo conectar con el servidor de n8n.", {
                id: syncToast
            })
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
                    <p className="text-sm text-slate-500">Detalles de ventas, stock y tiempos hasta quebrar stock </p>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <DateRangePicker onRangeChange={handleRangeChange} />
                
                <Button 
                    onClick={handleSync} 
                    disabled={isSyncing}
                    variant="default" 
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95"
                >
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Actualizar datos'}
                </Button>
            </div>
        </div>
    )
}
