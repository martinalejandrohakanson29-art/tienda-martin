"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, X, RefreshCw, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import AgregadoFilter, { type Agregado } from "../rentabilidad/agregado-filter";
import type { PublicacionEstado } from "@/app/actions/estado-publicaciones";
import EstadoToggleButton from "./estado-toggle-button";
import StockDepositoCell from "./stock-deposito-cell";

type FiltroEstado = "todos" | "active" | "paused";

type SortKey =
  | "title"
  | "status"
  | "ventas_30d"
  | "price"
  | "stock_deposito"
  | "stock_full"
  | "sold_quantity";

interface Props {
  data: PublicacionEstado[];
  agregados: Agregado[];
  loading: boolean;
  onRefresh: () => void;
  onEstadoActualizado: (itemId: string, nuevoEstado: string) => void;
  onStockActualizado: (itemId: string, variationId: string | null, nuevoStock: number) => void;
}

export default function PublicacionesEstadoTable({
  data,
  agregados,
  loading,
  onRefresh,
  onEstadoActualizado,
  onStockActualizado,
}: Props) {
  const [filter, setFilter] = useState("");
  const [selectedAgregados, setSelectedAgregados] = useState<string[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  // MLAs permitidos según los agregados elegidos (unión). null = sin filtro de agregado.
  const allowedMlas = useMemo(() => {
    if (selectedAgregados.length === 0) return null;
    const sel = new Set(selectedAgregados);
    const mlas = new Set<string>();
    for (const a of agregados) {
      if (sel.has(a.id_articulo)) a.mlas.forEach((m) => mlas.add(m));
    }
    return mlas;
  }, [selectedAgregados, agregados]);

  const filteredData = useMemo(() => {
    const searchLower = filter.toLowerCase().trim();
    return data.filter((item) => {
      if (filtroEstado !== "todos" && item.status !== filtroEstado) return false;
      if (allowedMlas && !allowedMlas.has((item.item_id || "").trim())) return false;
      return (
        (item.title || "").toLowerCase().includes(searchLower) ||
        (item.item_id || "").toLowerCase().includes(searchLower) ||
        (item.variant_label || "").toLowerCase().includes(searchLower)
      );
    });
  }, [data, filter, filtroEstado, allowedMlas]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    const { key, direction } = sortConfig;
    const factor = direction === "asc" ? 1 : -1;
    return [...filteredData].sort((a, b) => {
      if (key === "title" || key === "status") {
        return factor * (a[key] || "").localeCompare(b[key] || "", "es");
      }
      // stock_full / stock_deposito pueden ser null: los tratamos como el valor más bajo
      const aVal = key === "stock_full" || key === "stock_deposito" ? a[key] ?? -1 : a[key];
      const bVal = key === "stock_full" || key === "stock_deposito" ? b[key] ?? -1 : b[key];
      return factor * (aVal - bVal);
    });
  }, [filteredData, sortConfig]);

  const SortableHead = ({
    label,
    sortKey,
    className,
    justify = "end",
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
    justify?: "start" | "center" | "end";
  }) => (
    <TableHead
      className={cn("cursor-pointer hover:bg-slate-200 transition-colors select-none", className)}
      onClick={() => handleSort(sortKey)}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          justify === "start" ? "justify-start" : justify === "center" ? "justify-center" : "justify-end"
        )}
      >
        {label}
        {sortConfig?.key === sortKey ? (
          sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </div>
    </TableHead>
  );

  const EstadoTab = ({ value, label }: { value: FiltroEstado; label: string }) => (
    <button
      type="button"
      onClick={() => setFiltroEstado(value)}
      className={cn(
        "h-9 px-3 rounded-md border text-sm font-medium transition-colors whitespace-nowrap",
        filtroEstado === value
          ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 items-start w-full sm:w-auto">
            <div className="relative w-full sm:max-w-md sm:min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por título o MLA..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10 pr-8 bg-slate-50 border-slate-200 focus-visible:ring-fuchsia-500"
              />
              {filter && (
                <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {agregados.length > 0 && (
              <AgregadoFilter
                agregados={agregados}
                selected={selectedAgregados}
                onChange={setSelectedAgregados}
              />
            )}
            <div className="flex items-center gap-1.5">
              <EstadoTab value="todos" label="Todos" />
              <EstadoTab value="active" label="Activas" />
              <EstadoTab value="paused" label="Pausadas" />
            </div>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 h-9 px-3 rounded-md border border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
            <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
              {filteredData.length} publicaciones
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b shadow-sm">
            <TableRow>
              <SortableHead label="Publicación" sortKey="title" justify="start" className="min-w-[300px] font-bold text-slate-700 text-[11px]" />
              <SortableHead label="Estado" sortKey="status" justify="center" className="font-bold text-slate-700 text-[11px]" />
              <SortableHead label="Ventas 30d" sortKey="ventas_30d" justify="center" className="font-bold text-indigo-600 text-[11px]" />
              <SortableHead label="Precio" sortKey="price" className="font-bold text-slate-700 text-[11px]" />
              <SortableHead label="Stock" sortKey="stock_deposito" className="font-bold text-slate-700 text-[11px]" />
              <SortableHead label="Stock Full" sortKey="stock_full" className="font-bold text-cyan-700 text-[11px]" />
              <SortableHead label="Vendidos" sortKey="sold_quantity" className="font-bold text-slate-500 text-[11px]" />
              <TableHead className="text-center font-bold text-slate-700 text-[11px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow
                key={`${item.item_id}-${item.variation_id ?? "base"}`}
                className="transition-colors border-slate-100 text-[11px] bg-white hover:bg-slate-50/80"
              >
                <TableCell>
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold text-slate-800 truncate max-w-[320px]" title={item.title}>
                      {item.title}
                    </span>
                    {item.variant_label && (
                      <span className="inline-flex w-fit items-center px-1.5 py-0.5 mt-0.5 rounded bg-fuchsia-50 text-fuchsia-700 text-[9px] font-semibold">
                        {item.variant_label}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-mono text-slate-400">{item.item_id}</span>
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-blue-500 hover:text-blue-700 inline-flex items-center gap-0.5"
                        >
                          Ver en ML <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      item.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : item.status === "paused"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {item.status === "active" ? "Activa" : item.status === "paused" ? "Pausada" : item.status}
                  </span>
                </TableCell>
                <TableCell className="text-center font-bold text-indigo-700">
                  {item.ventas_30d > 0 ? item.ventas_30d : <span className="text-slate-300">-</span>}
                </TableCell>
                <TableCell className="text-right font-medium text-slate-700">
                  ${item.price.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="text-right text-slate-600">
                  <StockDepositoCell
                    itemId={item.item_id}
                    variationId={item.variation_id}
                    userProductId={item.user_product_id}
                    stock={item.stock_deposito ?? item.available_quantity}
                    editable={item.stock_deposito !== null}
                    onUpdated={onStockActualizado}
                  />
                </TableCell>
                <TableCell className="text-right font-bold text-cyan-700">
                  {item.stock_full !== null ? item.stock_full : <span className="text-slate-300 font-normal">-</span>}
                </TableCell>
                <TableCell className="text-right text-slate-400">{item.sold_quantity}</TableCell>
                <TableCell className="text-center">
                  <EstadoToggleButton
                    itemId={item.item_id}
                    status={item.status}
                    onUpdated={onEstadoActualizado}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
