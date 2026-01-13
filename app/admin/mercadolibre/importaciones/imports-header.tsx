"use client"

import * as React from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation" // Importamos herramientas de navegación
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "./date-range-picker"
import { toast } from "sonner" 

export function ImportsHeader() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Leemos las fechas iniciales de la URL o usamos vacío si no existen
    const [dates, setDates] = React.useState({ 
        from: searchParams.get("from") || "", 
        to: searchParams.get("to") || "" 
    })
    
    const [isSyncing, setIsSyncing] = React.useState(false)

    // Esta función actualiza la URL cuando cambias el calendario
    const handleRangeChange = (from: string, to: string) => {
        setDates({ from, to })
        
        const params = new URLSearchParams(searchParams)
        if (from) params.set("from", from)
        if (to) params.set("to", to)
        
        // Actualizamos la URL sin recargar la página completa
        router.push(`${pathname}?${params.toString()}`)
    }

    const handleSync = async () => {
        if (!dates.from || !dates.to) {
            alert("Por favor selecciona un rango de fechas para calcular las ventas")
            return
        }

        setIsSyncing(true)
        try {
            const [respVentas, respStock] = await Promise.all([
                fetch("https://n8n-on-render-production-52f0.up.railway.app/webhook/ventas-ml", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from: dates.from, to: dates.to })
                }),
                fetch("https://n8n-on-render-production-52f0.up.railway.app/webhook/actualizar-stock-proveedor", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                })
            ])

            if (respVentas.ok && respStock.ok) {
                alert(`🚀 Sincronización completa: Ventas y Stock actualizados correctamente.`)
                router.refresh() 
            } else {
                alert("Atención: Uno de los procesos de n8n devolvió un error.")
            }
        } catch (error) {
            console.error("Error sincronizando:", error)
            alert("No se pudo conectar con el servidor de n8n.")
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
                    <p className="text-sm text-slate-500">Vista maestra de proveedores y abastecimiento</p>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                {/* Usamos nuestra nueva función para capturar el cambio */}
                <DateRangePicker onRangeChange={handleRangeChange} />
                
                <Button 
                    onClick={handleSync} 
                    disabled={isSyncing}
                    variant="default" 
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95"
                >
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                </Button>
            </div>
        </div>
    )
}
