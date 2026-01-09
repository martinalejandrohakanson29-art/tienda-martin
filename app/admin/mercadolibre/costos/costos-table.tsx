// app/admin/mercadolibre/costos/costos-table.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function CostosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'all'>('active');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Lógica de filtrado
  const filteredData = data.filter(item => {
    if (statusFilter !== 'all' && item.estado?.toLowerCase() !== statusFilter) return false;
    const searchLower = filter.toLowerCase();
    return (
      item.titulo?.toLowerCase().includes(searchLower) ||
      item.mla?.includes(filter) ||
      item.receta_detallada?.toLowerCase().includes(searchLower) ||
      item.variante_ml?.toLowerCase().includes(searchLower) ||
      item.variation_id?.includes(filter) ||
      item.ids_articulos?.toLowerCase().includes(searchLower)
    );
  });

  const sortedData = [...filteredData].sort((a, b) => 
    sortOrder === 'asc' 
      ? Number(a.costo_total) - Number(b.costo_total) 
      : Number(b.costo_total) - Number(a.costo_total)
  );

  const renderEstadoBadge = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 border-green-200 font-bold uppercase text-[9px]">Activo</Badge>;
      case 'paused':
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 font-bold uppercase text-[9px]">Pausado</Badge>;
      default:
        return <Badge variant="secondary" className="text-slate-500 text-[9px]">{estado || 'S/D'}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 1. SECCIÓN FIJA: Buscador y Filtros (Siempre arriba) */}
      <div className="p-4 bg-white border-b border-slate-200 z-20 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between max-w-[1600px] mx-auto w-full">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por MLA, título, variante o SKU..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            {[
              { id: 'active', label: 'Activos' },
              { id: 'paused', label: 'Pausados' },
              { id: 'all', label: 'Todos' }
            ].map((btn) => (
              <Button
                key={btn.id}
                variant={statusFilter === btn.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(btn.id as any)}
                className={cn(
                  "h-8 px-4 text-xs font-bold transition-all",
                  statusFilter === btn.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-white"
                )}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. SECCIÓN CON SCROLL: La Tabla */}
      <div className="flex-1 overflow-auto p-4 bg-slate-50">
        <div className="max-w-[1600px] mx-auto rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table>
            {/* Header Sticky dentro del área de scroll */}
            <TableHeader className="sticky top-0 z-10 bg-slate-100 border-b shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-slate-700 py-4">MLA</TableHead>
                <TableHead className="w-[300px] font-bold text-slate-700">Publicación</TableHead>
                <TableHead className="font-bold text-slate-700">Variante</TableHead>
                <TableHead className="font-bold text-slate-700">Estado</TableHead>
                <TableHead className="font-bold text-slate-700">IDs Agregados</TableHead>
                <TableHead className="w-[300px] font-bold text-slate-700">Agregados</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="hover:bg-slate-200 p-2 font-bold text-blue-700 -ml-2"
                  >
                    Costo Total <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right pr-6 font-bold text-slate-700">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length > 0 ? (
                sortedData.map((item, index) => {
                  const listaReceta = item.receta_detallada?.split(' + ') || [];
                  const listaIds = item.ids_articulos?.split(' + ') || [];
                  const linkML = `https://articulo.mercadolibre.com.ar/${item.mla}`;

                  return (
                    <TableRow key={`${item.mla}-${item.variation_id || index}`} className="hover:bg-blue-50/30 transition-colors">
                      <TableCell className="font-mono text-slate-500 text-xs">{item.mla}</TableCell>
                      <TableCell className="py-4">
                        <div className="font-bold text-[11px] leading-tight uppercase text-slate-800">{item.titulo || "Sin Título"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-indigo-700 uppercase">{item.variante_ml === "0" || !item.variante_ml ? "Único" : item.variante_ml}</span>
                          <span className="text-[9px] text-slate-400 font-mono italic">{item.variation_id || "Base"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{renderEstadoBadge(item.estado)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 py-1">
                          {listaIds.map((id: string, idx: number) => (
                            <span key={idx} className="text-[9px] font-mono font-black bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600 w-fit">{id}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5 py-1">
                          {listaReceta.map((r: string, idx: number) => (
                            <div key={idx} className="text-[10px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-none py-0.5">{r}</div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-base font-black text-green-700">
                            ${Number(item.costo_total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">Costo Total</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <a href={linkML} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:text-blue-600 hover:bg-blue-50">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-slate-400 italic">No se encontraron resultados.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
