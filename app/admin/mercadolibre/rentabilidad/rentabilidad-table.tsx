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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductoRentabilidad {
  item_id: string;
  nombre: string;
  precio_original: number;
  desc_pct_total: number;
  desc_vendedor_pct: number;
  desc_meli_pct: number;
  descuento_manual: string;
  precio_final: number;
  precio_final_nuestro: number;
}

export default function RentabilidadTable({ data }: { data: ProductoRentabilidad[] }) {
  const [filter, setFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredData = data.filter((item) => {
    const searchLower = filter.toLowerCase().trim();
    return (item.nombre || "").toLowerCase().includes(searchLower) || 
           (item.item_id || "").toLowerCase().includes(searchLower);
  });

  const sortedData = [...filteredData].sort((a, b) => {
    return sortOrder === 'asc' ? a.precio_final - b.precio_final : b.precio_final - a.precio_final;
  });

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por título o MLA..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 pr-8 bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {filteredData.length} resultados encontrados
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-bold text-slate-700">Publicación</TableHead>
              <TableHead className="text-right font-bold text-slate-700">Precio Original</TableHead>
              <TableHead className="text-right font-bold text-amber-600">Dcto Total</TableHead>
              <TableHead className="text-right font-bold text-slate-600">Dcto Propio</TableHead>
              <TableHead className="text-right font-bold text-blue-600">Dcto ML</TableHead>
              <TableHead className="text-center font-bold text-slate-700">Manual</TableHead>
              <TableHead className="text-right font-bold text-slate-900">
                <Button variant="ghost" size="sm" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} className="font-bold">
                  Precio Final <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-right font-bold text-green-700 bg-green-50/50">Recibís Neto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => (
              <TableRow key={`${item.item_id}-${index}`} className="hover:bg-amber-50/50 transition-colors border-slate-100 bg-white">
                <TableCell className="max-w-[200px]">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-slate-700 truncate" title={item.nombre}>{item.nombre}</span>
                    <span className="text-[10px] font-mono text-slate-400">{item.item_id}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-slate-400 line-through text-xs">
                  ${item.precio_original.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right font-bold text-amber-600">
                  {item.desc_pct_total > 0 ? `${item.desc_pct_total}%` : '-'}
                </TableCell>
                <TableCell className="text-right text-slate-600">
                  {item.desc_vendedor_pct > 0 ? `${item.desc_vendedor_pct}%` : '-'}
                </TableCell>
                <TableCell className="text-right text-blue-600">
                  {item.desc_meli_pct > 0 ? `${item.desc_meli_pct}%` : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={cn(
                    "text-[10px] px-1.5 h-5",
                    item.descuento_manual === "SI" 
                      ? "bg-purple-50 text-purple-700 border-purple-200" 
                      : "bg-slate-50 text-slate-400 border-slate-200"
                  )}>
                    {item.descuento_manual}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-bold text-slate-900">
                  ${item.precio_final.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right font-black text-green-700 bg-green-50/30">
                  ${item.precio_final_nuestro.toLocaleString('es-AR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
