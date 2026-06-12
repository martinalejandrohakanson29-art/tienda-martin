"use client";

import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  XCircle, HelpCircle, Loader2, RefreshCw, Search, ChevronDown, ExternalLink,
} from "lucide-react";
import { conciliarConArca, TIPO_LABEL } from "@/app/actions/conciliacion-arca";
import type { FilaConciliacion, ResultadoConciliacion } from "@/app/actions/conciliacion-arca";

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtPeso = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(v);

const fmtFecha = (s: string) => {
  if (!s) return "-";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

// ── Tipos de filtro ────────────────────────────────────────────────────────────

type Filtro = "todos" | "match_ok" | "discrepancia_monto" | "solo_arca" | "solo_bd";

// ── Config por categoría ───────────────────────────────────────────────────────

const CFG: Record<
  Filtro,
  { label: string; icon: React.ReactNode; color: string; badge: string; ring: string }
> = {
  todos: {
    label: "Todos",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    color: "text-slate-700",
    badge: "bg-slate-100 text-slate-700",
    ring: "ring-slate-200",
  },
  match_ok: {
    label: "Coincidentes",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ring: "ring-emerald-200",
  },
  discrepancia_monto: {
    label: "Discrepancia de monto",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    ring: "ring-amber-200",
  },
  solo_arca: {
    label: "Solo en ARCA",
    icon: <HelpCircle className="h-4 w-4" />,
    color: "text-blue-700",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    ring: "ring-blue-200",
  },
  solo_bd: {
    label: "Solo en BD",
    icon: <XCircle className="h-4 w-4" />,
    color: "text-rose-700",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    ring: "ring-rose-200",
  },
};

// ── Componente principal ───────────────────────────────────────────────────────

export default function ConciliacionArcaTab() {
  const [estado, setEstado] = useState<"idle" | "loading" | "done">("idle");
  const [resultado, setResultado] = useState<ResultadoConciliacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Upload ───────────────────────────────────────────────────────────────────

  const procesarArchivo = useCallback(async (file: File) => {
    setEstado("loading");
    setError(null);
    setArchivoNombre(file.name);
    const fd = new FormData();
    fd.append("file", file);
    const res = await conciliarConArca(fd);
    if (res.success) {
      setResultado(res.resultado);
      setEstado("done");
      setFiltro("todos");
      setBusqueda("");
    } else {
      setError(res.error);
      setEstado("idle");
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) procesarArchivo(f);
    e.target.value = "";
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) procesarArchivo(f);
    },
    [procesarArchivo]
  );

  // ── Filas filtradas ──────────────────────────────────────────────────────────

  const filasFiltradas = resultado
    ? resultado.filas.filter((f) => {
        const pasa = filtro === "todos" || f.tipo === filtro;
        if (!pasa) return false;
        if (!busqueda.trim()) return true;
        const q = busqueda.toLowerCase();
        const cae = f.tipo === "solo_bd" ? f.db.cae : f.arca.cae;
        const cliente = f.tipo === "solo_bd" ? f.db.cliente : f.arca.denominacion;
        const nroVenta = f.tipo !== "solo_arca" ? String(f.db.numeroVenta ?? "") : "";
        return (
          cae.includes(q) ||
          cliente.toLowerCase().includes(q) ||
          nroVenta.includes(q)
        );
      })
    : [];

  // ── Render: estado inicial ───────────────────────────────────────────────────

  if (estado === "idle" || estado === "loading") {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-8 gap-6">
        {/* Zona de drop */}
        <div
          className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all
            ${dragging ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50"}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {estado === "loading" ? (
            <>
              <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
              <p className="text-sm font-medium text-slate-600">Procesando <span className="text-violet-700">{archivoNombre}</span>…</p>
              <p className="text-xs text-slate-400">Cruzando con la base de datos</p>
            </>
          ) : (
            <>
              <div className="p-4 bg-violet-100 rounded-xl">
                <FileSpreadsheet className="h-8 w-8 text-violet-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700">
                  {dragging ? "Soltá el archivo aquí" : "Arrastrá el XLSX o hacé clic para seleccionar"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Archivo de comprobantes emitidos descargado desde ARCA · .xlsx / .xls / .csv</p>
              </div>
              <Button variant="outline" size="sm" className="pointer-events-none border-violet-200 text-violet-700">
                <Upload className="h-4 w-4 mr-2" /> Seleccionar archivo
              </Button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />

        {error && (
          <div className="w-full max-w-xl bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        {/* Instrucciones */}
        <div className="w-full max-w-xl bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-500 space-y-1.5">
          <p className="font-semibold text-slate-600">¿Cómo obtener el archivo?</p>
          <p>1. Ingresá a <span className="font-medium text-slate-700">ARCA → Comprobantes en línea → Consulta de comprobantes emitidos</span></p>
          <p>2. Filtrá por período y exportá como <span className="font-medium text-slate-700">CSV / Excel</span></p>
          <p>3. Subí ese archivo aquí. La conciliación cruza automáticamente por <span className="font-medium text-slate-700">CAE</span></p>
        </div>
      </div>
    );
  }

  // ── Render: resultados ───────────────────────────────────────────────────────

  const { stats, periodoArca } = resultado!;

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-800">Conciliación ARCA</h2>
            <p className="text-xs text-slate-400">
              Archivo: <span className="text-slate-600">{archivoNombre}</span> ·
              Período: <span className="text-slate-600">{fmtFecha(periodoArca.desde)} → {fmtFecha(periodoArca.hasta)}</span>
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => { setEstado("idle"); setResultado(null); setArchivoNombre(null); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Cargar otro archivo
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {(["match_ok", "discrepancia_monto", "solo_arca", "solo_bd"] as Filtro[]).map((k) => {
            const count =
              k === "match_ok" ? stats.matchOk :
              k === "discrepancia_monto" ? stats.discrepancias :
              k === "solo_arca" ? stats.soloArca : stats.soloDB;
            const cfg = CFG[k];
            const active = filtro === k;
            return (
              <button
                key={k}
                onClick={() => setFiltro(active ? "todos" : k)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm
                  ${active ? `ring-2 ${cfg.ring} border-transparent shadow-sm` : "border-slate-100 bg-white hover:border-slate-200"}`}
              >
                <div className={`flex items-center gap-2 mb-1 ${cfg.color}`}>
                  {cfg.icon}
                  <span className="text-xs font-medium">{cfg.label}</span>
                </div>
                <p className={`text-2xl font-black ${cfg.color}`}>{count}</p>
                <p className="text-[10px] text-slate-400">
                  {count > 0 ? `de ${filtro === k && k !== "solo_bd" ? stats.totalArca : (k === "solo_bd" ? stats.totalDB : stats.totalArca)} registros` : "sin diferencias"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Barra de filtros ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Buscar por CAE, cliente, N° venta…"
            className="pl-8 h-8 text-sm bg-slate-50 border-slate-100"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {(["todos", "match_ok", "discrepancia_monto", "solo_arca", "solo_bd"] as Filtro[]).map((k) => {
            const cfg = CFG[k];
            const active = filtro === k;
            return (
              <button
                key={k}
                onClick={() => setFiltro(k)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all
                  ${active ? `${cfg.badge} border-current` : "border-transparent text-slate-500 hover:bg-slate-100"}`}
              >
                {cfg.icon}
                {cfg.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 whitespace-nowrap">{filasFiltradas.length} registros</p>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────────── */}
      <div className="flex-grow overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 w-24">Estado</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">CAE</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Tipo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">N° Cbte</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Fecha ARCA</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Cliente / Receptor</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Total ARCA</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Total BD</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Diferencia</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">N° Venta</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-16 text-slate-400 text-sm">
                  No hay registros con el filtro seleccionado
                </td>
              </tr>
            )}
            {filasFiltradas.map((fila, idx) => {
              const isMatch = fila.tipo === "match_ok";
              const isDisc = fila.tipo === "discrepancia_monto";
              const isSoloArca = fila.tipo === "solo_arca";
              const isSoloBD = fila.tipo === "solo_bd";

              const arca = !isSoloBD ? fila.arca : null;
              const db = !isSoloArca ? fila.db : null;
              const diff = (isMatch || isDisc) ? (fila as any).diffMonto : null;

              const cae = arca?.cae ?? db!.cae;
              const tipo = arca?.tipo ?? db!.tipoComprobante ?? 0;
              const numeroCbte = arca?.numero ?? db!.facturaNumero ?? 0;
              const fechaArca = arca?.fecha ?? null;
              const cliente = arca?.denominacion || db?.cliente || "";
              const totalArca = arca?.total ?? null;
              const totalBD = db?.totalFinal ?? null;

              const rowBg =
                isMatch ? "hover:bg-emerald-50/40" :
                isDisc ? "bg-amber-50/40 hover:bg-amber-50/70" :
                isSoloArca ? "bg-blue-50/30 hover:bg-blue-50/60" :
                "bg-rose-50/30 hover:bg-rose-50/60";

              const cfg = CFG[fila.tipo];

              return (
                <tr key={idx} className={`border-b border-slate-50 transition-colors ${rowBg}`}>
                  {/* Estado */}
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                      {cfg.icon}
                      <span className="hidden sm:inline">{
                        isMatch ? "OK" :
                        isDisc ? "Monto" :
                        isSoloArca ? "ARCA" : "BD"
                      }</span>
                    </span>
                  </td>

                  {/* CAE */}
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{cae}</td>

                  {/* Tipo comprobante */}
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                    {TIPO_LABEL[tipo] ?? `Tipo ${tipo}`}
                  </td>

                  {/* N° comprobante */}
                  <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">
                    {numeroCbte ? `000${numeroCbte}`.slice(-8) : "-"}
                  </td>

                  {/* Fecha ARCA */}
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                    {fechaArca ? fmtFecha(fechaArca) : <span className="text-slate-300">-</span>}
                  </td>

                  {/* Cliente */}
                  <td className="px-4 py-2.5 text-xs text-slate-700 max-w-[200px] truncate" title={cliente}>
                    {cliente || <span className="text-slate-300">-</span>}
                  </td>

                  {/* Total ARCA */}
                  <td className="px-4 py-2.5 text-xs text-right font-mono text-slate-700">
                    {totalArca != null ? fmtPeso(totalArca) : <span className="text-slate-300">-</span>}
                  </td>

                  {/* Total BD */}
                  <td className="px-4 py-2.5 text-xs text-right font-mono text-slate-700">
                    {totalBD != null ? fmtPeso(totalBD) : <span className="text-slate-300">-</span>}
                  </td>

                  {/* Diferencia */}
                  <td className="px-4 py-2.5 text-xs text-right font-mono">
                    {diff != null ? (
                      <span className={diff > 0 ? "text-amber-600 font-semibold" : "text-emerald-600"}>
                        {diff > 0 ? `+${fmtPeso(diff)}` : "✓"}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>

                  {/* N° Venta BD */}
                  <td className="px-4 py-2.5 text-xs">
                    {db?.ventaId ? (
                      <a
                        href={`/admin/ventas-mostrador?venta=${db.ventaId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 hover:underline font-mono"
                      >
                        #{db.numeroVenta ?? "–"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer resumen ───────────────────────────────────────────────────── */}
      <div className="bg-slate-50 border-t border-slate-100 px-6 py-2 flex items-center gap-6 text-xs text-slate-500 flex-shrink-0">
        <span>ARCA: <strong className="text-slate-700">{stats.totalArca}</strong> comprobantes</span>
        <span>BD: <strong className="text-slate-700">{stats.totalDB}</strong> con CAE</span>
        <span className="text-emerald-600">✓ {stats.matchOk} coincidentes</span>
        {stats.discrepancias > 0 && <span className="text-amber-600">⚠ {stats.discrepancias} con discrepancia de monto</span>}
        {stats.soloArca > 0 && <span className="text-blue-600">? {stats.soloArca} solo en ARCA</span>}
        {stats.soloDB > 0 && <span className="text-rose-600">✕ {stats.soloDB} solo en BD</span>}
      </div>
    </div>
  );
}
