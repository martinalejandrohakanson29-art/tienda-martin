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

    // LÓGICA DE UNIFICACIÓN: R2 es Actual, R1 es Anterior
    const comparisonData = useMemo(() => {
        if (!ranges) return []

        const listActual = ranges.r2 || [] // Periodo Actual (R2)
        const listAnterior = ranges.r1 || [] // Periodo Anterior (R1)

        const allMlas = new Set([
            ...listActual.map((p: any) => p.MLA), 
            ...listAnterior.map((p: any) => p.MLA)
        ])

        const combined = Array.from(allMlas).map(mla => {
            const pActual = listActual.find((p: any) => p.MLA === mla)
            const pAnterior = listAnterior.find((p: any) => p.MLA === mla)

            const nombre = pActual?.Nombre || pAnterior?.Nombre || "Producto desconocido"
            const ventasActual = pActual?.Cantidad_Ventas || 0
            const ventasAnterior = pAnterior?.Cantidad_Ventas || 0
            const netoActual = pActual?.Total_Neto || 0
            const netoAnterior = pAnterior?.Total_Neto || 0

            return {
                mla,
                nombre,
                ventasActual,
                ventasAnterior,
                diffVentas: ventasActual - ventasAnterior,
                growthVentas: calculateGrowth(ventasActual, ventasAnterior),
                netoActual,
                netoAnterior,
                diffNeto: netoActual - netoAnterior,
                growthNeto: calculateGrowth(netoActual, netoAnterior)
            }
        })

        // Ordenar por mayor venta en el periodo actual (R2)
        return combined.sort((a, b) => b.netoActual - a.netoActual)
    }, [ranges])

    // Totales calculados con R2 como base principal
    const totals = useMemo(() => {
        return comparisonData.reduce((acc, curr) => ({
            netoActual: acc.netoActual + curr.netoActual,
            netoAnterior: acc.netoAnterior + curr.netoAnterior,
            ventasActual: acc.ventasActual + curr.ventasActual,
            ventasAnterior: acc.ventasAnterior + curr.ventasAnterior
        }), { netoActual: 0, netoAnterior: 0, ventasActual: 0, ventasAnterior: 0 })
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Total Facturación (Neto R2)</CardTitle>
                                    <DollarSign className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{formatCurrency(totals.netoActual)}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.netoActual >= totals.netoAnterior ? "default" : "destructive"}>
                                            {totals.netoActual >= totals.netoAnterior ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {calculateGrowth(totals.netoActual, totals.netoAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500 text-nowrap">vs periodo R1 ({formatCurrency(totals.netoAnterior)})</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Unidades Vendidas (Total R2)</CardTitle>
                                    <ShoppingCart className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{totals.ventasActual} u.</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.ventasActual >= totals.ventasAnterior ? "default" : "destructive"}>
                                            {totals.ventasActual >= totals.ventasAnterior ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {calculateGrowth(totals.ventasActual, totals.ventasAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500 text-nowrap">vs periodo R1 ({totals.ventasAnterior} u.)</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Detalle por Producto (Comparativa R2 vs R1)</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="text-right">Ventas R2</TableHead>
                                            <TableHead className="text-right">Ventas R1</TableHead>
                                            <TableHead className="text-right">Dif. Unid.</TableHead>
                                            <TableHead className="text-right">Neto R2</TableHead>
                                            <TableHead className="text-right">Neto R1</TableHead>
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
                                                <TableCell className="text-right font-semibold">{item.ventasActual}</TableCell>
                                                <TableCell className="text-right text-slate-500">{item.ventasAnterior}</TableCell>
                                                <TableCell className={`text-right ${item.diffVentas > 0 ? "text-green-600" : item.diffVentas < 0 ? "text-red-600" : ""}`}>
                                                    {item.diffVentas > 0 ? `+${item.diffVentas}` : item.diffVentas}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">{formatCurrency(item.netoActual)}</TableCell>
                                                <TableCell className="text-right text-slate-500">{formatCurrency(item.netoAnterior)}</TableCell>
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
