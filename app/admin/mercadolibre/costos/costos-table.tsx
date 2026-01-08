"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge"; // Usaremos Badges para las variantes
import { ExternalLink, ArrowUpDown, Search } from "lucide-react";

export function CostosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 1. Filtro inteligente: Incluimos la búsqueda por variante ahora también
  const filteredData = data.filter(item => 
    item.nombre_publicacion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mla?.includes(filter) ||
    item.componentes?.toLowerCase().includes(filter.toLowerCase()) ||
    item.nombre_variante?.toLowerCase().includes(filter.toLowerCase())
  );

  // 2. Ordenar por costo total (lo más caro arriba por defecto)
  const sortedData = [...filteredData].sort((a, b) => 
    sortOrder === 'asc' 
      ? Number(a.costo_total_reposicion) - Number(b.costo_total_reposicion) 
      : Number(b.costo_total_reposicion) - Number(a.costo_total_reposicion)
  );

  return (
    <div className="space-y-4">
      {/* Buscador mejorado */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar por nombre, MLA, variante o componente..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-10 bg-white border-slate-200 shadow-sm"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="w-[140px] font-bold text-slate-600">MLA</TableHead>
              <TableHead className="w-[300px] font-bold text-slate-600">Publicación / Variante</TableHead>
              <TableHead className="font-bold text-slate-600">Composición del Kit</TableHead>
              <TableHead className="w-[120px] font-bold text-slate-600 text-center">SKUs</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="hover:bg-slate-100 p-2 font-bold text-blue-700 -ml-2"
                >
                  Costo Total <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right pr-6 font-bold text-slate-600">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => {
              // Dividimos los componentes para mostrarlos en lista
              const listaComponentes = item.componentes?.split(' + ') || [];
              
              // Verificamos si es una publicación simple ("0") o con variante real
              const esSimple = item.nombre_variante === "0" || !item.nombre_variante;

              return (
                <TableRow 
                  key={`${item.mla}-${item.nombre_variante}`} 
                  className="hover:bg-blue-50/30 transition-colors border-slate-100"
                >
                  {/* Columna MLA */}
                  <TableCell className="font-mono font-medium text-slate-500 py-4">
                    {item.mla}
                  </TableCell>
                  
                  {/* Columna Nombre y Variante */}
                  <TableCell className="py-4">
                    <div className="font-bold text-[12px] leading-tight mb-2 uppercase text-slate-800">
                      {item.nombre_publicacion || "Sin Título"}
                    </div>
                    {esSimple ? (
                      <Badge variant="outline" className="text-[10px] text-slate-400 font-normal border-slate-200">
                        Producto Único
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200 font-bold uppercase">
                        {item.nombre_variante}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Columna de Nombres de Componentes */}
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1.5">
                      {listaComponentes.map((comp: string, idx: number) => {
                        const nombreSolo = comp.substring(0, comp.lastIndexOf(' ('));
                        return (
                          <div key={idx} className="text-[11px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-tight flex items-center h-4">
                            {nombreSolo || comp}
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>

                  {/* Columna SKUs (IDs de artículo) */}
                  <TableCell className="py-4 text-center">
                    <div className="flex flex-col gap-1.5 items-center">
                      {listaComponentes.map((comp: string, idx: number) => {
                        const idSolo = comp.substring(comp.lastIndexOf(' (') + 2, comp.lastIndexOf(')'));
                        return (
                          <span key={idx} className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 min-w-[65px]">
                            {idSolo}
                          </span>
                        );
                      })}
                    </div>
                  </TableCell>

                  {/* Columna COSTO TOTAL */}
                  <TableCell className="py-4">
                    <div className="text-lg font-black text-green-700">
                      ${Number(item.costo_total_reposicion).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[9px] text-slate-400 font-medium">Costo de Reposición</div>
                  </TableCell>

                  {/* Columna Link Externo */}
                  <TableCell className="text-right pr-6 py-4">
                    <a href={item.link_publicacion} target="_blank" rel="noreferrer">
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <ExternalLink className="h-5 w-5" />
                      </Button>
                    </a>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {sortedData.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <p className="text-slate-500 font-medium">No se encontraron kits que coincidan con la búsqueda.</p>
        </div>
      )}
    </div>
  );
}
