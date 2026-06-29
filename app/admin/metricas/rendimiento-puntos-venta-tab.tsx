"use client";

import React, { useState } from "react";
import { Loader2, RefreshCw, Check, Package, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obtenerRendimientoPorPuntoVenta } from "@/app/actions/ventas-mostrador";

interface PuntoVenta {
  id: string;
  nombre: string;
  color?: string | null;
}

interface ItemRanking {
  nombre: string;
  cantidad: number;
  monto: number;
  costo: number | null;
}

interface Props {
  puntosVenta: PuntoVenta[];
}

const fmtPeso = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);

const today = () => new Date().toISOString().split("T")[0];
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
};

function RankingTable({
  titulo,
  icono: Icono,
  color,
  items,
  loading,
}: {
  titulo: string;
  icono: React.ElementType;
  color: string;
  items: ItemRanking[];
  loading: boolean;
}) {
  const max = items[0]?.cantidad ?? 1;

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <div className={`px-5 py-4 border-b border-slate-100 flex items-center gap-2 ${color}`}>
        <Icono className="h-4 w-4" />
        <h3 className="font-bold text-sm">{titulo}</h3>
        {!loading && items.length > 0 && (
          <span className="ml-auto text-xs font-medium opacity-70">{items.length} ítems</span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          <p className="text-slate-400 text-sm">Calculando…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 gap-2">
          <Icono className="h-10 w-10 text-slate-200" />
          <p className="text-slate-400 text-sm">Sin datos para el período</p>
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-8">#</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Artículo</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-20">Cant.</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-24">Costo u.</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-28">Monto</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.nombre} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <div>
                      <p className="font-medium text-slate-800 leading-tight">{item.nombre}</p>
                      <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden w-full max-w-[160px]">
                        <div
                          className="h-1 rounded-full bg-current opacity-30"
                          style={{ width: `${(item.cantidad / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-slate-900">{item.cantidad}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-medium">
                    {typeof item.costo === "number" && Number.isFinite(item.costo) ? (
                      <span className="text-slate-500">{fmtPeso(item.costo)}</span>
                    ) : (
                      <span className="text-red-500 font-black" title="Sin costo cargado">✗</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs font-medium">{fmtPeso(item.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RendimientoPuntosVentaTab({ puntosVenta }: Props) {
  const [desde, setDesde] = useState(startOfMonth());
  const [hasta, setHasta] = useState(today());
  const [puntosSeleccionados, setPuntosSeleccionados] = useState<string[]>([]);
  const [articulos, setArticulos] = useState<ItemRanking[]>([]);
  const [packs, setPacks] = useState<ItemRanking[]>([]);
  const [totalVentas, setTotalVentas] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const togglePunto = (id: string) => {
    setPuntosSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await obtenerRendimientoPorPuntoVenta(
        desde,
        hasta,
        puntosSeleccionados.length > 0 ? puntosSeleccionados : undefined
      );
      if (res.success && res.data) {
        setArticulos(res.data.articulos);
        setPacks(res.data.packs);
        setTotalVentas(res.data.totalVentas);
        setCargado(true);
      } else {
        setError((res as any).error ?? "Error al cargar datos");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">

      {/* Barra de filtros */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-end gap-4">

          {/* Rango de fechas */}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Desde</Label>
              <Input
                type="date"
                value={desde}
                onChange={e => setDesde(e.target.value)}
                className="h-9 w-36 border-slate-200 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hasta</Label>
              <Input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                className="h-9 w-36 border-slate-200 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Puntos de venta */}
          {puntosVenta.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Punto de Venta <span className="text-slate-300 font-normal normal-case">(todos si no seleccionás)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {puntosVenta.map(pv => {
                  const sel = puntosSeleccionados.includes(pv.id);
                  return (
                    <button
                      key={pv.id}
                      type="button"
                      onClick={() => togglePunto(pv.id)}
                      className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-semibold transition-all ${
                        sel
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {sel && <Check className="h-3 w-3" />}
                      {pv.color && pv.color !== "#000000" && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sel ? "white" : pv.color }} />
                      )}
                      {pv.nombre}
                    </button>
                  );
                })}
                {puntosSeleccionados.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPuntosSeleccionados([])}
                    className="px-3 h-9 text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={cargar}
            disabled={loading}
            className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 font-semibold shadow-sm ml-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {cargado ? "Actualizar" : "Cargar"}
          </Button>
        </div>

        {/* Badge resumen */}
        {cargado && !loading && totalVentas !== null && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{totalVentas}</span> ventas en el período ·
            <span className="font-semibold text-slate-700">{articulos.length}</span> artículos distintos ·
            <span className="font-semibold text-slate-700">{packs.length}</span> packs distintos
          </div>
        )}
      </div>

      {/* Contenido */}
      {!cargado && !loading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <ShoppingBag className="h-10 w-10 text-blue-400" />
          </div>
          <p className="text-slate-700 font-semibold text-lg">Seleccioná un período y hacé clic en Cargar</p>
          <p className="text-slate-400 text-sm mt-1">Se mostrarán los artículos y packs más vendidos del período</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center">
          <p className="text-slate-700 font-semibold">{error}</p>
          <p className="text-slate-400 text-sm mt-1">Intentá nuevamente</p>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 p-6 flex-1 overflow-auto min-h-0">
          <RankingTable
            titulo="Artículos más vendidos"
            icono={ShoppingBag}
            color="text-blue-700 bg-blue-50"
            items={articulos}
            loading={loading}
          />
          <RankingTable
            titulo="Packs más vendidos"
            icono={Package}
            color="text-violet-700 bg-violet-50"
            items={packs}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}
