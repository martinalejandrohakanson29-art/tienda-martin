"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Loader2, Percent, DollarSign, TrendingUp, Info, PieChart as PieIcon,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { obtenerComparativaMensual } from "@/app/actions/metricas-historico";
import { CANALES, type Canal, type MesComparativa } from "@/lib/metricas/comparativa-tipos";

const COLORES: Record<string, string> = {
  MercadoLibre: "#FACC15", // amarillo ML
  Mostrador: "#3B82F6",    // azul
  Instagram: "#E1306C",    // rosa instagram
  Mayorista: "#22C55E",    // verde
  Resto: "#64748B",        // gris azulado (agrupación ML vs Resto)
};
const colorDe = (key: string) => COLORES[key] ?? "#94A3B8";

type Metrica = "mix" | "monto";
type Vista = "canal" | "mlvsresto";

const fmtPeso = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);
const fmtPesoCorto = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// Tooltip que muestra monto y % de cada serie del mes (sirve para "por canal" y "ML vs Resto")
function TooltipMes({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const fila: MesComparativa = row?.__fila;
  const canales: Record<string, number> = row?.__canales ?? {};
  if (!fila) return null;
  const ordenados = Object.entries(canales)
    .map(([key, monto]) => ({ key, monto: monto as number }))
    .filter(x => x.monto > 0)
    .sort((a, b) => b.monto - a.monto);
  // Total de las series visibles (no del mes completo): así el % y el total
  // reflejan solo los canales seleccionados.
  const totalVisible = ordenados.reduce((s, x) => s + x.monto, 0) || 1;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className="font-bold text-slate-800">{label}</span>
        {fila.origen === "nuevo" && (
          <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Sistema nuevo</span>
        )}
      </div>
      {ordenados.map(({ key, monto }) => (
        <div key={key} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDe(key) }} />
          <span className="text-slate-600 flex-1">{key}</span>
          <span className="font-semibold text-slate-800 tabular-nums">{fmtPeso(monto)}</span>
          <span className="text-slate-400 tabular-nums w-12 text-right">{fmtPct((monto / totalVisible) * 100)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-slate-100">
        <span className="font-bold text-slate-500">Total</span>
        <span className="font-black text-slate-900 tabular-nums">{fmtPeso(totalVisible)}</span>
      </div>
    </div>
  );
}

function Panel({ titulo, icono: Icono, children, derecha }: {
  titulo: string; icono: React.ElementType; children: React.ReactNode; derecha?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <Icono className="h-4 w-4 text-slate-400" />
        <h3 className="font-bold text-sm text-slate-700">{titulo}</h3>
        {derecha && <div className="ml-auto">{derecha}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function ComparativaMensualTab() {
  const [filas, setFilas] = useState<MesComparativa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metrica, setMetrica] = useState<Metrica>("mix");
  const [vista, setVista] = useState<Vista>("canal");
  const [lineaMetrica, setLineaMetrica] = useState<"pct" | "monto">("pct");
  const [pieMetrica, setPieMetrica] = useState<"pct" | "monto">("pct");
  const [canalesActivos, setCanalesActivos] = useState<Canal[]>([...CANALES]);
  const [anioDesde, setAnioDesde] = useState<number | null>(null);
  const [anioHasta, setAnioHasta] = useState<number | null>(null);
  const [mesPieClave, setMesPieClave] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await obtenerComparativaMensual();
      if (res.success && res.data) {
        setFilas(res.data);
        const anios = res.data.map(f => f.anio);
        const maxAnio = Math.max(...anios);
        setAnioDesde(Math.min(...anios));
        setAnioHasta(maxAnio);
        setMesPieClave(res.data[res.data.length - 1]?.clave ?? null);
      } else {
        setError((res as any).error ?? "Error al cargar");
      }
      setLoading(false);
    })();
  }, []);

  const aniosDisponibles = useMemo(
    () => [...new Set(filas.map(f => f.anio))].sort((a, b) => a - b),
    [filas]
  );

  const filasFiltradas = useMemo(() => {
    if (anioDesde === null || anioHasta === null) return filas;
    return filas.filter(f => f.anio >= anioDesde && f.anio <= anioHasta);
  }, [filas, anioDesde, anioHasta]);

  const toggleCanal = (c: Canal) =>
    setCanalesActivos(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  // Series a graficar según la agrupación elegida.
  // - "canal": un trazo por cada canal activo.
  // - "mlvsresto": solo dos trazos, MercadoLibre vs todo lo demás.
  const seriesActivas: string[] = useMemo(
    () => vista === "mlvsresto" ? ["MercadoLibre", "Resto"] : canalesActivos,
    [vista, canalesActivos]
  );

  // Importes por serie de un mes, según la agrupación.
  const canalesVista = (f: MesComparativa): Record<string, number> => {
    if (vista === "mlvsresto") {
      return { MercadoLibre: f.canales.MercadoLibre, Resto: f.total - f.canales.MercadoLibre };
    }
    const r: Record<string, number> = {};
    for (const c of canalesActivos) r[c] = f.canales[c];
    return r;
  };

  // Datos para gráficos: cada fila aplana las series activas como keys de nivel superior.
  // En modo "mix" guardamos el % de cada serie; en "monto" el importe. Adjuntamos
  // __canales (importes de la vista) y __fila para el tooltip.
  const chartData = useMemo(() => {
    return filasFiltradas.map(f => {
      const cv = canalesVista(f);
      const totalActivo = Object.values(cv).reduce((s, n) => s + n, 0) || 1;
      const row: any = { label: f.label, clave: f.clave, __fila: f, __canales: cv };
      for (const k of seriesActivas) {
        row[k] = metrica === "mix" ? (cv[k] / totalActivo) * 100 : cv[k];
      }
      return row;
    });
  }, [filasFiltradas, seriesActivas, metrica, vista, canalesActivos]);

  // Serie temporal del gráfico de líneas: share % o monto según el toggle propio.
  const shareData = useMemo(() => {
    return filasFiltradas.map(f => {
      const cv = canalesVista(f);
      const totalActivo = Object.values(cv).reduce((s, n) => s + n, 0) || 1;
      const row: any = { label: f.label, __fila: f, __canales: cv };
      for (const k of seriesActivas) {
        row[k] = lineaMetrica === "pct" ? (cv[k] / totalActivo) * 100 : cv[k];
      }
      return row;
    });
  }, [filasFiltradas, seriesActivas, vista, canalesActivos, lineaMetrica]);

  const filaPie = useMemo(
    () => filasFiltradas.find(f => f.clave === mesPieClave) ?? filasFiltradas[filasFiltradas.length - 1],
    [filasFiltradas, mesPieClave]
  );

  const pieData = useMemo(() => {
    if (!filaPie) return [];
    const cv = canalesVista(filaPie);
    return seriesActivas
      .map(k => ({ name: k, value: cv[k] }))
      .filter(x => x.value > 0);
  }, [filaPie, seriesActivas, vista, canalesActivos]);

  // Total de las porciones visibles (para que los % de la torta sumen 100)
  const pieTotal = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full gap-3 bg-slate-50/50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        <p className="text-slate-400 text-sm">Cargando histórico…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full gap-2 bg-slate-50/50">
        <p className="text-slate-700 font-semibold">{error}</p>
      </div>
    );
  }

  const barStackOffset = metrica === "mix" ? "expand" : "none";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">

      {/* Barra de controles */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">

          {/* Toggle métrica */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setMetrica("mix")}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all ${metrica === "mix" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
            >
              <Percent className="h-3.5 w-3.5" /> Mix %
            </button>
            <button
              onClick={() => setMetrica("monto")}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all ${metrica === "monto" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
            >
              <DollarSign className="h-3.5 w-3.5" /> Montos
            </button>
          </div>

          {/* Toggle agrupación */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setVista("canal")}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all ${vista === "canal" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
            >
              Por canal
            </button>
            <button
              onClick={() => setVista("mlvsresto")}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all ${vista === "mlvsresto" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500"}`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORES.MercadoLibre }} /> ML vs Resto
            </button>
          </div>

          {/* Rango de años */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Años</span>
            <select
              value={anioDesde ?? ""}
              onChange={e => setAnioDesde(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 text-xs px-2 bg-white"
            >
              {aniosDisponibles.map(a => <option key={a} value={a} disabled={anioHasta !== null && a > anioHasta}>{a}</option>)}
            </select>
            <span className="text-slate-300">→</span>
            <select
              value={anioHasta ?? ""}
              onChange={e => setAnioHasta(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 text-xs px-2 bg-white"
            >
              {aniosDisponibles.map(a => <option key={a} value={a} disabled={anioDesde !== null && a < anioDesde}>{a}</option>)}
            </select>
          </div>

          {/* Toggles de canales (solo en vista "por canal") */}
          {vista === "canal" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {CANALES.map(c => {
                const sel = canalesActivos.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCanal(c)}
                    className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-semibold transition-all ${sel ? "border-slate-300 text-slate-700 bg-white" : "border-slate-200 text-slate-300 bg-slate-50"}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sel ? COLORES[c] : "#CBD5E1" }} />
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {metrica === "monto" && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 h-8 font-medium ml-auto">
              <Info className="h-3.5 w-3.5" />
              Pesos nominales — la inflación distorsiona la comparación entre años
            </div>
          )}
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div className="flex-1 overflow-auto p-6 space-y-6 min-h-0">

        {/* Gráfico principal: barras apiladas */}
        <Panel
          titulo={`${metrica === "mix" ? "Composición de ventas (mix %)" : "Ventas (montos nominales)"} · ${vista === "mlvsresto" ? "MercadoLibre vs Resto" : "por canal"}`}
          icono={TrendingUp}
        >
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData} stackOffset={barStackOffset as any} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v) => metrica === "mix" ? `${Math.round(v * 100)}%` : fmtPesoCorto(v)}
              />
              <Tooltip content={<TooltipMes />} />
              {seriesActivas.map(k => (
                <Bar key={k} dataKey={k} stackId="a" fill={colorDe(k)} name={k} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Tendencia de share */}
          <div className="xl:col-span-2">
            <Panel
              titulo={`Evolución ${lineaMetrica === "pct" ? "del share (%)" : "de montos"} · ${vista === "mlvsresto" ? "MercadoLibre vs Resto" : "por canal"}`}
              icono={TrendingUp}
              derecha={
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setLineaMetrica("pct")}
                    className={`flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold transition-all ${lineaMetrica === "pct" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <Percent className="h-3 w-3" /> %
                  </button>
                  <button
                    onClick={() => setLineaMetrica("monto")}
                    className={`flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold transition-all ${lineaMetrica === "monto" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <DollarSign className="h-3 w-3" /> $
                  </button>
                </div>
              }
            >
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={shareData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={(v) => lineaMetrica === "pct" ? `${v}%` : fmtPesoCorto(Number(v))}
                    domain={lineaMetrica === "pct" ? [0, 100] : [0, "auto"]}
                  />
                  <Tooltip formatter={(v: any) => lineaMetrica === "pct" ? fmtPct(Number(v)) : fmtPeso(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                  {seriesActivas.map(k => (
                    <Line key={k} type="monotone" dataKey={k} stroke={colorDe(k)} strokeWidth={2} dot={false} name={k} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Torta de un mes */}
          <Panel
            titulo="Mix de un mes"
            icono={PieIcon}
            derecha={
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setPieMetrica("pct")}
                    className={`flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold transition-all ${pieMetrica === "pct" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <Percent className="h-3 w-3" /> %
                  </button>
                  <button
                    onClick={() => setPieMetrica("monto")}
                    className={`flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold transition-all ${pieMetrica === "monto" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <DollarSign className="h-3 w-3" /> $
                  </button>
                </div>
                <select
                  value={mesPieClave ?? ""}
                  onChange={e => setMesPieClave(e.target.value)}
                  className="h-7 rounded-lg border border-slate-200 text-xs px-2 bg-white"
                >
                  {filasFiltradas.map(f => <option key={f.clave} value={f.clave}>{f.label}</option>)}
                </select>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={45}
                  paddingAngle={2}
                  label={(e: any) => pieMetrica === "pct"
                    ? fmtPct((e.value / (pieTotal || 1)) * 100)
                    : fmtPesoCorto(e.value)}
                  labelLine={false}
                >
                  {pieData.map(d => <Cell key={d.name} fill={colorDe(d.name)} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtPeso(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            {filaPie && (
              <p className="text-center text-xs text-slate-400 mt-1">
                Total {filaPie.label}: <span className="font-bold text-slate-600">{fmtPeso(filaPie.total)}</span>
              </p>
            )}
          </Panel>
        </div>

        <p className="text-[11px] text-slate-400 text-center pb-2">
          Histórico (sistema viejo) hasta abr-26 + sistema nuevo desde ahí · cuentas contables (notas de crédito, costos, flete) excluidas
        </p>
      </div>
    </div>
  );
}
