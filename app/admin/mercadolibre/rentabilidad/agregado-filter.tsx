"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, X, Filter, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Agregado {
  id_articulo: string;
  nombre_articulo: string;
  mlas: string[];
}

interface Props {
  agregados: Agregado[];
  selected: string[]; // id_articulo seleccionados
  onChange: (selected: string[]) => void;
}

export default function AgregadoFilter({ agregados, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click afuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matches = useMemo(() => {
    const term = search.toLowerCase().trim();
    const list = term
      ? agregados.filter(
          (a) =>
            a.nombre_articulo.toLowerCase().includes(term) ||
            a.id_articulo.toLowerCase().includes(term)
        )
      : agregados;
    // Mostramos primero los seleccionados, luego el resto
    return [...list]
      .sort((a, b) => Number(selectedSet.has(b.id_articulo)) - Number(selectedSet.has(a.id_articulo)))
      .slice(0, 80);
  }, [search, agregados, selectedSet]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectedAgregados = useMemo(
    () => agregados.filter((a) => selectedSet.has(a.id_articulo)),
    [agregados, selectedSet]
  );

  return (
    <div className="relative w-full sm:w-auto" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors w-full sm:w-auto justify-between",
          selected.length > 0
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        )}
      >
        <span className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          {selected.length > 0
            ? `${selected.length} agregado${selected.length !== 1 ? "s" : ""}`
            : "Filtrar por agregado"}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-80 sm:w-96 right-0 sm:left-0 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                placeholder="Escribí un agregado (ej: cigüeñal)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9 bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
              />
            </div>
          </div>

          {selected.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50/60 border-b border-amber-100">
              <span className="text-[11px] font-semibold text-amber-700">
                {selected.length} seleccionado{selected.length !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
              >
                Limpiar
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-auto">
            {matches.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Sin coincidencias</p>
            ) : (
              matches.map((a) => {
                const isSel = selectedSet.has(a.id_articulo);
                return (
                  <button
                    key={a.id_articulo}
                    type="button"
                    onClick={() => toggle(a.id_articulo)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-slate-50 transition-colors",
                      isSel ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                        isSel ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300"
                      )}
                    >
                      {isSel && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-semibold text-slate-700 truncate">
                        {a.nombre_articulo}
                      </span>
                      <span className="block text-[9px] font-mono text-slate-400">
                        {a.id_articulo} · {a.mlas.length} publicación{a.mlas.length !== 1 ? "es" : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Chips de agregados seleccionados */}
      {selectedAgregados.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedAgregados.map((a) => (
            <span
              key={a.id_articulo}
              className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full"
            >
              {a.nombre_articulo}
              <button
                type="button"
                onClick={() => toggle(a.id_articulo)}
                className="hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
