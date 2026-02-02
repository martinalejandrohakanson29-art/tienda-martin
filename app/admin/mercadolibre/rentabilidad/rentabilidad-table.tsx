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
import { Search, ArrowUpDown, X, Tag } from "lucide-react";

interface ProductoRentabilidad {
  item_id: string;
  nombre: string;
  precio_venta: number;
  precio_original: number;
  cargo_venta_total: number;
  envio: number;
  desc_pct_total: number;
  desc_vendedor_pct: number;
  desc_meli_pct: number;
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
    return sortOrder === 'asc' ? a.precio_venta - b.precio_venta : b.precio_venta - a.precio_venta;
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
              <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {filteredData.length} productos analizados
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b">
            <TableRow>
              <TableHead className="w-[120px] font-bold text-slate-700">MLA</TableHead>
              <TableHead className="font-bold text-slate-700">Publicación</TableHead>
              <TableHead className="text-right font-bold text-slate-700">Precio Lista</TableHead>
              <TableHead className="text-right font-bold text-green-600">Dctos (Vnd/ML)</TableHead>
              <TableHead className="text-right font-bold text-slate-900">
                <Button variant="ghost" size="sm" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} className="font-bold">
                  Precio Final <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-right font-bold text-red-600">Cargos ML</TableHead>
              <TableHead className="text-right font-bold text-blue-600">Envío</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => (
              <TableRow key={`${item.item_id}-${index}`} className="hover:bg-amber-50/50 bg-white">
                <TableCell className="font-mono text-xs text-slate-500">{item.item_id}</TableCell>
                <TableCell className="font-medium text-sm text-slate-700 max-w-[250px] truncate">{item.nombre}</TableCell>
                <TableCell className="text-right text-slate-400 line-through text-xs">
                  ${item.precio_original.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span className="text-green-600 font-bold text-sm">-{item.desc_pct_total}%</span>
                    <span className="text-[10px] text-slate-400">({item.desc_vendedor_pct}% / {item.desc_meli_pct}%)</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-black text-slate-900">
                  ${item.precio_venta.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right text-red-600 font-medium text-sm">
                  -${item.cargo_venta_total.toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-right text-blue-600 text-sm font-medium">
                  {item.envio > 0 ? `-$${item.envio.toLocaleString('es-AR')}` : <span className="text-[10px] text-slate-400 italic">Gratis p/ mi</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
