"use client"

import { useState } from "react"
import { VentasHeader } from "./ventas-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Info, BarChart3 } from "lucide-react" // <--- Agregamos BarChart3 aquí

export default function SeguimientoVentasPage() {
    const [loading, setLoading] = useState(false)
    const [ranges, setRanges] = useState<any>(null)

    const handleCompare = (r1: any, r2: any) => {
        setLoading(true)
        console.log("Comparando Periodo 1:", r1, "con Periodo 2:", r2)
        setRanges({ r1, r2 })
        
        // Simulación de carga
        setTimeout(() => setLoading(false), 800)
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50">
            <VentasHeader onCompare={handleCompare} isLoading={loading} />

            <main className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
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
                                    <p className="text-sm">
                                        Listo para procesar comparación entre 
                                        <strong> {ranges.r1.from}</strong> y 
                                        <strong> {ranges.r2.from}</strong>.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    )
}
