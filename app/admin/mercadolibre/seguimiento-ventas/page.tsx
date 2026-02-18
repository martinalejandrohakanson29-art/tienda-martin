"use client"

import { useState, useMemo } from "react"
import { VentasHeader } from "./ventas-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
    BarChart3, 
    AlertCircle, 
    TrendingUp, 
    TrendingDown, 
    Minus,
    DollarSign,
    ShoppingCart,
    Sparkles,
    Search,
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
    Users // Icono para las visitas
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
    const [analysis, setAnalysis] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState("")
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({
        key: 'netoActual',
        direction: 'desc'
    })

    const handleCompare = async (r1: any, r2: any) => {
        setLoading(true);
        setError(null);
        setAnalysis(null);
        
        try {
            // URL actualizada al nuevo webhook de visitas
            const N8N_WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/seguimiento-visitas";

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ r1, r2 }),
            });

            if (!response.ok) throw new Error("Error en el servidor");

            const data = await response.json();
            const result = Array.isArray(data) ? data[0] : data;
            
            if (result.datosTabla) {
                setRanges(result.datosTabla);
            } else if (result.r1 && result.r2) {
                setRanges({ r1: result.r1, r2: result.r2 });
            }

            setAnalysis(result.analisisIA || result.output || null);
            
        } catch (err) {
            console.error("Error:", err);
            setError("Error de conexión. Revisa la consola para más detalles.");
        } finally {
            setLoading(false);
        }
    }

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const comparisonData = useMemo(() => {
        if (!ranges) return []
        const listActual = ranges.r2 || []
        const listAnterior = ranges.r1 || []

        const allMlas = new Set([
            ...listActual.map((p: any) => p.MLA), 
            ...listAnterior.map((p: any) => p.MLA)
        ])

        let combined = Array.from(allMlas).map(mla => {
            const pActual = listActual.find((p: any) => p.MLA === mla)
            const pAnterior = listAnterior.find((p: any) => p.MLA === mla)

            return {
                mla,
                nombre: pActual?.Nombre || pAnterior?.Nombre || "Producto desconocido",
                ventasActual: pActual?.Cantidad_Ventas || 0,
                ventasAnterior: pAnterior?.Cantidad_Ventas || 0,
                diffVentas: (pActual?.Cantidad_Ventas || 0) - (pAnterior?.Cantidad_Ventas || 0),
                // --- PROCESAMIENTO DE VISITAS ---
                visitasActual: pActual?.Visitas || 0,
                visitasAnterior: pAnterior?.Visitas || 0,
                diffVisitas: (pActual?.Visitas || 0) - (pAnterior?.Visitas || 0),
                growthVisitas: calculateGrowth(pActual?.Visitas || 0, pAnterior?.Visitas || 0),
                // --------------------------------
                netoActual: pActual?.Total_Neto || 0,
                netoAnterior: pAnterior?.Total_Neto || 0,
                growthNeto: calculateGrowth(pActual?.Total_Neto || 0, pAnterior?.Total_Neto || 0)
            }
        })

        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            combined = combined.filter(item => 
                item.nombre.toLowerCase().includes(query) || 
                item.mla.toLowerCase().includes(query)
            )
        }

        combined.sort((a: any, b: any) => {
            const aValue = a[sortConfig.key]
            const bValue = b[sortConfig.key]
            if (typeof aValue === 'string') {
                return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
            }
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
            return 0
        })

        return combined
    }, [ranges, searchQuery, sortConfig])

    const totals = useMemo(() => {
        return comparisonData.reduce((acc, curr) => ({
            netoActual: acc.netoActual + curr.netoActual,
            netoAnterior: acc.netoAnterior + curr.netoAnterior,
            ventasActual: acc.ventasActual + curr.ventasActual,
            ventasAnterior: acc.ventasAnterior + curr.ventasAnterior,
            // Sumatoria de visitas totales para las tarjetas
            visitasActual: acc.visitasActual + curr.visitasActual,
            visitasAnterior: acc.visitasAnterior + curr.visitasAnterior
        }), { netoActual: 0, netoAnterior: 0, ventasActual: 0, ventasAnterior: 0, visitasActual: 0, visitasAnterior: 0 })
    }, [comparisonData])

    const SortIcon = ({ colKey }: { colKey: string }) => {
        if (sortConfig.key !== colKey) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />
        return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-4 w-4 text-indigo-600" /> : <ChevronDown className="ml-2 h-4 w-4 text-indigo-600" />
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
                        <p className="text-lg font-medium">Seleccioná los periodos para iniciar el análisis</p>
                    </div>
                ) : (
                    <>
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

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Total Facturación (Neto P2)</CardTitle>
                                    <DollarSign className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{formatCurrency(totals.netoActual)}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.netoActual >= totals.netoAnterior ? "default" : "destructive"}>
                                            {calculateGrowth(totals.netoActual, totals.netoAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500">vs anterior</span>
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
                                            {calculateGrowth(totals.ventasActual, totals.ventasAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500">vs anterior</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* --- TARJETA DE RESUMEN DE VISITAS --- */}
                            <Card className="border-indigo-100">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Visitas Totales (P2)</CardTitle>
                                    <Users className="h-4 w-4 text-indigo-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-indigo-900">{totals.visitasActual.toLocaleString()}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={totals.visitasActual >= totals.visitasAnterior ? "default" : "destructive"}>
                                            {calculateGrowth(totals.visitasActual, totals.visitasAnterior).toFixed(1)}%
                                        </Badge>
                                        <span className="text-xs text-slate-500">vs anterior ({totals.visitasAnterior.toLocaleString()})</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                            <Input 
                                placeholder="Buscar por producto o MLA..." 
                                className="pl-10 bg-white border-slate-200 focus-visible:ring-indigo-500"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg font-bold">Desglose por Producto</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                            <TableHead className="cursor-pointer hover:text-indigo-600" onClick={() => requestSort('nombre')}>
                                                <div className="flex items-center">Producto <SortIcon colKey="nombre" /></div>
                                            </TableHead>
                                            
                                            {/* --- CABECERAS DE VISITAS --- */}
                                            <TableHead className="text-right cursor-pointer hover:text-indigo-600" onClick={() => requestSort('visitasActual')}>
                                                <div className="flex items-center justify-end">Visitas P2 <SortIcon colKey="visitasActual" /></div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:text-indigo-600" onClick={() => requestSort('diffVisitas')}>
                                                <div className="flex items-center justify-end">Dif. Visitas <SortIcon colKey="diffVisitas" /></div>
                                            </TableHead>

                                            <TableHead className="text-right cursor-pointer hover:text-indigo-600" onClick={() => requestSort('ventasActual')}>
                                                <div className="flex items-center justify-end">Ventas P2 <SortIcon colKey="ventasActual" /></div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:text-indigo-600" onClick={() => requestSort('diffVentas')}>
                                                <div className="flex items-center justify-end">Dif. Unid. <SortIcon colKey="diffVentas" /></div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:text-indigo-600" onClick={() => requestSort('netoActual')}>
                                                <div className="flex items-center justify-end">Neto P2 <SortIcon colKey="netoActual" /></div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:text-indigo-600" onClick={() => requestSort('growthNeto')}>
                                                <div className="flex items-center justify-end">Crecimiento <SortIcon colKey="growthNeto" /></div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {comparisonData.length > 0 ? (
                                            comparisonData.map((item) => (
                                                <TableRow key={item.mla} className="hover:bg-slate-50/50 transition-colors">
                                                    <TableCell className="max-w-[250px]">
                                                        <div className="font-semibold text-slate-800 truncate">{item.nombre}</div>
                                                        <div className="text-xs text-slate-400 font-mono">{item.mla}</div>
                                                    </TableCell>
                                                    
                                                    {/* --- CELDAS DE DATOS DE VISITAS --- */}
                                                    <TableCell className="text-right font-bold text-indigo-600">{item.visitasActual.toLocaleString()}</TableCell>
                                                    <TableCell className={`text-right font-bold ${item.diffVisitas > 0 ? "text-green-600" : item.diffVisitas < 0 ? "text-red-600" : "text-slate-400"}`}>
                                                        {item.diffVisitas > 0 ? `+${item.diffVisitas}` : item.diffVisitas}
                                                    </TableCell>

                                                    <TableCell className="text-right font-bold text-slate-700">{item.ventasActual}</TableCell>
                                                    <TableCell className={`text-right font-bold ${item.diffVentas > 0 ? "text-green-600" : item.diffVentas < 0 ? "text-red-600" : "text-slate-400"}`}>
                                                        {item.diffVentas > 0 ? `+${item.diffVentas}` : item.diffVentas}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-slate-900">{formatCurrency(item.netoActual)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className={`flex items-center justify-end gap-1 font-extrabold ${item.growthNeto > 0 ? "text-green-600" : item.growthNeto < 0 ? "text-red-600" : "text-slate-400"}`}>
                                                            {item.growthNeto > 0 ? <TrendingUp className="h-3 w-3" /> : item.growthNeto < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                                            {Math.abs(item.growthNeto).toFixed(1)}%
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-24 text-center text-slate-400">
                                                    No se encontraron productos que coincidan con la búsqueda.
                                                </TableCell>
                                            </TableRow>
                                        )}
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
