"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, TrendingUp, TrendingDown, BarChart2, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { getVisitasComparativas } from "@/app/actions/visitas"

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
  initialData: VisitaComparativa[]
  initialR1: { from: string; to: string }
  initialR2: { from: string; to: string }
}

// Tooltip personalizado para el gráfico
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

export default function VisitasClient({ initialData = [], initialR1, initialR2 }: VisitasClientProps) {
  // Estado para los datos de la tabla
  const [data, setData] = useState<VisitaComparativa[]>(initialData)

  // Estados para las fechas seleccionadas
  const [r1From, setR1From] = useState(initialR1.from)
  const [r1To, setR1To] = useState(initialR1.to)
  const [r2From, setR2From] = useState(initialR2.from)
  const [r2To, setR2To] = useState(initialR2.to)

  // Estados de carga (loaders) para los botones
  const [isLoadingDB, setIsLoadingDB] = useState(false)
  const [isLoadingN8n, setIsLoadingN8n] = useState(false)

  // Estados para búsqueda y ordenamiento
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: keyof VisitaComparativa; direction: 'asc' | 'desc' } | null>({ key: 'totalR2', direction: 'desc' })
  const [selectedProduct, setSelectedProduct] = useState<VisitaComparativa | null>(null)

  // --------------------------------------------------------
  // ACCIÓN 1: Buscar en la Base de Datos
  // --------------------------------------------------------
  const handleFetchDB = async () => {
    setIsLoadingDB(true)
    try {
      // Llamamos al Server Action pasándole las fechas seleccionadas
      const { comparativa } = await getVisitasComparativas(
        { from: r1From, to: r1To },
        { from: r2From, to: r2To }
      )
      setData(comparativa)
    } catch (error) {
      console.error("Error al traer datos:", error)
      alert("Hubo un error al actualizar los datos desde la Base de Datos.")
    } finally {
      setIsLoadingDB(false)
    }
  }

  // --------------------------------------------------------
  // ACCIÓN 2: Llamar al Webhook de n8n
  // --------------------------------------------------------
 const handleCallN8n = async () => {
    setIsLoadingN8n(true)
    try {
      // AQUÍ PONES LA URL DE TU WEBHOOK DE N8N
      const WEBHOOK_URL = "https://TU_URL_DE_N8N_AQUI"
      
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rango1: { from: r1From, to: r1To },
          rango2: { from: r2From, to: r2To }
        })
      })

      if (response.ok) {
        // ¡Aquí está la magia! ✨
        // Como n8n ya terminó, forzamos a la tabla a buscar los datos nuevos en la base de datos
        await handleFetchDB()
        
        // Y le mostramos al usuario que todo salió perfecto
        alert("¡Sincronización con n8n completada y pantalla actualizada!")
      } else {
        alert("Error al contactar n8n. Revisa la URL del webhook.")
      }
    } catch (error) {
      console.error("Error al llamar a n8n:", error)
      alert("No se pudo conectar con n8n.")
    } finally {
      setIsLoadingN8n(false)
    }
  }

  // Lógica de filtrado y ordenamiento
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

  // Preparamos los datos fusionados para el gráfico
  const chartData = useMemo(() => {
    if (!selectedProduct) return [];
    
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
    <div className="space-y-6">
      
      {/* PANEL SUPERIOR DE CONTROLES (Fechas y Botones) */}
      <div className="bg-white p-5 rounded-lg border shadow-sm flex flex-col xl:flex-row gap-6 xl:items-end">
        
        {/* Rango 1 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-gray-700">Rango 1 (Base)</label>
          <div className="flex items-center gap-2">
            <Input type="date" value={r1From} onChange={(e) => setR1From(e.target.value)} className="w-auto" />
            <span className="text-gray-500 text-sm font-medium">al</span>
            <Input type="date" value={r1To} onChange={(e) => setR1To(e.target.value)} className="w-auto" />
          </div>
        </div>

        {/* Rango 2 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-gray-700">Rango 2 (A comparar)</label>
          <div className="flex items-center gap-2">
            <Input type="date" value={r2From} onChange={(e) => setR2From(e.target.value)} className="w-auto" />
            <span className="text-gray-500 text-sm font-medium">al</span>
            <Input type="date" value={r2To} onChange={(e) => setR2To(e.target.value)} className="w-auto" />
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex gap-3 ml-auto w-full xl:w-auto mt-2 xl:mt-0">
          <Button 
            onClick={handleFetchDB} 
            disabled={isLoadingDB}
            className="bg-blue-600 hover:bg-blue-700 text-white flex-1 xl:flex-none transition-all"
          >
            <Search className={`mr-2 h-4 w-4 ${isLoadingDB ? "animate-spin" : ""}`} />
            {isLoadingDB ? "Buscando..." : "Consultar BD"}
          </Button>
          
          <Button 
            onClick={handleCallN8n} 
            disabled={isLoadingN8n}
            variant="outline"
            className="border-green-600 text-green-700 hover:bg-green-50 flex-1 xl:flex-none transition-all"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingN8n ? "animate-spin" : ""}`} />
            {isLoadingN8n ? "Sincronizando..." : "Actualizar vía n8n"}
          </Button>
        </div>
      </div>

      {/* BUSCADOR DE LA TABLA */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar producto por nombre o MLA..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 text-left font-semibold cursor-pointer" onClick={() => handleSort('nombre')}>Producto</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('totalR1')}>Rango 1</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('totalR2')}>Rango 2</th>
              <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('growth')}>Crecimiento</th>
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
                  No se encontraron datos para estos periodos o la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* VENTANA MODAL DEL GRÁFICO */}
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
                  name={`Rango 1 (${r1From} al ${r1To})`} 
                  stroke="#9CA3AF" 
                  strokeWidth={2} 
                  dot={{ r: 4, strokeWidth: 2 }} 
                  activeDot={{ r: 6 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="rango2" 
                  name={`Rango 2 (${r2From} al ${r2To})`} 
                  stroke="#2563EB" 
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
