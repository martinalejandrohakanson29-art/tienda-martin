"use client"

import * as React from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "./date-range-picker"
import { toast } from "sonner" // Asumo que usas sonner o similar para avisos

export function ImportsHeader() {
    const [dates, setDates] = React.useState({ from: "", to: "" })
    const [isSyncing, setIsSyncing] = React.useState(false)

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            // Llamamos al webhook de n8n (Asegúrate de poner tu URL real aquí)
            const response = await fetch("https://n8n-on-render-production-52f0.up.railway.app/webhook/ventas-ml", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    from: dates.from,
                    to: dates.to
                })
            })

            if (response.ok) {
                alert(`🚀 Sincronización iniciada para el periodo: ${dates.from} al ${dates.to}`)
            }
        } catch (error) {
            console.error("Error sincronizando:", error)
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
                <DateRangePicker onRangeChange={(from, to) => setDates({ from, to })} />
                
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
