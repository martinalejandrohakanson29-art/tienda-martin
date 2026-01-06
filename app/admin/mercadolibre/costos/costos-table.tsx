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
            <TableRow className="bg-slate-50">
              <TableHead className="w-[120px]">MLA</TableHead>
              <TableHead className="w-[300px]">Publicación</TableHead>
              <TableHead>Componentes del Kit</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="hover:bg-transparent p-0 font-bold text-blue-700"
                >
                  Costo Total <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right pr-6">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow key={item.mla + item.nombre_variante} className="hover:bg-slate-50/50">
                <TableCell className="font-mono text-[11px] text-gray-500">{item.mla}</TableCell>
                <TableCell className="max-w-[300px] py-4">
                  <div className="font-semibold text-sm leading-tight mb-1">
                    {item.nombre_publicacion}
                  </div>
                  {/* Eliminamos el (Normal) visualmente si existe */}
                  <div className="text-[11px] text-blue-600 font-medium bg-blue-50 w-fit px-2 rounded">
                    {item.nombre_variante?.replace(' (Normal)', '')}
                  </div>
                </TableCell>
                <TableCell className="max-w-[400px]">
                  <div className="space-y-1.5 py-2">
                    {/* Separamos el texto por el '+' y creamos un renglón por cada uno */}
                    {item.componentes?.split(' + ').map((comp: string, idx: number) => (
                      <div key={idx} className="text-[11px] text-gray-700 border-l-2 border-slate-200 pl-2 leading-none">
                        {comp}
                      </div>
                    ))}
                    {!item.componentes && <span className="text-gray-400 text-xs italic">Sin componentes</span>}
                  </div>
                </TableCell>
                <TableCell className="font-bold text-base text-green-700">
                  ${Number(item.costo_total_reposicion).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right pr-6">
                  <a href={item.link_publicacion} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-300">
                      <ExternalLink className="h-4 w-4 text-slate-600" />
                    </Button>
                  </a>
                </TableCell>
              </TableRow>
            ))}
            {sortedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20 text-gray-500">
                  No se encontraron resultados para su búsqueda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
