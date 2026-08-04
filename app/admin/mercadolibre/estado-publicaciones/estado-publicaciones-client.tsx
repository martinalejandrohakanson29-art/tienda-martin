"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { RefreshCw, Loader2, List, Scale } from "lucide-react";
import {
  getEstadoPublicacionesML,
  type PublicacionEstado,
} from "@/app/actions/estado-publicaciones";
import type { Agregado } from "../rentabilidad/agregado-filter";
import { cn } from "@/lib/utils";
import PublicacionesEstadoTable from "./publicaciones-estado-table";
import StockComparativaTable from "./stock-comparativa-table";

type Vista = "publicaciones" | "stock";

export default function EstadoPublicacionesClient({ agregados }: { agregados: Agregado[] }) {
  const [items, setItems] = useState<PublicacionEstado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [vista, setVista] = useState<Vista>("publicaciones");

  const cargar = useCallback(async (silencioso = false) => {
    setLoading(true);
    setError(null);
    if (!silencioso) toast.info("Consultando publicaciones en Mercado Libre... puede tardar unos segundos.");

    const result = await getEstadoPublicacionesML();
    if (result.success) {
      setItems(result.data);
      if (!silencioso) toast.success(`${result.data.length} publicaciones cargadas.`);
    } else {
      setError(result.error || "No se pudo obtener el estado de las publicaciones.");
      toast.error(result.error || "Error al conectar con n8n.");
    }
    setLoading(false);
    setLoadedOnce(true);
  }, []);

  useEffect(() => {
    cargar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEstadoActualizado = useCallback((itemId: string, nuevoEstado: string) => {
    setItems((prev) => prev.map((it) => (it.item_id === itemId ? { ...it, status: nuevoEstado } : it)));
  }, []);

  const handleStockActualizado = useCallback((itemId: string, variationId: string | null, nuevoStock: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.item_id === itemId && it.variation_id === variationId ? { ...it, stock_deposito: nuevoStock } : it
      )
    );
  }, []);

  const activas = useMemo(() => items.filter((i) => i.status === "active").length, [items]);
  const pausadas = useMemo(() => items.filter((i) => i.status === "paused").length, [items]);

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid gap-4 md:grid-cols-3 flex-none">
        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Publicaciones</p>
          <p className="text-2xl font-bold text-slate-900">{items.length}</p>
        </div>
        <div className="p-4 bg-white border border-emerald-100 rounded-lg">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Activas</p>
          <p className="text-2xl font-bold text-slate-900">{activas}</p>
        </div>
        <div className="p-4 bg-white border border-amber-100 rounded-lg">
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">Pausadas</p>
          <p className="text-2xl font-bold text-slate-900">{pausadas}</p>
        </div>
      </div>

      {!loadedOnce || items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-white rounded-xl border border-slate-200">
          {loading ? (
            <>
              <Loader2 className="h-8 w-8 text-fuchsia-600 animate-spin" />
              <p className="text-sm text-slate-500">Consultando publicaciones en Mercado Libre...</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">{error || "No hay publicaciones cargadas."}</p>
              <button
                type="button"
                onClick={() => cargar()}
                className="flex items-center gap-2 h-9 px-4 rounded-md bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-medium"
              >
                <RefreshCw className="h-4 w-4" />
                Cargar publicaciones
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-none">
            <button
              type="button"
              onClick={() => setVista("publicaciones")}
              className={cn(
                "flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors",
                vista === "publicaciones"
                  ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <List className="h-4 w-4" />
              Publicaciones
            </button>
            <button
              type="button"
              onClick={() => setVista("stock")}
              className={cn(
                "flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors",
                vista === "stock"
                  ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Scale className="h-4 w-4" />
              Comparar Stock
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {vista === "publicaciones" ? (
              <PublicacionesEstadoTable
                data={items}
                agregados={agregados}
                loading={loading}
                onRefresh={() => cargar()}
                onEstadoActualizado={handleEstadoActualizado}
                onStockActualizado={handleStockActualizado}
              />
            ) : (
              <StockComparativaTable data={items} agregados={agregados} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
