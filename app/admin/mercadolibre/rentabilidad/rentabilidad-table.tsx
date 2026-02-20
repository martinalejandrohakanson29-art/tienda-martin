"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductoRentabilidad {
  item_id: string;
  variation_id: string | null;
  nombre: string;
  nombre_variante: string | null;
  precio_original: number;
  desc_pct_total: number;
  precio_final: number;
  precio_final_nuestro: number;
  costo_total: number;
  neto_teorico: number;
  ganancia_neta: number;
  ganancia_porcentaje: number;
  cargo_venta_real: number;
  envio_costo: number;
  costo_fijo_ml: number;
}

type SortKey = keyof ProductoRentabilidad;

export default function RentabilidadTable({ data }: { data: ProductoRentabilidad[] }) {
  const [filter, setFilter] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "ganancia_neta",
    direction: "desc",
  });

  // ESTADO TEMPORAL PARA SIMULACIONES
  // Ahora guardamos el valor como "string" (texto) para que no haya conflictos al borrar
  const [overrides, setOverrides] = useState<Record<string, { desc_pct_total?: string; costo_total?: string }>>({});

  // Función para guardar lo que escribes exactamente como lo tipeaste
  const handleOverride = (id: string, field: 'desc_pct_total' | 'costo_total', value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  // Función para cambiar el orden
  const handleSort = (key: SortKey) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // 1. PRIMERO APLICAMOS LA SIMULACIÓN A LOS DATOS
  const simulatedData = data.map((item) => {
    const id = `${item.item_id}-${item.variation_id || ""}`;
    const override = overrides[id];

    if (!override) return item;

    // Si tipeaste algo, lo convertimos a número. Si borraste todo (""), lo tratamos como 0 para la matemática.
    const simulatedDesc = override.desc_pct_total !== undefined 
      ? (override.desc_pct_total === "" ? 0 : Number(override.desc_pct_total)) 
      : item.desc_pct_total;

    const simulatedCosto = override.costo_total !== undefined 
      ? (override.costo_total === "" ? 0 : Number(override.costo_total)) 
      : item.costo_total;

    // Si los valores terminan siendo iguales a la base de datos, no hacemos matemática extra
    if (simulatedDesc === item.desc_pct_total && simulatedCosto === item.costo_total) return item;

    // MATEMÁTICA DE SIMULACIÓN
    const fee_rate = item.precio_final > 0 ? item.cargo_venta_real / item.precio_final : 0;
    
    const nuevo_precio_final = item.precio_original * (1 - simulatedDesc / 100);
    const nuevo_cargo_venta = nuevo_precio_final * fee_rate;
    
    const nuevo_neto = nuevo_precio_final - nuevo_cargo_venta - item.envio_costo - item.costo_fijo_ml;
    const nueva_ganancia = nuevo_neto - simulatedCosto;
    const nuevo_pct = simulatedCosto > 0 ? (nueva_ganancia / simulatedCosto) * 100 : 0;

    return {
      ...item,
      desc_pct_total: simulatedDesc,
      costo_total: simulatedCosto,
      precio_final: nuevo_precio_final,
      cargo_venta_real: nuevo_cargo_venta,
      neto_teorico: nuevo_neto,
      ganancia_neta: nueva_ganancia,
      ganancia_porcentaje: nuevo_pct,
    };
  });

  // 2. LUEGO FILTRAMOS
  const filteredData = simulatedData.filter((item) => {
    const searchLower = filter.toLowerCase().trim();
    return (item.nombre || "").toLowerCase().includes(searchLower) || 
           (item.item_id || "").toLowerCase().includes(searchLower) ||
           (item.nombre_variante || "").toLowerCase().includes(searchLower);
  });

  // 3. LUEGO ORDENAMOS
  const sortedData = [...filteredData].sort((a, b) => {
    const aValue = a[sortConfig.key] ?? 0;
    const bValue = b[sortConfig.key] ?? 0;

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortConfig.direction === "asc" 
        ? aValue.localeCompare(bValue) 
        : bValue.localeCompare(aValue);
    }
    
    return sortConfig.direction === "asc" 
      ? (aValue as number) - (bValue as number) 
      : (bValue as number) - (aValue as number);
  });

  const getPorcentajeStyle = (pct: number) => {
    if (pct <= 40) return "text-red-600 font-black";
    if (pct > 40 && pct <= 50) return "text-amber-500 font-black";
    if (pct > 50 && pct <= 60) return "text-green-600 font-black";
    return "text-[#d413c3] font-black";
  };

  const SortableHead = ({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) => (
    <TableHead 
      className={cn("cursor-pointer hover:bg-slate-200 transition-colors select-none", className)}
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center justify-end gap-1">
        {label}
        {sortConfig.key === sortKey ? (
          sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </div>
    </TableHead>
  );

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por título, MLA o variante..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 pr-8 bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {filteredData.length} ítems analizados
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow>
              <TableHead 
                className="min-w-[350px] font-bold text-slate-700 text-[11px] cursor-pointer"
                onClick={() => handleSort("nombre")}
              >
                Publicación / Variante
              </TableHead>
              <SortableHead label="P. Original" sortKey="precio_original" className="text-slate-400" />
              <SortableHead label="Dcto Total" sortKey="desc_pct_total" className="text-amber-600" />
              <SortableHead label="P. Final" sortKey="precio_final" className="text-slate-900" />
              <SortableHead label="Costo" sortKey="costo_total" className="text-slate-700 bg-slate-100" />
              <SortableHead label="Comisión $" sortKey="cargo_venta_real" className="text-red-500" />
              <SortableHead label="Envío" sortKey="envio_costo" className="text-blue-600" />
              <SortableHead label="Neto Recibido" sortKey="neto_teorico" className="text-white bg-slate-900 px-4" />
              <SortableHead label="Ganancia Neta" sortKey="ganancia_neta" className="text-white bg-green-700 px-4" />
              <SortableHead label="Ganancia %" sortKey="ganancia_porcentaje" className="text-white bg-green-800 px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => {
              const id = `${item.item_id}-${item.variation_id || ''}`;
              const isSimulated = overrides[id] !== undefined;

              return (
                <TableRow key={`${id}-${index}`} className={cn("transition-colors border-slate-100 text-[11px]", isSimulated ? "bg-amber-50/30 hover:bg-amber-50/60" : "bg-white hover:bg-slate-50/80")}>
                  <TableCell>
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-slate-800 truncate max-w-[340px]">{item.nombre}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-mono text-slate-400">{item.item_id}</span>
                        {item.nombre_variante && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded font-bold uppercase">
                            {item.nombre_variante}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-slate-400 line-through">
                    ${item.precio_original.toLocaleString('es-AR')}
                  </TableCell>
                  
                  {/* CELDA EDITABLE DE DESCUENTO CON CLASES PARA OCULTAR FLECHAS */}
                  <TableCell className="text-right font-bold text-amber-600">
                    <div className="flex justify-end items-center gap-1">
                      <Input 
                        type="number"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="h-6 w-14 text-right text-[11px] px-1 font-bold text-amber-600 border-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500 bg-white shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={overrides[id]?.desc_pct_total !== undefined ? overrides[id].desc_pct_total : item.desc_pct_total}
                        onChange={(e) => handleOverride(id, 'desc_pct_total', e.target.value)}
                      />
                      <span>%</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-right font-bold text-slate-900">
                    ${item.precio_final.toLocaleString('es-AR')}
                  </TableCell>

                  {/* CELDA EDITABLE DE COSTO CON CLASES PARA OCULTAR FLECHAS */}
                  <TableCell className="text-right font-bold text-slate-600 bg-slate-100">
                    <div className="flex justify-end items-center gap-1">
                      <span className="text-slate-400">$</span>
                      <Input 
                        type="number"
                        min="0"
                        placeholder="0"
                        className="h-6 w-20 text-right text-[11px] px-1 font-bold text-slate-700 border-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500 bg-white shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={overrides[id]?.costo_total !== undefined ? overrides[id].costo_total : item.costo_total}
                        onChange={(e) => handleOverride(id, 'costo_total', e.target.value)}
                      />
                    </div>
                  </TableCell>

                  <TableCell className="text-right text-red-600">
                    ${item.cargo_venta_real.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right text-blue-600 font-medium">
                    {item.envio_costo > 0 ? `$${item.envio_costo.toLocaleString('es-AR')}` : '-'}
                  </TableCell>
                  <TableCell className="text-right font-bold px-4 text-slate-900 bg-slate-50 border-l border-slate-200">
                    ${item.neto_teorico.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right font-black px-4 border-l text-green-700 bg-green-50/30">
                    ${item.ganancia_neta.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className={cn("text-right px-4 border-l bg-slate-50", getPorcentajeStyle(item.ganancia_porcentaje))}>
                    {item.ganancia_porcentaje.toFixed(1)}%
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
