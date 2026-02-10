"use client"

import { useState } from "react"
import { VentasHeader } from "./ventas-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Info, BarChart3, AlertCircle } from "lucide-react"

export default function SeguimientoVentasPage() {
    const [loading, setLoading] = useState(false)
    const [ranges, setRanges] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleCompare = async (r1: any, r2: any) => {
        setLoading(true)
        setError(null)
        
        try {
            // Reemplaza esta URL con la de tu webhook de n8n (Production o Test)
            const N8N_WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/seguimiento-ventas"

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ r1, r2 }),
            })

            if (!response.ok) {
                throw new Error("Error en la respuesta del servidor")
            }

            const data = await response.json()
            
            // Guardamos los datos reales (r1 y r2 procesados por n8n)
            setRanges(data)
            
        } catch (err) {
            console.error("Error al comparar ventas:", err)
            setError("No se pudo conectar con el servicio de análisis.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50">
            <VentasHeader onCompare={handleCompare} isLoading={loading} />

            <main className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
                {/* Mensaje de Error */}
                {error && (
                    <div className="flex items-center gap-3 text-red-700 bg-red-50 p-4 rounded-lg border border-red-100">
                        <AlertCircle className="h-5 w-5" />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}

                {!ranges ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <BarChart3 className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-medium">Selecciona los rangos de fechas para comenzar el análisis</p>
                        <p className="text-sm italic">Ejemplo: 1-10 Ene vs 1-10 Feb</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="border-indigo-100">
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-slate-500 uppercase">Estado del Análisis</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3 text-indigo-700 bg-indigo-50 p-4 rounded-lg">
                                    <Info className="h-5 w-5" />
                                    <div className="text-sm">
                                        <p>Análisis completado con éxito.</p>
                                        <p className="opacity-80">
                                            Se procesaron {ranges.r1?.length || 0} productos en P1 y {ranges.r2?.length || 0} en P2.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Aquí es donde agregaremos la tabla comparativa más adelante */}
                    </div>
                )}
            </main>
        </div>
    )
}
