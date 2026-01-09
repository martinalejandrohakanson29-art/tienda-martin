"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ArrowUpDown, Search, Info } from "lucide-react";

export function CostosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 1. Filtro de búsqueda que abarca todas las columnas principales
  const filteredData = data.filter(item => 
    item.titulo?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mla?.includes(filter) ||
    item.receta_detallada?.toLowerCase().includes(filter.toLowerCase()) ||
    item.variante_ml?.toLowerCase().includes(filter.toLowerCase()) ||
    item.ids_articulos?.toLowerCase().includes(filter.toLowerCase())
  );

  // 2. Ordenar por costo total
  const sortedData = [...filteredData].sort((a, b) => 
    sortOrder === 'asc' 
      ? Number(a.costo_total) - Number(b.costo_total) 
      : Number(b.costo_total) - Number(a.costo_total)
  );

  // Función para renderizar el badge del estado con colores
  const renderEstadoBadge = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 font-bold uppercase text-[10px]">Activo</Badge>;
      case 'paused':
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 font-bold uppercase text-[10px]">Pausado</Badge>;
      default:
        return <Badge variant="secondary" className="text-slate-500 text-[10px]">{estado || 'S/D'}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar por MLA, título, SKU..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-10 bg-white border-slate-200 shadow-sm"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="font-bold text-slate-600">MLA</TableHead>
              <TableHead className="w-[250px] font-bold text-slate-600">Publicación</TableHead>
              <TableHead className="font-bold text-slate-600">Variante / ID</TableHead>
              <TableHead className="font-bold text-slate-600">Estado</TableHead>
              <TableHead className="font-bold text-slate-600">IDs Artículos</TableHead>
              <TableHead className="w-[300px] font-bold text-slate-600">Receta Detallada</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="hover:bg-slate-100 p-2 font-bold text-blue-700 -ml-2"
                >
                  Costo Total <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right pr-4 font-bold text-slate-600">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => {
              const listaReceta = item.receta_detallada?.split(' + ') || [];
              const listaIds = item.ids_articulos?.split(' + ') || [];
              const linkML = `https://articulo.mercadolibre.com.ar/${item.mla}`;

              return (
                <TableRow key={`${item.mla}-${item.variation_id || index}`} className="hover:bg-blue-50/30 transition-colors">
                  {/* MLA */}
                  <TableCell className="font-mono font-medium text-slate-500">{item.mla}</TableCell>

                  {/* Título */}
                  <TableCell className="py-4">
                    <div className="font-bold text-[12px] leading-tight uppercase text-slate-800">
                      {item.titulo || "Sin Título"}
                    </div>
                  </TableCell>

                  {/* Variante y Variation ID */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-indigo-600 uppercase">
                        {item.variante_ml === "0" || !item.variante_ml ? "Único" : item.variante_ml}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {item.variation_id || "Base"}
                      </span>
                    </div>
                  </TableCell>

                  {/* Estado */}
                  <TableCell>{renderEstadoBadge(item.estado)}</TableCell>

                  {/* IDs de Artículos */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {listaIds.map((id: string, idx: number) => (
                        <span key={idx} className="text-[9px] font-mono font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                          {id}
                        </span>
                      ))}
                    </div>
                  </TableCell>

                  {/* Receta Detallada */}
                  <TableCell>
                    <div className="space-y-1">
                      {listaReceta.map((r: string, idx: number) => (
                        <div key={idx} className="text-[10px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-none py-0.5">
                          {r}
                        </div>
                      ))}
                    </div>
                  </TableCell>

                  {/* Costo Total */}
                  <TableCell>
                    <div className="text-base font-black text-green-700">
                      ${Number(item.costo_total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                  </TableCell>

                  {/* Link Externo */}
                  <TableCell className="text-right pr-4">
                    <a href={linkML} target="_blank" rel="noreferrer">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
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
