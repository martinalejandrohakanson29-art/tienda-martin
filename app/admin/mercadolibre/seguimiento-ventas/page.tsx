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
    ShoppingCart,
    Sparkles, // Icono para la IA
    BrainCircuit // Otro icono opcional para el análisis
} from "lucide-react"

// --- FUNCIONES AUXILIARES ---
const calculateGrowth = (current: number, previous: number) => {
    if (!previous) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
}

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
    const [analysis, setAnalysis] = useState<string | null>(null) // Estado para la IA
    const [error, setError] = useState<string | null>(null)

   const handleCompare = async (r1: any, r2: any) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    
    try {
        const N8N_WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/seguimiento-ventas";

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ r1, r2 }),
        });

        if (!response.ok) throw new Error("Error en el servidor");

        const data = await response.json();
        
        // --- DEBUG: Agregamos esto para ver en la consola del navegador qué llega ---
        console.log("Datos recibidos de n8n:", data);

        const result = Array.isArray(data) ? data[0] : data;
        
        // Verificamos si la propiedad existe antes de setear
        if (result.datosTabla) {
            setRanges(result.datosTabla);
        } else if (result.r1 && result.r2) {
            // Plan B: Si n8n envió r1 y r2 directo en la raíz
            setRanges({ r1: result.r1, r2: result.r2 });
        } else {
            console.warn("No se encontró la estructura de datos esperada en la respuesta");
        }

        setAnalysis(result.analisisIA || result.output || null);
        
    } catch (err) {
        console.error("Error:", err);
        setError("Error de conexión. Revisa la consola para más detalles.");
    } finally {
        setLoading(false);
    }
}

    // LÓGICA DE UNIFICACIÓN PARA LA TABLA
    const comparisonData = useMemo(() => {
        if (!ranges) return []
        const listActual = ranges.r2 || []
        const listAnterior = ranges.r1 || []

        const allMlas = new Set([
            ...listActual.map((p: any) => p.MLA), 
            ...listAnterior.map((p: any) => p.MLA)
        ])

        const combined = Array.from(allMlas).map(mla => {
            const pActual = listActual.find((p: any) => p.MLA === mla)
            const pAnterior = listAnterior.find((p: any) => p.MLA === mla)

            return {
                mla,
                nombre: pActual?.Nombre || pAnterior?.Nombre || "Producto desconocido",
                ventasActual: pActual?.Cantidad_Ventas || 0,
                ventasAnterior: pAnterior?.Cantidad_Ventas || 0,
                diffVentas: (pActual?.Cantidad_Ventas || 0) - (pAnterior?.Cantidad_Ventas || 0),
                netoActual: pActual?.Total_Neto || 0,
                netoAnterior: pAnterior?.Total_Neto || 0,
                growthNeto: calculateGrowth(pActual?.Total_Neto || 0, pAnterior?.Total_Neto || 0)
            }
        })

        return combined.sort((a, b) => b.netoActual - a.netoActual)
    }, [ranges])

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
                        <p className="text-lg font-medium">Seleccioná los periodos para iniciar el análisis</p>
                    </div>
                ) : (
                    <>
                        {/* SECCIÓN DE IA: Aparece resaltada arriba de todo */}
                        {analysis && (
                            <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm">
                                <CardHeader className="flex flex-row items-center gap-3 pb-2 border-b border-indigo-100 bg-white/50">
                                    <div className="p-2 bg-indigo-600 rounded-lg">
                                        <Sparkles className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-bold text-indigo-900">Análisis Estratégico</CardTitle>
                                        <p className="text-xs text-indigo-500 font-medium uppercase tracking-wider">Generado por IA</p>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                        {analysis}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* TARJETAS DE TOTALES */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Total Facturación (Neto P2)</CardTitle>
                                    <DollarSign className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{formatCurrency(totals.netoActual)}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.netoActual >= totals.netoAnterior ? "default" : "destructive"}>
                                            {totals.netoActual >= totals.netoAnterior ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {calculateGrowth(totals.netoActual, totals.netoAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500">vs anterior ({formatCurrency(totals.netoAnterior)})</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Unidades Vendidas (P2)</CardTitle>
                                    <ShoppingCart className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{totals.ventasActual} u.</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.ventasActual >= totals.ventasAnterior ? "default" : "destructive"}>
                                            {totals.ventasActual >= totals.ventasAnterior ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {calculateGrowth(totals.ventasActual, totals.ventasAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500">vs anterior ({totals.ventasAnterior} u.)</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* TABLA DETALLADA */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Desglose por Producto</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="text-right">Ventas P2</TableHead>
                                            <TableHead className="text-right">Ventas P1</TableHead>
                                            <TableHead className="text-right">Dif. Unid.</TableHead>
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
                                                <TableCell className="text-right font-semibold">{item.ventasActual}</TableCell>
                                                <TableCell className="text-right text-slate-500">{item.ventasAnterior}</TableCell>
                                                <TableCell className={`text-right font-medium ${item.diffVentas > 0 ? "text-green-600" : item.diffVentas < 0 ? "text-red-600" : ""}`}>
                                                    {item.diffVentas > 0 ? `+${item.diffVentas}` : item.diffVentas}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">{formatCurrency(item.netoActual)}</TableCell>
                                                <TableCell className="text-right">
                                                    <div className={`flex items-center justify-end gap-1 font-bold ${item.growthNeto > 0 ? "text-green-600" : item.growthNeto < 0 ? "text-red-600" : "text-slate-400"}`}>
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
