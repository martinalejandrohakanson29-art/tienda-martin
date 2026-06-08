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

export interface ProductoRentabilidad {
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
  ventas_30d: number;
  desc_pct_nuestro?: number;
  desc_pct_ml?: number;
  comision_pct?: number;
  impuesto_pct?: number;
}

type SortKey = keyof ProductoRentabilidad;

const getItemId = (item: { item_id: string; variation_id?: string | null }) =>
  `${item.item_id}-${item.variation_id || ""}`;

interface Props {
  data: ProductoRentabilidad[];
  selectedIds?: Set<string>;
  qualifyingIds?: Set<string>;
  onToggle?: (itemId: string) => void;
  headerActions?: React.ReactNode;
  ajustesMap?: Map<string, number>;
}

export default function RentabilidadTable({
  data,
  selectedIds,
  qualifyingIds,
  onToggle,
  headerActions,
  ajustesMap,
}: Props) {
  const [filter, setFilter] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "ganancia_neta",
    direction: "desc",
  });
  const [overrides, setOverrides] = useState<Record<string, { desc_pct_nuestro?: string; costo_total?: string }>>({});

  const [sortedIds, setSortedIds] = useState<string[]>(() =>
    [...data]
      .sort((a, b) => b.ganancia_neta - a.ganancia_neta)
      .map(getItemId)
  );

  const handleOverride = (id: string, field: "desc_pct_nuestro" | "costo_total", value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const simulatedData = data.map((item) => {
    const id = getItemId(item);
    const override = overrides[id];

    const desc_pct_nuestro_real = item.precio_original > 0
      ? (1 - (item.precio_final_nuestro / item.precio_original)) * 100
      : 0;
    const desc_pct_ml = Math.max(0, item.desc_pct_total - desc_pct_nuestro_real);

    const simulatedDescNuestro = override?.desc_pct_nuestro !== undefined
      ? (override.desc_pct_nuestro === "" ? 0 : Number(override.desc_pct_nuestro))
      : desc_pct_nuestro_real;

    const simulatedCosto = override?.costo_total !== undefined
      ? (override.costo_total === "" ? 0 : Number(override.costo_total))
      : item.costo_total;

    const fee_rate = item.precio_final > 0 ? item.cargo_venta_real / item.precio_final : 0;
    const TAX_RATE = 0.02;

    const nuevo_precio_final_nuestro = item.precio_original * (1 - simulatedDescNuestro / 100);
    const nuevo_precio_final_publico = item.precio_original * (1 - (simulatedDescNuestro + desc_pct_ml) / 100);
    const nuevo_cargo_venta = nuevo_precio_final_publico * fee_rate;
    const nuevo_impuesto = nuevo_precio_final_publico * TAX_RATE;
    const nuevo_neto = nuevo_precio_final_nuestro - nuevo_cargo_venta - item.envio_costo - item.costo_fijo_ml - nuevo_impuesto;
    const nueva_ganancia = nuevo_neto - simulatedCosto;
    const nuevo_pct = simulatedCosto > 0 ? (nueva_ganancia / simulatedCosto) * 100 : 0;

    return {
      ...item,
      desc_pct_nuestro: simulatedDescNuestro,
      desc_pct_ml,
      costo_total: simulatedCosto,
      precio_final: nuevo_precio_final_publico,
      precio_final_nuestro: nuevo_precio_final_nuestro,
      cargo_venta_real: nuevo_cargo_venta,
      comision_pct: fee_rate * 100,
      impuesto_pct: TAX_RATE * 100,
      neto_teorico: nuevo_neto,
      ganancia_neta: nueva_ganancia,
      ganancia_porcentaje: nuevo_pct,
    };
  });

  const filteredData = simulatedData.filter((item) => {
    const searchLower = filter.toLowerCase().trim();
    return (
      (item.nombre || "").toLowerCase().includes(searchLower) ||
      (item.item_id || "").toLowerCase().includes(searchLower) ||
      (item.nombre_variante || "").toLowerCase().includes(searchLower)
    );
  });

  const handleSort = (key: SortKey) => {
    const direction = sortConfig.key === key && sortConfig.direction === "asc" ? "desc" : "asc";
    setSortConfig({ key, direction });
    const sorted = [...simulatedData].sort((a, b) => {
      const aValue = (a as any)[key] ?? 0;
      const bValue = (b as any)[key] ?? 0;
      if (typeof aValue === "string" && typeof bValue === "string") {
        return direction === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      return direction === "asc" ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
    });
    setSortedIds(sorted.map(getItemId));
  };

  const sortedData = (() => {
    const dataMap = new Map(filteredData.map((item) => [getItemId(item), item]));
    const ordered = sortedIds
      .map((id) => dataMap.get(id))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    const inOrder = new Set(sortedIds.filter((id) => dataMap.has(id)));
    const extra = filteredData.filter((item) => !inOrder.has(getItemId(item)));
    return [...ordered, ...extra];
  })();

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

  const hasSelection = !!onToggle;

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
          <div className="flex items-center gap-3">
            {headerActions}
            <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
              {filteredData.length} ítems analizados
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow>
              {hasSelection && <TableHead className="w-8" />}
              <TableHead className="min-w-[300px] font-bold text-slate-700 text-[11px] cursor-pointer" onClick={() => handleSort("nombre")}>
                Publicación / Variante
              </TableHead>
              <SortableHead label="Ventas 30d" sortKey="ventas_30d" className="text-indigo-600" />
              <SortableHead label="P. Original" sortKey="precio_original" className="text-slate-400" />
              <SortableHead label="Dcto ML" sortKey="desc_pct_ml" className="text-slate-400" />
              <SortableHead label="Dcto Nuestro" sortKey="desc_pct_nuestro" className="text-amber-600" />
              <SortableHead label="P. Público" sortKey="precio_final" className="text-slate-500" />
              <SortableHead label="P. Nuestro" sortKey="precio_final_nuestro" className="text-slate-900 bg-slate-100" />
              <TableHead className="text-right text-violet-700 font-bold text-[11px] bg-violet-50 whitespace-nowrap">P. Optimizado</TableHead>
              <SortableHead label="Costo" sortKey="costo_total" className="text-slate-700 bg-slate-100" />
              <SortableHead label="Comisión %" sortKey="comision_pct" className="text-red-500" />
              <SortableHead label="Impuesto" sortKey="impuesto_pct" className="text-orange-600" />
              <SortableHead label="Envío" sortKey="envio_costo" className="text-blue-600" />
              <SortableHead label="Neto Recibido" sortKey="neto_teorico" className="text-white bg-slate-900 px-4" />
              <SortableHead label="Ganancia Neta" sortKey="ganancia_neta" className="text-white bg-green-700 px-4" />
              <SortableHead label="Ganancia %" sortKey="ganancia_porcentaje" className="text-white bg-green-800 px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => {
              const id = getItemId(item);
              const isSimulated = overrides[id] !== undefined;
              const isChecked = selectedIds?.has(item.item_id) ?? false;
              const isQualifying = qualifyingIds?.has(item.item_id) ?? false;

              return (
                <TableRow
                  key={`${id}-${index}`}
                  className={cn(
                    "transition-colors border-slate-100 text-[11px]",
                    isChecked && isQualifying
                      ? "bg-violet-50/40 hover:bg-violet-50/70"
                      : isSimulated
                      ? "bg-amber-50/30 hover:bg-amber-50/60"
                      : "bg-white hover:bg-slate-50/80"
                  )}
                >
                  {hasSelection && (
                    <TableCell className="w-8 pr-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle?.(item.item_id)}
                        className="h-4 w-4 rounded border-slate-300 accent-violet-600 cursor-pointer"
                        title={isQualifying ? "Incluir en optimización" : "No califica (ganancia ≤70%)"}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-slate-800 truncate max-w-[280px]">{item.nombre}</span>
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
                  <TableCell className="text-center font-bold text-indigo-700">
                    {item.ventas_30d > 0 ? item.ventas_30d : <span className="text-slate-300">-</span>}
                  </TableCell>
                  <TableCell className="text-right text-slate-400 line-through">
                    ${item.precio_original.toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-400">
                    {item.desc_pct_ml ? `${item.desc_pct_ml.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-amber-600">
                    <div className="flex justify-end items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        className="h-6 w-14 text-right text-[11px] px-1 font-bold text-amber-600 border-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500 bg-white"
                        value={overrides[id]?.desc_pct_nuestro !== undefined ? overrides[id].desc_pct_nuestro : (item.desc_pct_nuestro?.toFixed(1) || 0)}
                        onChange={(e) => handleOverride(id, "desc_pct_nuestro", e.target.value)}
                      />
                      <span>%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-500">
                    ${item.precio_final.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900 bg-slate-50">
                    ${item.precio_final_nuestro.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right font-bold bg-violet-50">
                    {ajustesMap?.has(item.item_id) ? (
                      <span className="text-violet-700">
                        ${ajustesMap.get(item.item_id)!.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-600 bg-slate-100">
                    <div className="flex justify-end items-center gap-1">
                      <span className="text-slate-400">$</span>
                      <Input
                        type="number"
                        className="h-6 w-16 text-right text-[11px] px-1 font-bold text-slate-700 border-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500 bg-white"
                        value={overrides[id]?.costo_total !== undefined ? overrides[id].costo_total : Math.round(item.costo_total)}
                        onChange={(e) => handleOverride(id, "costo_total", e.target.value)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-red-600 font-bold">
                    {item.comision_pct?.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right text-orange-600 font-bold">
                    {item.impuesto_pct?.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right text-blue-600 font-medium">
                    {item.envio_costo > 0 ? `$${item.envio_costo.toLocaleString("es-AR")}` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-bold px-4 text-slate-900 bg-slate-50 border-l border-slate-200">
                    ${item.neto_teorico.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-right font-black px-4 border-l text-green-700 bg-green-50/30">
                    ${item.ganancia_neta.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
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
