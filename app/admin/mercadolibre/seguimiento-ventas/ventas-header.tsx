"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft, BarChart3, RefreshCw } from "lucide-react"
import Link from "next/link"
import { DateRangePicker } from "../importaciones/date-range-picker"

interface VentasHeaderProps {
    onCompare: (range1: { from: string, to: string }, range2: { from: string, to: string }) => void
    isLoading?: boolean
}

export function VentasHeader({ onCompare, isLoading }: VentasHeaderProps) {
    // Estados locales para guardar temporalmente los rangos
    let range1 = { from: "", to: "" }
    let range2 = { from: "", to: "" }

    const handleApply = () => {
        onCompare(range1, range2)
    }

    return (
        <div className="bg-white border-b shadow-sm p-4 sticky top-0 z-10">
            <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Título y Navegación */}
                <div className="flex items-center gap-4">
                    <Link href="/admin/mercadolibre">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                            <BarChart3 className="h-5 w-5 text-indigo-600" />
                            Seguimiento de Ventas
                        </h1>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                            Análisis Comparativo
                        </p>
                    </div>
                </div>

                {/* Controles de Fecha */}
                <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase vertical-text border-r pr-2">P1</span>
                        <DateRangePicker 
                            onRangeChange={(from, to) => { range1 = { from, to } }} 
                        />
                    </div>

                    <div className="text-slate-300 font-light text-xl">vs</div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase vertical-text border-r pr-2">P2</span>
                        <DateRangePicker 
                            onRangeChange={(from, to) => { range2 = { from, to } }} 
                        />
                    </div>

                    <Button 
                        onClick={handleApply}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm"
                    >
                        {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Comparar
                    </Button>
                </div>
            </div>
        </div>
    )
}
