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
        placeholder="Buscar por descripción o ID de artículo..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm bg-white"
      />
      
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100">
              <TableHead className="w-[80px] font-bold text-slate-700">ID</TableHead>
              <TableHead className="w-[150px] font-bold text-slate-700">Cód. Artículo</TableHead>
              <TableHead className="font-bold text-slate-700">Descripción</TableHead>
              {/* CAMBIO: Título de la columna a "Costo" */}
              <TableHead className="w-[120px] font-bold text-slate-700 text-center">Costo</TableHead>
              <TableHead className="w-[100px] font-bold text-slate-700 text-center">Es Dólar</TableHead>
              <TableHead className="w-[150px] font-bold text-slate-700 text-right pr-6">Costo Final ARS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => (
              <TableRow key={item.id} className="hover:bg-amber-50/50 transition-colors">
                <TableCell className="text-slate-500 text-xs">{item.id}</TableCell>
                <TableCell className="font-mono font-medium text-blue-600">
                  {item.id_articulo}
                </TableCell>
                <TableCell className="font-medium uppercase text-gray-800">
                  {item.descripcion}
                </TableCell>
                {/* CAMBIO: Lógica de signo según si es dólar o peso */}
                <TableCell className="text-center font-semibold">
                  {item.es_dolar ? 'U$S' : '$'} {item.costo_fob_usd.toFixed(2)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={item.es_dolar ? "default" : "secondary"}>
                    {item.es_dolar ? "SÍ" : "NO"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-6 font-bold text-green-700 text-lg">
                  ${item.costo_final_ars.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <div className="text-xs text-slate-500">
        Mostrando {filteredData.length} de {data.length} artículos.
      </div>
    </div>
  );
}
