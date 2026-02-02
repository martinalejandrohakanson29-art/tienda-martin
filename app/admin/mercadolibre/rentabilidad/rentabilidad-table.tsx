"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductoRentabilidad {
  item_id: string;
  nombre: string;
  precio_venta: number;
  cargo_venta_ars: number;
  cargo_venta_porc: number;
  cuotas_ars: number;
  cuotas_porc: number;
  envio: number;
  costo_fijo_ml: number;
  estado?: string;
}

export default function RentabilidadTable({ data }: { data: ProductoRentabilidad[] }) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 1. Lógica de Filtrado (Igual a CostosTable)
  const filteredData = data.filter((item) => {
    // Filtro de Texto (Buscador) - PRIMERO
    const searchLower = filter.toLowerCase().trim();
    if (searchLower) {
      const matchesSearch = 
        item.nombre?.toLowerCase().includes(searchLower) ||
        item.item_id?.toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false; // Si no coincide con la búsqueda, descartamos
    }

    // Filtro de Estado - SEGUNDO (solo si pasó el filtro de texto)
    if (statusFilter !== 'all') {
      // Si el item no tiene estado definido, lo consideramos como 'paused'
      const itemStatus = item.estado || 'paused';
      if (itemStatus !== statusFilter) return false;
    }

    return true; // Pasó todos los filtros
  });

  // 2. Lógica de Ordenamiento (Por precio, pero puedes cambiarlo)
  const sortedData = [...filteredData].sort((a, b) => {
    return sortOrder === 'asc' 
      ? a.precio_venta - b.precio_venta
      : b.precio_venta - a.precio_venta;
  });

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      {/* --- SECCIÓN SUPERIOR (Buscador y Filtros) --- */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          
          {/* Buscador */}
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por título o MLA..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 pr-8 bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
            />
            {filter && (
              <button 
                onClick={() => setFilter("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filtros de Estado y Contador */}
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'active', label: 'Activos' },
                { id: 'paused', label: 'Pausados' }
              ].map((btn) => (
                <Button
                  key={btn.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatusFilter(btn.id as any)}
                  className={cn(
                    "h-7 px-3 text-xs font-bold transition-all rounded-md",
                    statusFilter === btn.id 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                  )}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
            
            <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
              {filteredData.length} resultados
            </div>
          </div>
        </div>
      </div>

      {/* --- TABLA CON SCROLL INFINITO (Sin Paginación) --- */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="w-[120px] font-bold text-slate-700 h-10">MLA</TableHead>
              <TableHead className="font-bold text-slate-700 h-10">Publicación</TableHead>
              <TableHead className="text-right font-bold text-slate-700 h-10">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="hover:bg-slate-200 font-bold h-8 px-2 -mr-2"
                >
                  Precio <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-right font-bold text-red-600 h-10">Cargos</TableHead>
              <TableHead className="text-right font-bold text-blue-600 h-10">Envío</TableHead>
              <TableHead className="text-center font-bold text-slate-700 h-10">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((item) => (
                <TableRow key={item.item_id} className="hover:bg-amber-50/50 transition-colors border-slate-100 bg-white">
                  <TableCell className="font-mono text-xs font-medium text-slate-500">
                    {item.item_id}
                  </TableCell>
                  <TableCell className="font-medium text-sm text-slate-700 max-w-[300px]" title={item.nombre}>
                    {item.nombre}
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    ${item.precio_venta.toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-red-600 font-medium">
                        -${(item.cargo_venta_ars + item.cuotas_ars).toLocaleString('es-AR')}
                      </span>
                      {item.cargo_venta_porc > 0 && (
                        <span className="text-[10px] text-slate-400">({item.cargo_venta_porc}%)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-blue-600 text-sm font-medium">
                    {item.envio > 0 ? `-$${item.envio.toLocaleString('es-AR')}` : <span className="text-xs text-slate-400 italic">A cargo comprador</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={cn(
                      "text-[10px] uppercase font-bold border",
                      item.estado === 'active' 
                        ? "bg-green-50 text-green-700 border-green-200" 
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {item.estado === 'active' ? 'Activo' : 'Pausado'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center bg-white">
                  <div className="flex flex-col items-center justify-center text-slate-400 italic">
                    <Search className="h-8 w-8 mb-2 opacity-20" />
                    <p>No se encontraron resultados para "{filter}"</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
