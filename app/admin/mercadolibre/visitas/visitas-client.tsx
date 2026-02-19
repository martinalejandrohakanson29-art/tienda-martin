"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown } from "lucide-react"

interface VisitaComparativa {
  mla: string
  nombre: string
  totalR1: number
  totalR2: number
  diff: number
  growth: string
}

export default function VisitasClient({ data = [] }: { data: VisitaComparativa[] }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: keyof VisitaComparativa; direction: 'asc' | 'desc' } | null>({ key: 'totalR2', direction: 'desc' })

  const filteredData = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase()
    return data.filter((item) => 
      item.nombre.toLowerCase().includes(lowerTerm) || 
      item.mla.toLowerCase().includes(lowerTerm)
    )
  }, [data, searchTerm])

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredData, sortConfig])

  const handleSort = (key: keyof VisitaComparativa) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar producto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 text-left font-semibold cursor-pointer" onClick={() => handleSort('nombre')}>Producto</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('totalR1')}>Rango 1</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('totalR2')}>Rango 2</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('growth')}>Growth</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedData.length > 0 ? (
              sortedData.map((item) => {
                const isPos = parseFloat(item.growth) >= 0;
                return (
                  <tr key={item.mla} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{item.nombre}</div>
                      <div className="text-xs text-gray-500 font-mono">{item.mla}</div>
                    </td>
                    <td className="p-3 text-center font-semibold text-gray-600">{item.totalR1}</td>
                    <td className="p-3 text-center font-bold text-gray-900">{item.totalR2}</td>
                    <td className={`p-3 text-center font-bold ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                      <div className="flex items-center justify-center gap-1">
                        {isPos ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                        {item.growth}%
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 italic">
                  No se encontraron datos para estos periodos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
