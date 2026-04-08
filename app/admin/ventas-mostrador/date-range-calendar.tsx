"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"

interface DateRangeCalendarProps {
  fechaDesde: string
  fechaHasta: string
  setFechaDesde: (date: string) => void
  setFechaHasta: (date: string) => void
  onApply: () => void
}

export function DateRangeCalendar({
  fechaDesde,
  fechaHasta,
  setFechaDesde,
  setFechaHasta,
}: DateRangeCalendarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Desde</span>
        <Input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="h-10 w-[140px] border-slate-200 text-slate-700 rounded-xl"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Hasta</span>
        <Input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="h-10 w-[140px] border-slate-200 text-slate-700 rounded-xl"
        />
      </div>
    </div>
  )
}
