"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label"; // Usamos Label para los títulos de los inputs

export function ArticulosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  
  // 1. Estados para el Dólar y el FOB Global con tus valores por defecto
  const [globalDolar, setGlobalDolar] = useState(1530);
  const [globalFob, setGlobalFob] = useState(2.3);

  const filteredData = data.filter(item => 
    item.descripcion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.id_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 2. Barra de Herramientas: Buscador + Controles Globales */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        {/* Buscador a la izquierda */}
        <Input
          placeholder="Buscar por descripción o ID..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm bg-white shadow-sm"
        />

        {/* Controles de Dólar y FOB a la derecha */}
        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-inner">
          <div className="flex flex-col gap-1">
            <Label htmlFor="dolar-global" className="text-[10px] font-bold uppercase text-slate-500">Valor Dólar</Label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">$</span>
              <Input
                id="dolar-global"
                type="number"
                value={globalDolar}
                onChange={(e) => setGlobalDolar(Number(e.target.value))}
                className="w-24 h-9 bg-white font-bold text-blue-700 border-blue-100 focus:border-blue-500"
              />
            </div>
          </div>
          
          {/* Separador visual */}
          <div className="w-[1px] h-10 bg-slate-200 mx-1" />

          <div className="flex flex-col gap-1">
            <Label htmlFor="fob-global" className="text-[10px] font-bold uppercase text-slate-500">Factor FOB</Label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">x</span>
              <Input
                id="fob-global"
                type="number"
                step="0.1"
                value={globalFob}
                onChange={(e) => setGlobalFob(Number(e.target.value))}
                className="w-20 h-9 bg-white font-bold text-amber-700 border-amber-100 focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* 3. Tabla Maestra */}
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100">
              <TableHead className="w-[150px] font-bold text-slate-700">Cód. Artículo</TableHead>
              <TableHead className="font-bold text-slate-700">Descripción</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-700 text-center">Precio Base</TableHead>
              {/* Eliminamos la columna Factor FOB como pediste */}
              <TableHead className="w-[150px] font-bold text-slate-700 text-right pr-6">Final ARS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              // 4. Lógica de cálculo en tiempo real:
              // Si es dólar: Precio Base * Dólar Global * FOB Global
              // Si es peso: Se queda el Precio Base tal cual
              const finalArs = item.es_dolar 
                ? item.costo_usd * globalDolar * globalFob 
                : item.costo_usd;

              return (
                <TableRow key={item.id} className="hover:bg-amber-50/50 transition-colors">
                  <TableCell className="font-mono font-medium text-blue-600">
                    {item.id_articulo}
                  </TableCell>
                  <TableCell className="font-medium uppercase text-gray-800 text-xs">
                    {item.descripcion}
                  </TableCell>
                  
                  {/* PRECIO BASE */}
                  <TableCell className="text-center font-semibold text-slate-600">
                    {item.es_dolar ? 'U$S ' : '$ '}
                    {item.costo_usd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>

                  {/* COSTO FINAL RECALCULADO (Verde y resaltado) */}
                  <TableCell className="text-right pr-6 font-bold text-green-700 text-lg">
                    ${finalArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {/* Mensaje de referencia al pie */}
      <div className="text-[10px] text-slate-400 italic text-right pr-4">
        * Cálculos basados en Dólar a ${globalDolar.toLocaleString('es-AR')} y multiplicador FOB x{globalFob.toFixed(2)}
      </div>
    </div>
  );
}
