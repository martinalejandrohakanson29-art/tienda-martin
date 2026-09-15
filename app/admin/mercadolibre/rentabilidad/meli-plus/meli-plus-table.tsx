"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandidatoMeliPlus } from "@/app/actions/meli-plus";

type SortKey = keyof CandidatoMeliPlus;

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function MeliPlusTable({ data }: { data: CandidatoMeliPlus[] }) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ganancia_sugerida_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!filter.trim()) return data;
    const f = filter.toLowerCase();
    return data.filter(
      (d) => d.nombre.toLowerCase().includes(f) || d.item_id.toLowerCase().includes(f)
    );
  }, [data, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const enPerdida = data.filter((d) => d.ganancia_sugerida_pct < 0).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 pb-3 flex-none">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar publicación o MLA..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="text-sm text-slate-500 flex items-center gap-3">
          <span>{data.length} candidatos a Meli+</span>
          {enPerdida > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <TriangleAlert className="h-3.5 w-3.5" />
              {enPerdida} con pérdida al precio sugerido
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-slate-200 rounded-lg bg-white min-h-0">
        <Table>
          <TableHeader className="sticky top-0 bg-slate-50 z-10">
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("nombre")}
              >
                <div className="flex items-center gap-1">Publicación <SortIcon col="nombre" /></div>
              </TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead
                className="text-right cursor-pointer select-none"
                onClick={() => handleSort("ganancia_actual_pct")}
              >
                <div className="flex items-center justify-end gap-1">Rentabilidad hoy <SortIcon col="ganancia_actual_pct" /></div>
              </TableHead>
              <TableHead className="text-right">Precio sugerido Meli+</TableHead>
              <TableHead
                className="text-right cursor-pointer select-none"
                onClick={() => handleSort("ganancia_sugerida_pct")}
              >
                <div className="flex items-center justify-end gap-1">Rentabilidad con Meli+ <SortIcon col="ganancia_sugerida_pct" /></div>
              </TableHead>
              <TableHead className="text-right">Rentabilidad al máx. descuento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item) => (
              <TableRow key={`${item.item_id}-${item.variation_id || ""}`}>
                <TableCell className="max-w-xs">
                  <div className="font-medium text-sm text-slate-900 truncate">{item.nombre}</div>
                  <div className="text-xs text-slate-400">
                    {item.item_id}
                    {item.nombre_variante ? ` · ${item.nombre_variante}` : ""}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-slate-600">{money(item.costo_total)}</TableCell>
                <TableCell className="text-right text-sm">
                  <div>{money(item.ganancia_actual)}</div>
                  <div className={cn("text-xs", item.ganancia_actual_pct >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {pct(item.ganancia_actual_pct)}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-slate-600">{money(item.precio_sugerido)}</TableCell>
                <TableCell className="text-right text-sm">
                  <div className={cn("font-medium", item.ganancia_sugerida_pct >= 0 ? "text-emerald-700" : "text-red-700")}>
                    {money(item.ganancia_sugerida)}
                  </div>
                  <div className={cn("text-xs", item.ganancia_sugerida_pct >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {pct(item.ganancia_sugerida_pct)}
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs text-slate-500">
                  {money(item.ganancia_min_descuento)} ({pct(item.ganancia_min_descuento_pct)})
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400 py-10">
                  No hay candidatos cargados todavía.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
