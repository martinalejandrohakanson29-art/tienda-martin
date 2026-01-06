"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button"; // Importamos el botón
import { RefreshCw } from "lucide-react"; // Un ícono para el botón

export function ArticulosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  
  // 1. Valores que se muestran en los inputs (lo que estás escribiendo)
  const [tempDolar, setTempDolar] = useState(1530);
  const [tempFob, setTempFob] = useState(2.3);

  // 2. Valores que REALMENTE se usan para el cálculo (los confirmados)
  const [activeDolar, setActiveDolar] = useState(1530);
  const [activeFob, setActiveFob] = useState(2.3);

  // Función para confirmar el cambio
  const aplicarCambios = () => {
    setActiveDolar(tempDolar);
    setActiveFob(tempFob);
  };

  const filteredData = data.filter(item => 
    item.descripcion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.id_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* BARRA DE HERRAMIENTAS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        <Input
          placeholder="Buscar por descripción o ID..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm bg-white shadow-sm"
        />

        {/* PANEL DE CONTROL CON BOTÓN DE CONFIRMACIÓN */}
        <div className="flex items-end gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-inner">
          <div className="flex flex-col gap-1">
            <Label htmlFor="dolar-global" className="text-[10px] font-bold uppercase text-slate-500">Dólar</Label>
            <Input
              id="dolar-global"
              type="number"
              value={tempDolar}
              onChange={(e) => setTempDolar(Number(e.target.value))}
              className="w-24 h-9 bg-white font-bold text-blue-700"
            />
          </div>
          
          <div className="flex flex-col gap-1">
            <Label htmlFor="fob-global" className="text-[10px] font-bold uppercase text-slate-500">FOB</Label>
            <Input
              id="fob-global"
              type="number"
              step="0.1"
              value={tempFob}
              onChange={(e) => setTempFob(Number(e.target.value))}
              className="w-20 h-9 bg-white font-bold text-amber-700"
            />
          </div>

          {/* BOTÓN MODIFICAR */}
          <Button 
            onClick={aplicarCambios}
            className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-md"
          >
            <RefreshCw className="h-4 w-4" />
            Modificar
          </Button>
        </div>
      </div>
      
      {/* TABLA MAESTRA */}
      <div className="rounded-md border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100">
              <TableHead className="w-[150px] font-bold text-slate-700">Cód. Artículo</TableHead>
              <TableHead className="font-bold text-slate-700">Descripción</TableHead>
              <TableHead className="w-[120px] font-bold text-slate-700 text-center">Es Dólar</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-700 text-center">Precio Base</TableHead>
              <TableHead className="w-[150px] font-bold text-slate-700 text-right pr-6">Final ARS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              // Usamos los valores ACTIVOS para el cálculo
              const finalArs = item.es_dolar 
                ? Number(item.costo_usd) * activeDolar * activeFob 
                : Number(item.costo_usd);

              return (
                <TableRow key={item.id} className="hover:bg-amber-50/50 transition-colors">
                  <TableCell className="font-mono font-medium text-blue-600">
                    {item.id_articulo}
                  </TableCell>
                  <TableCell className="font-medium uppercase text-gray-800 text-xs">
                    {item.descripcion}
                  </TableCell>
                  
                  {/* COLUMNA ES DÓLAR (SÍ/NO) */}
                  <TableCell className="text-center">
                    <Badge variant={item.es_dolar ? "default" : "secondary"}>
                      {item.es_dolar ? "SÍ" : "NO"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-center font-semibold text-slate-600">
                    {item.es_dolar ? 'U$S ' : '$ '}
                    {Number(item.costo_usd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>

                  <TableCell className="text-right pr-6 font-bold text-green-700 text-lg">
                    ${finalArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      <div className="text-[10px] text-slate-400 italic text-right pr-4">
        * Calculando con Dólar a ${activeDolar} y FOB x{activeFob}. (Presiona Modificar para actualizar)
      </div>
    </div>
  );
}
