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

export default function SeguimientoVentasPage() {
    const [loading, setLoading] = useState(false)
    const [ranges, setRanges] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleCompare = async (r1: any, r2: any) => {
        setLoading(true)
        setError(null)
        
        try {
            // URL de tu n8n (puedes moverla a variables de entorno luego)
            const N8N_WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/seguimiento-ventas"

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ r1, r2 }),
            })

            if (!response.ok) throw new Error("Error en el servidor")

            const data = await response.json()
            
            // Tomamos el primer elemento si es un array
            const finalData = Array.isArray(data) ? data[0] : data
            setRanges(finalData)
            
        } catch (err) {
            console.error("Error:", err)
            setError("No se pudo conectar con n8n. Verifica que el workflow esté activo.")
        } finally {
            setLoading(false)
        }
    }

    // LÓGICA DE UNIFICACIÓN DE DATOS (Lo nuevo e importante)
    const comparisonData = useMemo(() => {
        if (!ranges) return []

        const list1 = ranges.r1 || [] // Periodo Actual
        const list2 = ranges.r2 || [] // Periodo Anterior

        // Crear un mapa con todos los MLAs únicos de ambos periodos
        const allMlas = new Set([
            ...list1.map((p: any) => p.MLA), 
            ...list2.map((p: any) => p.MLA)
        ])

        // Construir el array unificado
        const combined = Array.from(allMlas).map(mla => {
            const p1 = list1.find((p: any) => p.MLA === mla)
            const p2 = list2.find((p: any) => p.MLA === mla)

            // Datos base (usamos el nombre de cualquiera de los dos periodos)
            const nombre = p1?.Nombre || p2?.Nombre || "Producto desconocido"
            
            // Métricas
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

        // Ordenar por mayor venta en el periodo actual (P1)
        return combined.sort((a, b) => b.netoP1 - a.netoP1)
    }, [ranges])

    // Totales Globales
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
                        <p className="text-lg font-medium">
