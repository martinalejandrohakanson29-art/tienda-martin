"use client"

import * as React from "react"
import { format, subDays } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DateRangePickerProps {
    onRangeChange: (from: string, to: string) => void
}

export function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
    // Por defecto: 1 mes (hoy menos 30 días hasta hoy)
    const [from, setFrom] = React.useState(format(subDays(new Date(), 30), "yyyy-MM-dd"))
    const [to, setTo] = React.useState(format(new Date(), "yyyy-MM-dd"))

    // Notificar al padre cuando cambian las fechas
    React.useEffect(() => {
        onRangeChange(from, to)
    }, [from, to])

    return (
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg border shadow-sm">
            <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <div className="flex flex-col">
                    <Label className="text-[10px] text-slate-500 uppercase font-bold">Desde</Label>
                    <input 
                        type="date" 
                        value={from} 
                        onChange={(e) => setFrom(e.target.value)}
                        className="text-xs font-medium border-none p-0 focus:ring-0 cursor-pointer"
                    />
                </div>
            </div>
            
            <div className="h-8 w-[1px] bg-slate-200" /> {/* Separador visual */}

            <div className="flex items-center gap-2">
                <div className="flex flex-col">
                    <Label className="text-[10px] text-slate-500 uppercase font-bold">Hasta</Label>
                    <input 
                        type="date" 
                        value={to} 
                        onChange={(e) => setTo(e.target.value)}
                        className="text-xs font-medium border-none p-0 focus:ring-0 cursor-pointer"
                    />
                </div>
            </div>
        </div>
    )
}
