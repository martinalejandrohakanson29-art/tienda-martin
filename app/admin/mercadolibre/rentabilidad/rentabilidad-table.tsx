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
import { Search, X, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductoRentabilidad {
  item_id: string;
  variation_id: string | null;
  nombre: string;
  nombre_variante: string | null;
  precio_original: number;
  precio_final: number;
  precio_final_nuestro: number;
  costo_total: number;
  neto_teorico: number;
  margen_pct: number;
  cargo_venta_fijo: number;
  cuotas_fijo: number;
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

  // Ordenamos por margen (de menor a mayor para ver qué corregir primero) o por nombre
  const sortedData = [...filteredData].sort((a, b) => a.margen_pct - b.margen_pct);

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
            Mostrando {filteredData.length} productos
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow>
              <TableHead className="min-w-[300px] font-bold text-slate-700">Publicación</TableHead>
              <TableHead className="text-right font-bold text-amber-700 bg-amber-50/50">Final Nuestro</TableHead>
              <TableHead className="text-right font-bold text-slate-500">Costo Propio</TableHead>
              <TableHead className="text-right font-bold text-red-500">Gastos ML</TableHead>
              
              {/* COLUMNA CRÍTICA: NETO TEÓRICO */}
              <TableHead className="text-right font-bold text-white bg-slate-900 px-4">Neto Teórico</TableHead>
              <TableHead className="text-center font-bold text-slate-700 uppercase text-[10px]">Margen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => {
              const isNegative = item.neto_teorico < 0;
              const lowMargin = item.margen_pct < 15;

              return (
                <TableRow key={`${item.item_id}-${item.variation_id || index}`} className="hover:bg-slate-50 transition-colors border-slate-100 bg-white text-[11px] sm:text-xs">
                  <TableCell>
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-slate-800 truncate max-w-[280px]">{item.nombre}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-mono text-slate-400">{item.item_id}</span>
                        {item.nombre_variante && (
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded uppercase font-medium">
                            {item.nombre_variante}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-right font-bold text-amber-900 bg-amber-50/20">
                    ${item.precio_final_nuestro.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                  </TableCell>

                  <TableCell className="text-right text-slate-500">
                    ${item.costo_total.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                  </TableCell>

                  <TableCell className="text-right text-red-500 font-medium">
                    -${(item.cargo_venta_fijo + item.cuotas_fijo + item.envio_costo + item.costo_fijo_ml).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                  </TableCell>

                  {/* CELDA NETO CON SEMÁFORO */}
                  <TableCell className={cn(
                    "text-right font-black px-4 text-sm",
                    isNegative ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                  )}>
                    ${item.neto_teorico.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                  </TableCell>

                  <TableCell className="text-center">
                    <div className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px]",
                      isNegative ? "bg-red-100 text-red-700" : lowMargin ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    )}>
                      {item.margen_pct.toFixed(1)}%
                      {isNegative ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
