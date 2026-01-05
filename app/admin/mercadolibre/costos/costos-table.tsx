"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ReceiptText, ExternalLink, ArrowUpDown } from "lucide-react";

export function CostosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filtro por nombre o MLA
  const filteredData = data.filter(item => 
    item.nombre_publicacion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mla?.includes(filter)
  );

  // Ordenar por costo total
  const sortedData = [...filteredData].sort((a, b) => 
    sortOrder === 'asc' ? a.costo_total_reposicion - b.costo_total_reposicion : b.costo_total_reposicion - a.costo_total_reposicion
  );

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por nombre o MLA..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">MLA</TableHead>
              <TableHead>Publicación</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                  Costo Total <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Piezas</TableHead>
              <TableHead className="text-right">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow key={item.mla + item.nombre_variante}>
                <TableCell className="font-mono text-xs">{item.mla}</TableCell>
                <TableCell className="max-w-[400px]">
                  <div className="font-medium truncate">{item.nombre_publicacion}</div>
                  <div className="text-xs text-muted-foreground">{item.nombre_variante}</div>
                </TableCell>
                <TableCell className="font-bold text-blue-600">
                  ${Number(item.costo_total_reposicion).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{item.cantidad_de_piezas}</TableCell>
                <TableCell className="text-right">
                  <a href={item.link_publicacion} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><ExternalLink className="h-4 w-4" /></Button>
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
