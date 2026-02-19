"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

// DEFINICIÓN DE TIPO (Ajusta esto según los datos reales que recibe tu componente)
interface ProductVisit {
  id: string
  title: string
  price: number
  available_quantity: number
  sold_quantity: number
  permalink: string
  thumbnail: string
  // Agrega aquí cualquier otro campo que venga de tu base de datos
}

interface VisitasClientProps {
  data: ProductVisit[] // Asumimos que recibes los datos como prop 'data'
}

export default function VisitasClient({ data = [] }: VisitasClientProps) {
  // Estado para el buscador
  const [searchTerm, setSearchTerm] = useState("")
  
  // Estado para el ordenamiento: { clave, dirección }
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductVisit; direction: 'asc' | 'desc' } | null>(null)

  // 1. LÓGICA DE FILTRADO (Buscador)
  const filteredData = useMemo(() => {
    if (!searchTerm) return data
    const lowerTerm = searchTerm.toLowerCase()
    return data.filter((item) => 
      item.title.toLowerCase().includes(lowerTerm) || 
      item.id.toLowerCase().includes(lowerTerm)
    )
  }, [data, searchTerm])

  // 2. LÓGICA DE ORDENAMIENTO
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

  // Función para manejar el clic en los encabezados
  const handleSort = (key: keyof ProductVisit) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Icono dinámico para el encabezado
  const getSortIcon = (key: keyof ProductVisit) => {
    if (sortConfig?.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-primary" /> 
      : <ArrowDown className="ml-2 h-4 w-4 text-primary" />
  }

  return (
    <div className="space-y-6 p-4">
      {/* SECCIÓN BUSCADOR */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Visitas y Estadísticas</h2>
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

      {/* SECCIÓN TABLA COMPARATIVA */}
      <div className="rounded-md border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase bg-gray-100">
              <tr>
                {/* Columna IMAGEN (No ordenable) */}
                <th className="px-4 py-3 font-medium">Imagen</th>

                {/* Columna MLA (Ordenable) */}
                <th 
                  className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('id')}
                >
                  <div className="flex items-center">MLA {getSortIcon('id')}</div>
                </th>

                {/* Columna TÍTULO (Ordenable) */}
                <th 
                  className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('title')}
                >
                  <div className="flex items-center">Producto {getSortIcon('title')}</div>
                </th>

                {/* Columna PRECIO (Ordenable) */}
                <th 
                  className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center">Precio {getSortIcon('price')}</div>
                </th>

                {/* Columna VENDIDOS (Ordenable) */}
                <th 
                  className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('sold_quantity')}
                >
                  <div className="flex items-center">Vendidos {getSortIcon('sold_quantity')}</div>
                </th>
                
                 {/* Columna DISPONIBLES (Ordenable) */}
                 <th 
                  className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('available_quantity')}
                >
                  <div className="flex items-center">Stock {getSortIcon('available_quantity')}</div>
                </th>
                
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {sortedData.length > 0 ? (
                sortedData.map((product) => (
                  <tr key={product.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      {product.thumbnail && (
                        <img 
                          src={product.thumbnail} 
                          alt={product.title} 
                          className="h-10 w-10 object-contain rounded-md border" 
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{product.id}</td>
                    <td className="px-4 py-3 max-w-[300px] truncate" title={product.title}>
                      {product.title}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      ${product.price?.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{product.sold_quantity}</td>
                    <td className="px-4 py-3">{product.available_quantity}</td>
                    <td className="px-4 py-3 text-right">
                      <a 
                        href={product.permalink} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-primary hover:underline text-blue-600"
                      >
                        Ver
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="h-24 text-center text-muted-foreground">
                    No se encontraron productos con "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground text-center mt-4">
        Mostrando {sortedData.length} productos
      </div>
    </div>
  )
}
