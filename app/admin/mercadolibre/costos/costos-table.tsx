// app/admin/mercadolibre/costos/costos-table.tsx

"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ArrowUpDown, Search } from "lucide-react";

export function CostosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 1. Filtro actualizado con los nuevos nombres de columna
  const filteredData = data.filter(item => 
    item.titulo?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mla?.includes(filter) ||
    item.receta_detallada?.toLowerCase().includes(filter.toLowerCase()) ||
    item.variante_ml?.toLowerCase().includes(filter.toLowerCase())
  );

  // 2. Ordenar por el nuevo campo costo_total
  const sortedData = [...filteredData].sort((a, b) => 
    sortOrder === 'asc' 
      ? Number(a.costo_total) - Number(b.costo_total) 
      : Number(b.costo_total) - Number(a.costo_total)
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar por título, MLA, variante..."
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
              <TableHead className="font-bold text-slate-600">Composición (Receta)</TableHead>
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
              // Separamos la receta detallada (asumiendo formato "Producto (ID) x Cant + ...")
              const listaComponentes = item.receta_detallada?.split(' + ') || [];
              const esSimple = item.variante_ml === "0" || !item.variante_ml;
              
              // Generamos el link de ML ya que no viene en la vista
              const linkML = `https://articulo.mercadolibre.com.ar/${item.mla}`;

              return (
                <TableRow 
                  key={`${item.mla}-${item.variation_id || 'base'}`} 
                  className="hover:bg-blue-50/30 transition-colors border-slate-100"
                >
                  <TableCell className="font-mono font-medium text-slate-500 py-4">
                    {item.mla}
                  </TableCell>
                  
                  <TableCell className="py-4">
                    <div className="font-bold text-[12px] leading-tight mb-2 uppercase text-slate-800">
                      {item.titulo || "Sin Título"}
                    </div>
                    {esSimple ? (
                      <Badge variant="outline" className="text-[10px] text-slate-400 font-normal border-slate-200">
                        Producto Único
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200 font-bold uppercase">
                        {item.variante_ml}
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1.5">
                      {listaComponentes.map((comp: string, idx: number) => {
                        const nombreSolo = comp.includes(' (') ? comp.substring(0, comp.lastIndexOf(' (')) : comp;
                        return (
                          <div key={idx} className="text-[11px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-tight flex items-center h-4">
                            {nombreSolo}
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>

                  <TableCell className="py-4 text-center">
                    <div className="flex flex-col gap-1.5 items-center">
                      {listaComponentes.map((comp: string, idx: number) => {
                        const match = comp.match(/\((.*?)\)/);
                        const idSolo = match ? match[1] : "S/D";
                        return (
                          <span key={idx} className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 min-w-[65px]">
                            {idSolo}
                          </span>
                        );
                      })}
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="text-lg font-black text-green-700">
                      ${Number(item.costo_total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[9px] text-slate-400 font-medium">Costo Calculado</div>
                  </TableCell>

                  <TableCell className="text-right pr-6 py-4">
                    <a href={linkML} target="_blank" rel="noreferrer">
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
    </div>
  );
}
