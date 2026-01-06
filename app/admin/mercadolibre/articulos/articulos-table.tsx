"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function ArticulosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");

  const filteredData = data.filter(item => 
    item.descripcion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.id_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por descripción o ID..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm bg-white"
      />
      
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100">
              <TableHead className="w-[150px] font-bold text-slate-700">Cód. Artículo</TableHead>
              <TableHead className="font-bold text-slate-700">Descripción</TableHead>
              <TableHead className="w-[120px] font-bold text-slate-700 text-center">Precio Base</TableHead>
              <TableHead className="w-[100px] font-bold text-slate-700 text-center">Factor FOB</TableHead>
              <TableHead className="w-[150px] font-bold text-slate-700 text-right pr-6">Final ARS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => (
              <TableRow key={item.id} className="hover:bg-amber-50/50 transition-colors">
                <TableCell className="font-mono font-medium text-blue-600">
                  {item.id_articulo}
                </TableCell>
                <TableCell className="font-medium uppercase text-gray-800 text-xs">
                  {item.descripcion}
                </TableCell>
                
                {/* PRECIO BASE (Dólar o Pesos) */}
                <TableCell className="text-center font-semibold text-slate-600">
                  {item.es_dolar ? 'U$S ' : '$ '}
                  {item.costo_usd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </TableCell>

                {/* FACTOR FOB (Solo se muestra si es dólar) */}
                <TableCell className="text-center">
                  {item.es_dolar ? (
                    <Badge variant="outline" className="font-mono">
                      x {item.factor_fob.toFixed(2)}
                    </Badge>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </TableCell>

                {/* COSTO FINAL EN PESOS */}
                <TableCell className="text-right pr-6 font-bold text-green-700 text-lg">
                  ${item.costo_final_ars.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
