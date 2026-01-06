"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, ArrowUpDown, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function ImportsTable({ data }: { data: any[] }) {
    const [filter, setFilter] = useState("")

    const filteredData = data.filter(item => 
        item.name.toLowerCase().includes(filter.toLowerCase()) ||
        item.sku.includes(filter) ||
        item.supplier.toLowerCase().includes(filter.toLowerCase())
    )

    // Función para colorear los meses de stock (Semáforo)
    const getStockColor = (months: number) => {
        if (months === 0) return "bg-gray-100 text-gray-400" // Sin stock
        if (months < 1) return "bg-red-100 text-red-700 border-red-200" // Crítico
        if (months < 3) return "bg-yellow-100 text-yellow-800 border-yellow-200" // Alerta
        return "bg-green-100 text-green-700 border-green-200" // Saludable
    }

    return (
        <div className="space-y-4">
            {/* Buscador */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                    placeholder="Buscar por SKU, Nombre o Proveedor..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Tabla */}
            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[100px] font-bold">Código</TableHead>
                            <TableHead className="font-bold">Artículo</TableHead>
                            <TableHead className="w-[120px] font-bold">Proveedor</TableHead>
                            <TableHead className="w-[100px] text-center font-bold text-blue-600">Ventas ML (30d)</TableHead>
                            <TableHead className="w-[100px] text-center font-bold">Stock Prov.</TableHead>
                            <TableHead className="w-[100px] text-center font-bold">Consumo Mes</TableHead>
                            <TableHead className="w-[140px] text-center font-bold">Cobertura (Meses)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center h-24 text-gray-500">
                                    No hay datos cargados aún. Ejecuta el workflow de n8n.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => (
                                <TableRow key={item.id} className="hover:bg-slate-50">
                                    <TableCell className="font-mono text-xs font-medium">{item.sku}</TableCell>
                                    <TableCell className="text-xs uppercase">{item.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-[10px]">{item.supplier}</Badge>
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-blue-700 bg-blue-50/50">
                                        {item.salesLast30}
                                    </TableCell>
                                    <TableCell className="text-center font-medium">
                                        {item.stockExternal}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-gray-600">
                                        {item.salesVelocity?.toFixed(1)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold border ${getStockColor(item.monthsCoverage)}`}>
                                            {item.monthsCoverage === 0 ? "-" : item.monthsCoverage?.toFixed(1) + " meses"}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
