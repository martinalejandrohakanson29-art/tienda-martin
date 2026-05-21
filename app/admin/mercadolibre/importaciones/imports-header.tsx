"use client"

import * as React from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "./date-range-picker"

export function ImportsHeader() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [isRefreshing, setIsRefreshing] = React.useState(false)

    const handleRangeChange = (from: string, to: string) => {
        const params = new URLSearchParams(searchParams)
        if (from) params.set("from", from)
        if (to) params.set("to", to)
        router.push(`${pathname}?${params.toString()}`)
    }

    const handleRefresh = () => {
        setIsRefreshing(true)
        router.refresh()
        setTimeout(() => setIsRefreshing(false), 800)
    }

    return (
        <div className="bg-white border-b px-8 py-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
                <Link href="/admin/mercadolibre">
                    <Button variant="outline" size="sm" className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tablero de Importaciones</h1>
                    <p className="text-sm text-slate-500">Datos 100% desde sistema propio</p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <DateRangePicker onRangeChange={handleRangeChange} />
                <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Actualizando...' : 'Actualizar'}
                </Button>
            </div>
        </div>
    )
}
