"use client"

import { useState } from "react"
import { VentasHeader } from "./ventas-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Info, BarChart3, AlertCircle, Package } from "lucide-react"

export default function SeguimientoVentasPage() {
    const [loading, setLoading] = useState(false)
    const [ranges, setRanges] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleCompare = async (r1: any, r2: any) => {
        setLoading(true)
        setError(null)
        
        try {
            // Reemplaza con tu URL real de n8n
            const N8N_WEBHOOK_URL = "https://tu-n8n.railway.app/webhook/seguimiento-ventas"

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ r1, r2 }),
            })

            if (!response.ok) throw new Error("Error en el servidor")

            const data = await response.json()
            
            // CORRECCIÓN: Si n8n envía un array [{}], tomamos el primer elemento
            const finalData = Array.isArray(data) ? data[0] : data
            setRanges(finalData)
            
        } catch (err) {
            console.error("Error:", err)
            setError("No se pudo conectar con n8n. Verifica que el workflow esté activo.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50">
            <VentasHeader onCompare={handleCompare} isLoading={loading} />

            <main className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
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
                    </div>
                ) : (
                    <>
                        <Card className="border-indigo-100">
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-slate-500 uppercase">Resumen del Análisis</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3 text-indigo-700 bg-indigo-50 p-4 rounded-lg">
                                    <Info className="h-5 w-5" />
                                    <p className="text-sm">
                                        Análisis completado. Se compararon <strong>{ranges.r1?.length || 0}</strong> productos en P1 
                                        contra <strong>{ranges.r2?.length || 0}</strong> productos en P2.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Tabla Comparativa Simple */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg font-bold">Detalle por Producto (Periodo 1)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="text-right">Ventas</TableHead>
                                            <TableHead className="text-right">Total Bruto</TableHead>
                                            <TableHead className="text-right">Total Neto</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {ranges.r1?.map((prod: any) => (
                                            <TableRow key={prod.MLA}>
                                                <TableCell className="font-medium">
                                                    <div className="flex flex-col">
                                                        <span>{prod.Nombre}</span>
                                                        <span className="text-[10px] text-slate-400">{prod.MLA}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{prod.Cantidad_Ventas}</TableCell>
                                                <TableCell className="text-right">${prod.Total_Bruto?.toLocaleString()}</TableCell>
                                                <TableCell className="text-right text-green-600 font-medium">${prod.Total_Neto?.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>
        </div>
    )
}
