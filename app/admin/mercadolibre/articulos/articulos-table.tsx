"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search } from "lucide-react";

export function ArticulosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  
  // Valores temporales (lo que escribís)
  const [tempDolar, setTempDolar] = useState(1530);
  const [tempFob, setTempFob] = useState(2.3);

  // Valores activos (lo que realmente calcula)
  const [activeDolar, setActiveDolar] = useState(1530);
  const [activeFob, setActiveFob] = useState(2.3);

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
      {/* CONTROLES FIJOS (Sticky) - Se quedan arriba al bajar */}
      <div className="sticky top-[-16px] z-30 bg-slate-50/95 backdrop-blur-sm pb-4 pt-2 -mx-2 px-2 border-b mb-6">
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
          
          {/* Buscador con icono */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por descripción o ID..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 bg-white shadow-sm border-slate-200"
            />
          </div>

          {/* Panel de Dólar/FOB */}
          <div className="flex items-end gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Valor Dólar</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                <Input
                  type="number"
                  value={tempDolar}
                  onChange={(e) => setTempDolar(Number(e.target.value))}
                  className="w-28 h-10 pl-7 font-bold text-blue-600 border-slate-100"
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Factor FOB</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">x</span>
                <Input
                  type="number"
                  step="0.1"
                  value={tempFob}
                  onChange={(e) => setTempFob(Number(e.target.value))}
                  className="w-24 h-10 pl-7 font-bold text-amber-600 border-slate-100"
                />
              </div>
            </div>

            <Button 
              onClick={aplicarCambios} 
              className="h-10 bg-blue-600 hover:bg-blue-700 shadow-md gap-2 px-6"
            >
              <RefreshCw className="h-4 w-4" />
              Modificar
            </Button>
          </div>
        </div>
      </div>
      
      {/* TABLA ESTILO MAESTRO */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[150px] font-bold text-slate-600">Cód. Artículo</TableHead>
              <TableHead className="font-bold text-slate-600">Descripción</TableHead>
              <TableHead className="w-[120px] font-bold text-slate-600 text-center">Es Dólar</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-600 text-center">Precio Base</TableHead>
              <TableHead className="w-[180px] font-bold text-slate-700 text-right pr-8">Final ARS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              const finalArs = item.es_dolar 
                ? Number(item.costo_usd) * activeDolar * activeFob 
                : Number(item.costo_usd);

              return (
                <TableRow key={item.id} className="hover:bg-blue-50/30 transition-colors border-slate-100">
                  <TableCell className="font-mono font-medium text-blue-600">{item.id_articulo}</TableCell>
                  <TableCell className="font-medium uppercase text-slate-700 text-xs">{item.descripcion}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.es_dolar ? "default" : "secondary"}>{item.es_dolar ? "SÍ" : "NO"}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold text-slate-500">
                    {item.es_dolar ? 'U$S ' : '$ '}
                    {Number(item.costo_usd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right pr-8 font-extrabold text-green-700 text-lg">
                    ${finalArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      <div className="text-[10px] text-slate-400 italic text-right pr-4 pb-10">
        * Calculando con Dólar a ${activeDolar} y FOB x{activeFob}. (Presiona Modificar para actualizar)
      </div>
    </div>
  );
}
