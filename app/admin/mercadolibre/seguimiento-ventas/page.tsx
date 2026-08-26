"use client"

import { useState, useMemo, useEffect } from "react"
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
    Search,
    ChevronUp,
    ChevronDown,
    ArrowUpDown
} from "lucide-react"
import { compararVentasMLPorRango, obtenerSeguimientoVentas } from "@/app/actions/seguimiento"

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
    const [items, setItems] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    
    // Estados para búsqueda y ordenamiento
    const [searchTerm, setSearchTerm] = useState("")
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({
        key: 'netoActual',
        direction: 'desc'
    })

    // 1. Carga inicial desde la Base de Datos
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true)
            const savedData = await obtenerSeguimientoVentas()
            if (savedData && savedData.length > 0) {
                setItems(savedData)
            }
            setLoading(false)
        }
        loadInitialData()
    }, [])

    const handleCompare = async (r1: { from: string, to: string }, r2: { from: string, to: string }) => {
        setLoading(true);
        setError(null);

        try {
            const result = await compararVentasMLPorRango(r1, r2);
            if (!result.success) throw new Error(result.error || "Error al comparar los períodos");

            setItems(result.items || []);
        } catch (err) {
            console.error("Error:", err);
            setError("Error al procesar la consulta. Intenta nuevamente.");
        } finally {
            setLoading(false);
        }
    }

    // Lógica de Búsqueda y Ordenamiento
    const filteredAndSortedData = useMemo(() => {
        let result = [...items]

        // Filtro de búsqueda
        if (searchTerm) {
            result = result.filter(item => 
                item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.mla.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        // Ordenamiento
        if (sortConfig.key && sortConfig.direction) {
            result.sort((a, b) => {
                const aValue = a[sortConfig.key]
                const bValue = b[sortConfig.key]

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
                return 0
            })
        }

        return result
    }, [items, searchTerm, sortConfig])

    const totals = useMemo(() => {
        return items.reduce((acc, curr) => ({
            netoActual: acc.netoActual + curr.netoActual,
            netoAnterior: acc.netoAnterior + curr.netoAnterior,
            ventasActual: acc.ventasActual + curr.ventasActual,
            ventasAnterior: acc.ventasAnterior + curr.ventasAnterior
        }), { netoActual: 0, netoAnterior: 0, ventasActual: 0, ventasAnterior: 0 })
    }, [items])

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />
        return sortConfig.direction === 'asc' ? 
            <ChevronUp className="ml-2 h-4 w-4 text-indigo-600" /> : 
            <ChevronDown className="ml-2 h-4 w-4 text-indigo-600" />
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

                {items.length === 0 && !loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <BarChart3 className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No hay datos guardados. Seleccioná periodos para comparar.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-500">Total Facturación (P2)</CardTitle>
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

                        <Card>
                            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <CardTitle className="text-lg">Desglose por Producto</CardTitle>
                                <div className="relative w-full md:w-72">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder="Buscar por título o MLA..."
                                        className="pl-9 bg-white"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50/50">
                                            <TableHead 
                                                className="cursor-pointer hover:text-indigo-600 transition-colors"
                                                onClick={() => requestSort('nombre')}
                                            >
                                                <div className="flex items-center">Producto <SortIcon column="nombre" /></div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:text-indigo-600 transition-colors"
                                                onClick={() => requestSort('ventasActual')}
                                            >
                                                <div className="flex items-center justify-end">Ventas P2 <SortIcon column="ventasActual" /></div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:text-indigo-600 transition-colors"
                                                onClick={() => requestSort('ventasAnterior')}
                                            >
                                                <div className="flex items-center justify-end">Ventas P1 <SortIcon column="ventasAnterior" /></div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:text-indigo-600 transition-colors"
                                                onClick={() => requestSort('diffVentas')}
                                            >
                                                <div className="flex items-center justify-end">Dif. Unid. <SortIcon column="diffVentas" /></div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:text-indigo-600 transition-colors"
                                                onClick={() => requestSort('netoActual')}
                                            >
                                                <div className="flex items-center justify-end">Neto P2 <SortIcon column="netoActual" /></div>
                                            </TableHead>
                                            <TableHead 
                                                className="text-right cursor-pointer hover:text-indigo-600 transition-colors"
                                                onClick={() => requestSort('growthNeto')}
                                            >
                                                <div className="flex items-center justify-end">Crecimiento <SortIcon column="growthNeto" /></div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAndSortedData.map((item) => (
                                            <TableRow key={item.mla} className="hover:bg-slate-50/50">
                                                <TableCell className="max-w-[400px]">
                                                    <div className="font-medium truncate text-slate-800">{item.nombre}</div>
                                                    <div className="text-xs text-slate-400 font-mono">{item.mla}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-indigo-600">{item.ventasActual}</TableCell>
                                                <TableCell className="text-right text-slate-500">{item.ventasAnterior}</TableCell>
                                                <TableCell className={`text-right font-medium ${item.diffVentas > 0 ? "text-green-600" : item.diffVentas < 0 ? "text-red-600" : ""}`}>
                                                    {item.diffVentas > 0 ? `+${item.diffVentas}` : item.diffVentas}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-slate-700">{formatCurrency(item.netoActual)}</TableCell>
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
                                {filteredAndSortedData.length === 0 && (
                                    <div className="p-8 text-center text-slate-400">
                                        No se encontraron productos que coincidan con la búsqueda.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>
        </div>
    )
}
