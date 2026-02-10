"use client"

import { useState, useMemo } from "react"
import { VentasHeader } from "./ventas-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
    BarChart3, 
    AlertCircle, 
    TrendingUp, 
    TrendingDown, 
    Minus,
    DollarSign,
    ShoppingCart
} from "lucide-react"

// Función auxiliar para calcular porcentaje de crecimiento
const calculateGrowth = (current: number, previous: number) => {
    if (!previous) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
}

// Función para formatear moneda
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
    }).format(value)
}

export default function SeguimientoVentasPage() {
    const [loading, setLoading] = useState(false)
    const [ranges, setRanges] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleCompare = async (r1: any, r2: any) => {
        setLoading(true)
        setError(null)
        
        try {
            const N8N_WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/seguimiento-ventas"

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ r1, r2 }),
            })

            if (!response.ok) throw new Error("Error en el servidor")

            const data = await response.json()
            const finalData = Array.isArray(data) ? data[0] : data
            setRanges(finalData)
            
        } catch (err) {
            console.error("Error:", err)
            setError("No se pudo conectar con n8n. Verifica que el workflow esté activo.")
        } finally {
            setLoading(false)
        }
    }

    const comparisonData = useMemo(() => {
        if (!ranges) return []

        const list1 = ranges.r1 || []
        const list2 = ranges.r2 || []

        const allMlas = new Set([
            ...list1.map((p: any) => p.MLA), 
            ...list2.map((p: any) => p.MLA)
        ])

        const combined = Array.from(allMlas).map(mla => {
            const p1 = list1.find((p: any) => p.MLA === mla)
            const p2 = list2.find((p: any) => p.MLA === mla)

            const nombre = p1?.Nombre || p2?.Nombre || "Producto desconocido"
            const ventasP1 = p1?.Cantidad_Ventas || 0
            const ventasP2 = p2?.Cantidad_Ventas || 0
            const netoP1 = p1?.Total_Neto || 0
            const netoP2 = p2?.Total_Neto || 0

            return {
                mla,
                nombre,
                ventasP1,
                ventasP2,
                diffVentas: ventasP1 - ventasP2,
                growthVentas: calculateGrowth(ventasP1, ventasP2),
                netoP1,
                netoP2,
                diffNeto: netoP1 - netoP2,
                growthNeto: calculateGrowth(netoP1, netoP2)
            }
        })

        return combined.sort((a, b) => b.netoP1 - a.netoP1)
    }, [ranges])

    const totals = useMemo(() => {
        return comparisonData.reduce((acc, curr) => ({
            netoP1: acc.netoP1 + curr.netoP1,
            netoP2: acc.netoP2 + curr.netoP2,
            ventasP1: acc.ventasP1 + curr.ventasP1,
            ventasP2: acc.ventasP2 + curr.ventasP2
        }), { netoP1: 0, netoP2: 0, ventasP1: 0, ventasP2: 0 })
    }, [comparisonData])

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
                        <p className="text-lg font-medium">Selecciona dos periodos para comparar el rendimiento</p>
                    </div>
                ) : (
                    <>
                        {/* TARJETAS DE RESUMEN */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Total Facturación (Neto)</CardTitle>
                                    <DollarSign className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{formatCurrency(totals.netoP1)}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.netoP1 >= totals.netoP2 ? "default" : "destructive"}>
                                            {totals.netoP1 >= totals.netoP2 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {calculateGrowth(totals.netoP1, totals.netoP2).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500 text-nowrap">vs periodo anterior ({formatCurrency(totals.netoP2)})</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Total Unidades Vendidas</CardTitle>
                                    <ShoppingCart className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{totals.ventasP1} u.</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.ventasP1 >= totals.ventasP2 ? "default" : "destructive"}>
                                            {totals.ventasP1 >= totals.ventasP2 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {calculateGrowth(totals.ventasP1, totals.ventasP2).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500 text-nowrap">vs periodo anterior ({totals.ventasP2} u.)</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* TABLA DE DETALLE */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Detalle por Producto</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="text-right">Ventas P1</TableHead>
                                            <TableHead className="text-right">Ventas P2</TableHead>
                                            <TableHead className="text-right">Dif. Ventas</TableHead>
                                            <TableHead className="text-right">Neto P1</TableHead>
                                            <TableHead className="text-right">Neto P2</TableHead>
                                            <TableHead className="text-right">Crecimiento</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {comparisonData.map((item) => (
                                            <TableRow key={item.mla}>
                                                <TableCell className="max-w-[300px]">
                                                    <div className="font-medium truncate">{item.nombre}</div>
                                                    <div className="text-xs text-slate-400 font-mono">{item.mla}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">{item.ventasP1}</TableCell>
                                                <TableCell className="text-right text-slate-500">{item.ventasP2}</TableCell>
                                                <TableCell className={`text-right ${item.diffVentas > 0 ? "text-green-600" : item.diffVentas < 0 ? "text-red-600" : ""}`}>
                                                    {item.diffVentas > 0 ? `+${item.diffVentas}` : item.diffVentas}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">{formatCurrency(item.netoP1)}</TableCell>
                                                <TableCell className="text-right text-slate-500">{formatCurrency(item.netoP2)}</TableCell>
                                                <TableCell className="text-right">
                                                    <div className={`flex items-center justify-end gap-1 font-medium ${item.growthNeto > 0 ? "text-green-600" : item.growthNeto < 0 ? "text-red-600" : "text-slate-400"}`}>
                                                        {item.growthNeto > 0 ? <TrendingUp className="h-3 w-3" /> : item.growthNeto < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                                        {Math.abs(item.growthNeto).toFixed(1)}%
                                                    </div>
                                                </TableCell>
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
