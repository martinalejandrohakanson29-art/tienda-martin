"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search, TrendingUp, TrendingDown, BarChart2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

interface HistorialDiario {
  fecha: string
  visitas: number
}

interface VisitaComparativa {
  mla: string
  nombre: string
  totalR1: number
  totalR2: number
  diff: number
  growth: string
  historialR1: HistorialDiario[]
  historialR2: HistorialDiario[]
}

interface VisitasClientProps {
  data: VisitaComparativa[]
  r1: { from: string; to: string }
  r2: { from: string; to: string }
}

// Tooltip personalizado para ver las fechas correctas al pasar el mouse por el gráfico
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border rounded-lg shadow-md text-sm">
        <p className="font-bold mb-2 text-gray-800">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex flex-col mb-1">
            <span style={{ color: entry.color }} className="font-semibold">
              {entry.name}: {entry.value} visitas
            </span>
            <span className="text-xs text-gray-500">
              Fecha real: {entry.dataKey === "rango1" ? entry.payload.fecha1 : entry.payload.fecha2}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function VisitasClient({ data = [], r1, r2 }: VisitasClientProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: keyof VisitaComparativa; direction: 'asc' | 'desc' } | null>({ key: 'totalR2', direction: 'desc' })
  const [selectedProduct, setSelectedProduct] = useState<VisitaComparativa | null>(null)

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

  // Preparamos los datos fusionados para el gráfico cuando hay un producto seleccionado
  const chartData = useMemo(() => {
    if (!selectedProduct) return [];
    
    // Tomamos la cantidad máxima de días entre ambos rangos para que el gráfico no se corte
    const maxLength = Math.max(selectedProduct.historialR1.length, selectedProduct.historialR2.length);
    const chartArray = [];
    
    for (let i = 0; i < maxLength; i++) {
      chartArray.push({
        dia: `Día ${i + 1}`,
        rango1: selectedProduct.historialR1[i]?.visitas || 0,
        fecha1: selectedProduct.historialR1[i]?.fecha || 'Sin fecha',
        rango2: selectedProduct.historialR2[i]?.visitas || 0,
        fecha2: selectedProduct.historialR2[i]?.fecha || 'Sin fecha'
      });
    }
    
    return chartArray;
  }, [selectedProduct]);

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

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 text-left font-semibold cursor-pointer" onClick={() => handleSort('nombre')}>Producto</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('totalR1')}>Rango 1</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('totalR2')}>Rango 2</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('growth')}>Growth</th>
              <th className="p-3 text-center font-semibold">Gráfico</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedData.length > 0 ? (
              sortedData.map((item) => {
                const isPos = parseFloat(item.growth) >= 0;
                return (
                  <tr key={item.mla} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-gray-900 line-clamp-2">{item.nombre}</div>
                      <div className="text-xs text-gray-500 font-mono mt-1">{item.mla}</div>
                    </td>
                    <td className="p-3 text-center font-semibold text-gray-600">{item.totalR1}</td>
                    <td className="p-3 text-center font-bold text-gray-900">{item.totalR2}</td>
                    <td className={`p-3 text-center font-bold ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                      <div className="flex items-center justify-center gap-1">
                        {isPos ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                        {item.growth}%
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button 
                        onClick={() => setSelectedProduct(item)}
                        className="p-2 text-blue-600 hover:bg-blue-100 hover:text-blue-800 rounded-full transition-colors inline-flex"
                        title="Ver gráfico de evolución"
                      >
                        <BarChart2 size={20} />
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                  No se encontraron datos para estos periodos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ventana Modal del Gráfico */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle className="text-xl text-blue-800">
              Evolución de Visitas: <span className="font-normal text-gray-700">{selectedProduct?.nombre}</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="h-[400px] mt-6 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="dia" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                
                <Line 
                  type="monotone" 
                  dataKey="rango1" 
                  name={`Rango 1 (${r1.from} al ${r1.to})`} 
                  stroke="#9CA3AF" // Gris para el rango antiguo
                  strokeWidth={2} 
                  dot={{ r: 4, strokeWidth: 2 }} 
                  activeDot={{ r: 6 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="rango2" 
                  name={`Rango 2 (${r2.from} al ${r2.to})`} 
                  stroke="#2563EB" // Azul fuerte para el rango más reciente
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2 }} 
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
