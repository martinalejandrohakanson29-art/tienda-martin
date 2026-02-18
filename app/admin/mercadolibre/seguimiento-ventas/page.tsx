"use client"

import { useState, useMemo } from "react"
import { VentasHeader } from "./ventas-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { guardarSeguimientoVentas, obtenerSeguimientoVentas } from "@/app/actions/seguimiento"
import { 
    BarChart3, 
    AlertCircle, 
    DollarSign,
    ShoppingCart,
    Sparkles,
    Search, 
    ArrowUpDown,
    ChevronUp,
    ChevronDown
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
            // Mantenemos la URL del webhook pero eliminamos la lógica de múltiples fases
            const N8N_WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/seguimiento-visitas";

            // --- PASO 1: CONSULTAR VENTAS AL WEBHOOK ---
            const res = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ r1, r2 }), // Enviamos solo los rangos
            });

            if (!res.ok) throw new Error("Error obteniendo los datos de ventas");

            const data = await res.json();
            const result = Array.isArray(data) ? data[0] : data;
            
            // --- PASO 2: PROCESAR Y GUARDAR EN BASE DE DATOS ---
            const listActual = result.r2 || result.datosTabla?.r2 || [];
            const listAnterior = result.r1 || result.datosTabla?.r1 || [];
            const allMlas = new Set([...listActual.map((p: any) => p.MLA), ...listAnterior.map((p: any) => p.MLA)]);

            const dataParaGuardar = Array.from(allMlas).map((mla: any) => {
                const pActual = listActual.find((p: any) => p.MLA === mla);
                const pAnterior = listAnterior.find((p: any) => p.MLA === mla);
                const nActual = pActual?.Total_Neto || 0;
                const nAnterior = pAnterior?.Total_Neto || 0;

                return {
                    mla,
                    nombre: pActual?.Nombre || pAnterior?.Nombre || "Producto desconocido",
                    ventasActual: pActual?.Cantidad_Ventas || 0,
                    ventasAnterior: pAnterior?.Cantidad_Ventas || 0,
                    diffVentas: (pActual?.Cantidad_Ventas || 0) - (pAnterior?.Cantidad_Ventas || 0),
                    netoActual: nActual,
                    netoAnterior: nAnterior,
                    growthNeto: calculateGrowth(nActual, nAnterior)
                };
            });

            // Guardamos en la base de datos de Railway
            await guardarSeguimientoVentas(dataParaGuardar);

            // --- PASO 3: RECUPERAR DATOS ACTUALIZADOS Y ANALISIS ---
            const datosDB = await obtenerSeguimientoVentas();
            
            setRanges({ r2: datosDB, r1: [] });
            setAnalysis(result.analisisIA || result.output || null);
            
        } catch (err: any) {
            console.error("Error:", err);
            setError("Error en el análisis: " + err.message);
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

        let combined = ranges.r2.map((item: any) => ({
            ...item,
            netoActual: Number(item.netoActual),
            netoAnterior: Number(item.netoAnterior),
            growthNeto: Number(item.growthNeto)
        }));

        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            combined = combined.filter((item: any) => 
                item.nombre.toLowerCase().includes(query) || 
                item.mla.toLowerCase().includes(query)
            )
        }

        combined.sort((a: any, b: any) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];
            if (typeof aValue === 'string') return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
            return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
        })

        return combined;
    }, [ranges, searchQuery, sortConfig])

    const totals = useMemo(() => {
        let nAct = 0, nAnt = 0, vAct = 0, vAnt = 0;
        comparisonData.forEach((item: any) => {
            nAct += item.netoActual;
            nAnt += item.netoAnterior;
            vAct += item.ventasActual;
            vAnt += item.ventasAnterior;
        });
        return {
            netoActual: nAct,
            netoAnterior: nAnt,
            ventasActual: vAct,
            ventasAnterior: vAnt
        };
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
                        <p className="text-lg font-medium">Seleccioná los periodos para iniciar el análisis de ventas</p>
                    </div>
                ) : (
                    <>
                        {analysis && (
                            <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm">
                                <CardHeader className="flex flex-row items-center gap-3 pb-2 border-b border-indigo-100 bg-white/50">
                                    <div className="p-2 bg-indigo-600 rounded-lg"><Sparkles className="h-5 w-5 text-white" /></div>
                                    <div>
                                        <CardTitle className="text-lg font-bold text-indigo-900">Análisis Estratégico</CardTitle>
                                        <p className="text-xs text-indigo-500 font-medium uppercase tracking-wider">Análisis de Mercado Libre</p>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed font-medium">{analysis}</div>
                                </CardContent>
                            </Card>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Facturación (P2)</CardTitle>
                                    <DollarSign className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{formatCurrency(totals.netoActual)}</div>
                                    <Badge variant={totals.netoActual >= totals.netoAnterior ? "default" : "destructive"}>
                                        {calculateGrowth(totals.netoActual, totals.netoAnterior).toFixed(1)}%
                                    </Badge>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Unidades (P2)</CardTitle>
                                    <ShoppingCart className="h-4 w-4 text-slate-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{totals.ventasActual} u.</div>
                                    <Badge variant={totals.ventasActual >= totals.ventasAnterior ? "default" : "destructive"}>
                                        {calculateGrowth(totals.ventasActual, totals.ventasAnterior).toFixed(1)}%
                                    </Badge>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Buscar por producto o MLA..." 
                                className="pl-10" 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <Card>
                            <CardHeader><CardTitle className="text-lg font-bold">Desglose por Producto</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead onClick={() => requestSort('nombre')} className="cursor-pointer">Producto <SortIcon colKey="nombre" /></TableHead>
                                            <TableHead onClick={() => requestSort('ventasActual')} className="text-right cursor-pointer">Ventas P2 <SortIcon colKey="ventasActual" /></TableHead>
                                            <TableHead onClick={() => requestSort('netoActual')} className="text-right cursor-pointer">Neto P2 <SortIcon colKey="netoActual" /></TableHead>
                                            <TableHead onClick={() => requestSort('growthNeto')} className="text-right cursor-pointer">Crecimiento <SortIcon colKey="growthNeto" /></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {comparisonData.map((item: any) => (
                                            <TableRow key={item.mla} className="hover:bg-slate-50/50">
                                                <TableCell>
                                                    <div className="font-semibold">{item.nombre}</div>
                                                    <div className="text-xs text-slate-400">{item.mla}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold">{item.ventasActual}</TableCell>
                                                <TableCell className="text-right font-bold">{formatCurrency(item.netoActual)}</TableCell>
                                                <TableCell className={`text-right font-bold ${item.growthNeto > 0 ? "text-green-600" : "text-red-600"}`}>
                                                    {item.growthNeto.toFixed(1)}%
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
