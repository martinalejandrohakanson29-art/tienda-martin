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
import { Search, X, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductoRentabilidad {
  item_id: string;
  variation_id: string | null;
  nombre: string;
  nombre_variante: string | null;
  precio_original: number;
  desc_pct_total: number;
  precio_final: number;
  precio_final_nuestro: number;
  costo_total: number;
  neto_teorico: number;
  ganancia_neta: number;
  ganancia_porcentaje: number;
  cargo_venta_real: number;
  envio_costo: number;
  costo_fijo_ml: number;
}

export default function RentabilidadTable({ data }: { data: ProductoRentabilidad[] }) {
  const [filter, setFilter] = useState("");

  const filteredData = data.filter((item) => {
    const searchLower = filter.toLowerCase().trim();
    return (item.nombre || "").toLowerCase().includes(searchLower) || 
           (item.item_id || "").toLowerCase().includes(searchLower) ||
           (item.nombre_variante || "").toLowerCase().includes(searchLower);
  });

  const sortedData = [...filteredData].sort((a, b) => b.ganancia_neta - a.ganancia_neta);

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por título, MLA o variante..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 pr-8 bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {filteredData.length} ítems analizados
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow>
              <TableHead className="min-w-[350px] font-bold text-slate-700 text-[11px]">Publicación / Variante</TableHead>
              <TableHead className="text-right font-bold text-slate-400 text-[11px]">P. Original</TableHead>
              <TableHead className="text-right font-bold text-amber-600 text-[11px]">Dcto Total</TableHead>
              <TableHead className="text-right font-bold text-slate-900 text-[11px]">P. Final</TableHead>
              <TableHead className="text-right font-bold text-slate-700 bg-slate-100 text-[11px]">Costo (Match)</TableHead>
              <TableHead className="text-right font-bold text-red-500 text-[11px]">Comisión $</TableHead>
              <TableHead className="text-right font-bold text-blue-600 text-[11px]">Envío</TableHead>
              <TableHead className="text-right font-bold text-white bg-slate-900 px-4 text-[11px]">Neto Recibido</TableHead>
              
              {/* NUEVAS COLUMNAS */}
              <TableHead className="text-right font-bold text-white bg-green-700 px-4 text-[11px]">Ganancia Neta</TableHead>
              <TableHead className="text-right font-bold text-white bg-green-800 px-4 text-[11px]">Ganancia %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => (
              <TableRow key={`${item.item_id}-${item.variation_id || index}`} className="hover:bg-amber-50/50 transition-colors border-slate-100 bg-white text-[11px]">
                <TableCell>
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold text-slate-800 truncate max-w-[340px]">{item.nombre}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-mono text-slate-400">{item.item_id}</span>
                      {item.nombre_variante && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded font-bold uppercase">
                          {item.nombre_variante}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right text-slate-400 line-through">
                  ${item.precio_original.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right font-bold text-amber-600">
                  {item.desc_pct_total > 0 ? `${item.desc_pct_total}%` : '-'}
                </TableCell>
                <TableCell className="text-right font-bold text-slate-900">
                  ${item.precio_final.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right font-bold text-slate-600 bg-slate-100">
                  ${item.costo_total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="text-right text-red-600">
                  ${item.cargo_venta_real.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="text-right text-blue-600 font-medium">
                  {item.envio_costo > 0 ? `$${item.envio_costo.toLocaleString('es-AR')}` : '-'}
                </TableCell>
                <TableCell className="text-right font-bold px-4 text-slate-900 bg-slate-50 border-l border-slate-200">
                  ${item.neto_teorico.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </TableCell>

                {/* CELDA GANANCIA NETA */}
                <TableCell className={cn(
                  "text-right font-black px-4 border-l",
                  item.ganancia_neta > 0 ? "text-green-700 bg-green-50/50" : "text-red-600 bg-red-50/50"
                )}>
                  ${item.ganancia_neta.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </TableCell>

                {/* CELDA GANANCIA % */}
                <TableCell className={cn(
                  "text-right font-black px-4 border-l",
                  item.ganancia_porcentaje > 0 ? "text-green-800 bg-green-100/30" : "text-red-700 bg-red-100/30"
                )}>
                  <div className="flex items-center justify-end gap-1">
                    {item.ganancia_porcentaje > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {item.ganancia_porcentaje.toFixed(1)}%
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
