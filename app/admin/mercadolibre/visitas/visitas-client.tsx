"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown } from "lucide-react"

// Definimos la estructura exacta que viene de la base de datos
interface VisitaComparativa {
  mla: string
  nombre: string
  totalR1: number
  totalR2: number
  diff: number
  growth: string
}

interface VisitasClientProps {
  data: VisitaComparativa[]
}

export default function VisitasClient({ data = [] }: VisitasClientProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: keyof VisitaComparativa; direction: 'asc' | 'desc' } | null>(null)

  // Filtro por nombre o MLA
  const filteredData = useMemo(() => {
    if (!searchTerm) return data
    const lowerTerm = searchTerm.toLowerCase()
    return data.filter((item) => 
      item.nombre.toLowerCase().includes(lowerTerm) || 
      item.mla.toLowerCase().includes(lowerTerm)
    )
  }, [data, searchTerm])

  // Lógica de ordenamiento
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
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: keyof VisitaComparativa) => {
    if (sortConfig?.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-blue-600" /> 
      : <ArrowDown className="ml-2 h-4 w-4 text-blue-600" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-1/3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por Título o MLA..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => handleSort('mla')}>
                  <div className="flex items-center">MLA {getSortIcon('mla')}</div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => handleSort('nombre')}>
                  <div className="flex items-center">Producto {getSortIcon('nombre')}</div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer text-center" onClick={() => handleSort('totalR1')}>
                  <div className="flex items-center justify-center">V. Sem. Pasada {getSortIcon('totalR1')}</div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer text-center" onClick={() => handleSort('totalR2')}>
                  <div className="flex items-center justify-center">V. Esta Sem. {getSortIcon('totalR2')}</div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer text-center" onClick={() => handleSort('growth')}>
                  <div className="flex items-center justify-center">Crecimiento {getSortIcon('growth')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.length > 0 ? (
                sortedData.map((item) => {
                  const isPositive = Number(item.growth) >= 0;
                  return (
                    <tr key={item.mla} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{item.mla}</td>
                      <td className="px-4 py-3 font-medium">{item.nombre}</td>
                      <td className="px-4 py-3 text-center">{item.totalR1}</td>
                      <td className="px-4 py-3 text-center">{item.totalR2}</td>
                      <td className="px-4 py-3 text-center">
                        <div className={`flex items-center justify-center font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {isPositive ? <TrendingUp className="mr-1 h-4 w-4" /> : <TrendingDown className="mr-1 h-4 w-4" />}
                          {item.growth}%
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="h-24 text-center text-muted-foreground">
                    No hay datos suficientes para mostrar la comparativa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
