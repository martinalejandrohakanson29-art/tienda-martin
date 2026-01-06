"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ReceiptText, ExternalLink, ArrowUpDown } from "lucide-react";

export function CostosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filtro por nombre de publicación, MLA o componentes
  const filteredData = data.filter(item => 
    item.nombre_publicacion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mla?.includes(filter) ||
    item.componentes?.toLowerCase().includes(filter.toLowerCase())
  );

  // Ordenar por costo total
  const sortedData = [...filteredData].sort((a, b) => 
    sortOrder === 'asc' ? a.costo_total_reposicion - b.costo_total_reposicion : b.costo_total_reposicion - a.costo_total_reposicion
  );

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por nombre, MLA o componente..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100">
              <TableHead className="w-[140px] font-bold text-slate-700">MLA</TableHead>
              <TableHead className="w-[280px] font-bold text-slate-700">Publicación</TableHead>
              <TableHead className="font-bold text-slate-700">Componentes del Kit</TableHead>
              <TableHead className="w-[120px] font-bold text-slate-700 text-center">IDs</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="hover:bg-transparent p-0 font-bold text-blue-700"
                >
                  Costo Total <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right pr-6 font-bold text-slate-700">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => {
              // Dividimos los componentes en un array para procesarlos
              const listaComponentes = item.componentes?.split(' + ') || [];
              
              return (
                <TableRow 
                  key={item.mla + item.nombre_variante} 
                  className="hover:bg-blue-50/50 even:bg-slate-50/50 transition-colors"
                >
                  {/* MLA: Ahora más grande y legible */}
                  <TableCell className="font-bold text-sm text-slate-600 py-4">
                    {item.mla}
                  </TableCell>
                  
                  <TableCell className="max-w-[280px] py-4">
                    <div className="font-semibold text-sm leading-tight mb-1 uppercase text-gray-800">
                      {item.nombre_publicacion}
                    </div>
                    {/* Limpiamos el (Normal) del nombre de la variante */}
                    <div className="text-[10px] text-blue-600 font-bold bg-blue-50 w-fit px-1.5 rounded border border-blue-100">
                      {item.nombre_variante?.replace(' (Normal)', '')}
                    </div>
                  </TableCell>

                  {/* Columna de Nombres de Componentes */}
                  <TableCell className="py-4">
                    <div className="space-y-2">
                      {listaComponentes.map((comp: string, idx: number) => {
                        const nombreSolo = comp.substring(0, comp.lastIndexOf(' ('));
                        return (
                          <div key={idx} className="text-[11px] text-gray-700 border-l-2 border-slate-300 pl-2 leading-tight h-5 flex items-center">
                            {nombreSolo || comp}
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>

                  {/* IDs: Centrados y con fuente más clara */}
                  <TableCell className="py-4">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      {listaComponentes.map((comp: string, idx: number) => {
                        const idSolo = comp.substring(comp.lastIndexOf(' (') + 2, comp.lastIndexOf(')'));
                        return (
                          <div key={idx} className="text-[11px] font-mono font-medium text-slate-600 bg-slate-100 px-2 rounded h-5 flex items-center justify-center border border-slate-200 min-w-[60px]">
                            {idSolo}
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>

                  <TableCell className="font-bold text-base text-green-700 py-4">
                    ${Number(item.costo_total_reposicion).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>

                  <TableCell className="text-right pr-6 py-4">
                    <a href={item.link_publicacion} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-200 hover:border-blue-400">
                        <ExternalLink className="h-4 w-4 text-slate-500 hover:text-blue-600" />
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
