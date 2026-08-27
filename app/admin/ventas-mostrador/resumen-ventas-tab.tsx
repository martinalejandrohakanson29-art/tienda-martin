"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Sector, ComposedChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, BarChart2,
  RefreshCw, Calendar, Loader2, Receipt, Store, GitCompare, Minus, RotateCcw,
  Hash, Layers, Check, ChevronDown, Activity, Sparkles, X
} from "lucide-react";
import { obtenerResumenVentas } from "@/app/actions/ventas-mostrador";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface PuntoVentaDia {
  id: string | null;
  nombre: string;
  cantidad: number;
  neto: number;
  bruto: number;
  color: string;
}

interface DiaData {
  fecha: string;
  cantidad: number;
  bruto: number;
  neto: number;
  intereses: number;
  porPuntoVenta?: Record<string, PuntoVentaDia>;
}

interface ResumenData {
  kpis: {
    totalVentas: number;
    montoNeto: number;
    montoBrutoML: number;
    montoNetoML: number;
    ticketPromedio: number;
    facturadas: number;
    noFacturadas: number;
  };
  porDia: DiaData[];
  porMetodoPago: { metodo: string; cantidad: number; monto: number }[];
  porPuntoVenta: { id: string | null; nombre: string; cantidad: number; monto: number; color: string }[];
  topProductos: { nombre: string; cantidad: number; monto: number }[];
  porHora: { hora: number; cantidad: number; monto: number }[];
}

// ── Paleta de colores ──────────────────────────────────────────────────────────

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1", "#14b8a6", "#e11d48"];

const METODO_COLORS: Record<string, string> = {
  "Efectivo": "#10b981",
  "Tarjeta de Crédito": "#3b82f6",
  "Tarjeta de Débito": "#6366f1",
  "MercadoPago": "#06b6d4",
  "MercadoLibre": "#f59e0b",
  "Transferencia": "#8b5cf6",
  "Cruzada": "#f97316",
  "A Cuenta Corriente": "#ec4899",
  "Mixto": "#84cc16",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtPeso = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);

const fmtFecha = (str: string) => {
  if (!str) return "";
  const parts = str.split("-");
  if (parts.length < 3) return str;
  return `${parts[2]}/${parts[1]}`;
};

const fmtFechaConDia = (str: string) => {
  if (!str) return "";
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return str;
  const date = new Date(y, m - 1, d);
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dias[date.getDay()]} ${d} de ${meses[m - 1]}`;
};

const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
};
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

// Formato YYYY-MM-DD en hora local (evita el corrimiento de día de toISOString)
const fmtISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Rango equivalente inmediatamente anterior (misma cantidad de días, terminando el día previo a "desde")
const prevPeriod = (desde: string, hasta: string) => {
  const di = new Date(`${desde}T12:00:00`);
  const hi = new Date(`${hasta}T12:00:00`);
  const dias = Math.round((hi.getTime() - di.getTime()) / 86_400_000); // largo inclusivo - 1
  const bHasta = new Date(di); bHasta.setDate(bHasta.getDate() - 1);
  const bDesde = new Date(bHasta); bDesde.setDate(bDesde.getDate() - dias);
  return { desde: fmtISO(bDesde), hasta: fmtISO(bHasta) };
};

// ── Tooltip genérico con pesos ─────────────────────────────────────────────────

const PesoTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-bold text-slate-700 mb-2">{label}</p>
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
          <span className="text-slate-500">{e.name}:</span>
          <span className="font-semibold text-slate-800">
            {typeof e.value === "number" && e.name?.toLowerCase().includes("cant")
              ? e.value.toLocaleString("es-AR")
              : fmtPeso(e.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Indicador de variación (Δ) ──────────────────────────────────────────────────

function Delta({ current, prev, invert = false, className = "" }: {
  current: number; prev: number; invert?: boolean; className?: string;
}) {
  const noBase = prev === 0;
  const pct = noBase ? 0 : ((current - prev) / Math.abs(prev)) * 100;
  const up = pct > 0, down = pct < 0;
  const flat = noBase || (!up && !down);
  const good = invert ? down : up;
  const colorCls = flat ? "text-slate-400" : good ? "text-emerald-600" : "text-red-500";
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold ${colorCls} ${className || "text-[11px]"}`}>
      {flat ? <Minus className="h-3 w-3" /> : up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {noBase ? (current > 0 ? "nuevo" : "—") : `${up ? "+" : "−"}${Math.abs(pct).toFixed(0)}%`}
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color, badge, iconStyle, delta }: {
  icon: any; label: string; value: string; sub?: string; color: string; badge?: string; iconStyle?: React.CSSProperties; delta?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <div className={`p-2.5 rounded-xl ${color}`} style={iconStyle}>
          <Icon className="h-5 w-5" />
        </div>
        {badge && <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">{badge}</Badge>}
      </div>
      <div>
        <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5 leading-tight">{value}</p>
        {delta && <div className="mt-1.5">{delta}</div>}
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Custom Pie Label ───────────────────────────────────────────────────────────

const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ── Panel Card ─────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, className = "" }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 ${className}`}>
      <div>
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function ResumenVentasTab() {
  const [desde, setDesde] = useState(startOfMonth());
  const [hasta, setHasta] = useState(today());
  const [comparar, setComparar] = useState(false);
  const [desdeB, setDesdeB] = useState("");
  const [hastaB, setHastaB] = useState("");
  const [data, setData] = useState<ResumenData | null>(null);
  const [dataB, setDataB] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMetodoIndex, setActiveMetodoIndex] = useState<number | undefined>(undefined);

  const cargar = useCallback(async (
    d = desde, h = hasta,
    cmp = comparar, dB = desdeB, hB = hastaB,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const [resA, resB] = await Promise.all([
        obtenerResumenVentas(d, h),
        cmp && dB && hB ? obtenerResumenVentas(dB, hB) : Promise.resolve(null),
      ]);
      if (resA.success && resA.data) {
        setData(resA.data as ResumenData);
      } else {
        setError((resA as any).error || "Error al cargar datos");
      }
      if (cmp && resB && (resB as any).success && (resB as any).data) {
        setDataB((resB as any).data as ResumenData);
      } else {
        setDataB(null);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, comparar, desdeB, hastaB]);

  const preset = (label: string) => {
    let d = desde, h = today();
    if (label === "hoy") d = today();
    else if (label === "7d") d = daysAgo(6);
    else if (label === "30d") d = daysAgo(29);
    else if (label === "mes") d = startOfMonth();
    else if (label === "año") d = startOfYear();
    setDesde(d);
    setHasta(h);
    if (comparar) {
      const p = prevPeriod(d, h);
      setDesdeB(p.desde);
      setHastaB(p.hasta);
      cargar(d, h, true, p.desde, p.hasta);
    } else {
      cargar(d, h);
    }
  };

  // Activa/desactiva el segundo rango. Al activar, precarga el período anterior equivalente.
  const toggleComparar = () => {
    if (!comparar) {
      const p = prevPeriod(desde, hasta);
      setDesdeB(p.desde);
      setHastaB(p.hasta);
      setComparar(true);
      if (data) cargar(desde, hasta, true, p.desde, p.hasta);
    } else {
      setComparar(false);
      setDataB(null);
    }
  };

  const usarPeriodoAnterior = () => {
    const p = prevPeriod(desde, hasta);
    setDesdeB(p.desde);
    setHastaB(p.hasta);
  };

  const [pvsSeleccionados, setPvsSeleccionados] = useState<string[]>([]);
  const [isPvDropdownOpen, setIsPvDropdownOpen] = useState(false);
  const [metricaSeleccionada, setMetricaSeleccionada] = useState<"monto" | "cantidad" | "ambos">("monto");
  const [tipoGrafico, setTipoGrafico] = useState<"area" | "bar">("area");
  const [modoDesglose, setModoDesglose] = useState<"acumulado" | "desglosado">("acumulado");
  const pvDropdownRef = React.useRef<HTMLDivElement>(null);

  // Cerrar popover al hacer clic fuera
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pvDropdownRef.current && !pvDropdownRef.current.contains(event.target as Node)) {
        setIsPvDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mapa de colores por punto de venta
  const pvColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    data.porPuntoVenta.forEach((pv, idx) => {
      const color = pv.color && pv.color !== "#000000" ? pv.color : PALETTE[idx % PALETTE.length];
      map.set(pv.nombre, color);
    });
    return map;
  }, [data]);

  // Lista de puntos de venta activos según filtro (si está vacío, todos están activos)
  const pvsActivos = useMemo(() => {
    if (!data) return [];
    if (pvsSeleccionados.length === 0) {
      return data.porPuntoVenta.map((pv) => pv.nombre);
    }
    return pvsSeleccionados;
  }, [data, pvsSeleccionados]);

  // Handlers para selección múltiple de puntos de venta
  const togglePv = (nombre: string) => {
    if (pvsSeleccionados.length === 0) {
      // Si todos estaban activos y hace clic en uno, aísla ese uno
      setPvsSeleccionados([nombre]);
    } else if (pvsSeleccionados.includes(nombre)) {
      const nuevo = pvsSeleccionados.filter((n) => n !== nombre);
      setPvsSeleccionados(nuevo);
    } else {
      setPvsSeleccionados([...pvsSeleccionados, nombre]);
    }
  };

  const seleccionarTodosPv = () => {
    setPvsSeleccionados([]);
  };

  // ── Datasets derivados para comparación y gráfico interactivo ────────────────

  // Dataset para el gráfico de evolución por día (filtrable por 1 o más puntos de venta y métrica)
  const datasetGrafico = useMemo(() => {
    if (!data) return [];
    const a = data.porDia;
    const b = dataB?.porDia ?? [];
    const len = Math.max(a.length, b.length);

    return Array.from({ length: len }, (_, i) => {
      const diaA = a[i];
      const diaB = b[i];

      let montoA = 0;
      let brutoA = 0;
      let cantidadA = 0;
      let montoB: number | null = null;
      let cantidadB: number | null = null;

      const desglosesA: Record<string, { monto: number; cantidad: number; color: string }> = {};
      const multiSeriesProps: Record<string, number> = {};

      if (diaA) {
        for (const pvNombre of pvsActivos) {
          const pvData = diaA.porPuntoVenta?.[pvNombre];
          const m = pvData?.neto ?? 0;
          const br = pvData?.bruto ?? 0;
          const c = pvData?.cantidad ?? 0;
          montoA += m;
          brutoA += br;
          cantidadA += c;
          desglosesA[pvNombre] = {
            monto: m,
            cantidad: c,
            color: pvColorMap.get(pvNombre) || "#94a3b8",
          };
          multiSeriesProps[`pv_monto_${pvNombre}`] = m;
          multiSeriesProps[`pv_cant_${pvNombre}`] = c;
        }
      }

      if (diaB) {
        let sumMb = 0;
        let sumCb = 0;
        for (const pvNombre of pvsActivos) {
          const pvDataB = diaB.porPuntoVenta?.[pvNombre];
          sumMb += pvDataB ? pvDataB.neto : 0;
          sumCb += pvDataB ? pvDataB.cantidad : 0;
        }
        montoB = sumMb;
        cantidadB = sumCb;
      }

      const fechaRaw = diaA?.fecha || diaB?.fecha || "";
      const label = diaA ? fmtFecha(diaA.fecha) : diaB ? fmtFecha(diaB.fecha) : "";
      const ticketProm = cantidadA > 0 ? montoA / cantidadA : 0;

      return {
        fecha: fechaRaw,
        label,
        fechaB: diaB ? fmtFecha(diaB.fecha) : null,
        monto: montoA,
        bruto: brutoA,
        cantidad: cantidadA,
        ticketProm,
        montoB,
        cantidadB,
        puntosVentaDia: diaA?.porPuntoVenta || {},
        desglosesA,
        ...multiSeriesProps,
      };
    });
  }, [data, dataB, pvsActivos, pvColorMap]);

  // Resumen numérico rápido del gráfico según filtros activos
  const metricasGrafico = useMemo(() => {
    if (!datasetGrafico.length) return null;
    const totalMonto = datasetGrafico.reduce((s, d) => s + d.monto, 0);
    const totalCant = datasetGrafico.reduce((s, d) => s + d.cantidad, 0);
    const diasTotal = datasetGrafico.length;
    const promMontoDia = diasTotal > 0 ? totalMonto / diasTotal : 0;
    const promCantDia = diasTotal > 0 ? totalCant / diasTotal : 0;
    const ticketProm = totalCant > 0 ? totalMonto / totalCant : 0;

    let mejorDia = datasetGrafico[0];
    for (const d of datasetGrafico) {
      if (metricaSeleccionada === "cantidad") {
        if (d.cantidad > (mejorDia?.cantidad ?? 0)) mejorDia = d;
      } else {
        if (d.monto > (mejorDia?.monto ?? 0)) mejorDia = d;
      }
    }

    return {
      totalMonto,
      totalCant,
      promMontoDia,
      promCantDia,
      ticketProm,
      mejorDia,
    };
  }, [datasetGrafico, metricaSeleccionada]);

  // Evolución temporal alineada por posición (día 1, 2, 3…) para superponer A vs B
  const overlay = useMemo(() => {
    if (!data) return [];
    const a = data.porDia;
    const b = dataB?.porDia ?? [];
    const len = Math.max(a.length, b.length);
    return Array.from({ length: len }, (_, i) => ({
      label: a[i] ? fmtFecha(a[i].fecha) : b[i] ? fmtFecha(b[i].fecha) : "",
      fechaB: b[i] ? fmtFecha(b[i].fecha) : null,
      bruto: a[i]?.bruto ?? null,
      neto: a[i]?.neto ?? null,
      netoB: b[i]?.neto ?? null,
    }));
  }, [data, dataB]);

  // Índice de métodos de pago del período B por nombre, para la tabla comparativa
  const metodoB = useMemo(() => {
    const m = new Map<string, { cantidad: number; monto: number }>();
    dataB?.porMetodoPago.forEach(x => m.set(x.metodo, x));
    return m;
  }, [dataB]);

  // Índice de puntos de venta del período B por nombre, para la comparación de distribución
  const puntoVentaB = useMemo(() => {
    const m = new Map<string, { cantidad: number; monto: number }>();
    dataB?.porPuntoVenta.forEach(x => m.set(x.nombre, x));
    return m;
  }, [dataB]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-6 overflow-y-auto h-full bg-slate-50/50">

      {/* Header + Controles */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-blue-600" />
                Resumen de Ventas
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Seleccioná el rango de fechas y generá el informe</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* Presets */}
              <div className="flex gap-1.5">
                {[["hoy", "Hoy"], ["7d", "7 días"], ["30d", "30 días"], ["mes", "Este mes"], ["año", "Este año"]].map(([key, label]) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => preset(key)}
                    className="h-8 px-3 text-xs font-semibold border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 rounded-lg">
                    {label}
                  </Button>
                ))}
              </div>

              {/* Date range (período A) */}
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5">
                <Calendar className="h-4 w-4 text-slate-400" />
                <Input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="h-7 w-[130px] border-0 p-0 text-sm font-medium focus-visible:ring-0 shadow-none" />
                <span className="text-slate-300">→</span>
                <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="h-7 w-[130px] border-0 p-0 text-sm font-medium focus-visible:ring-0 shadow-none" />
              </div>

              {/* Toggle comparar */}
              <Button variant={comparar ? "default" : "outline"} size="sm" onClick={toggleComparar}
                className={`h-8 px-3 text-xs font-semibold rounded-lg gap-1.5 ${comparar
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                  : "border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"}`}>
                <GitCompare className="h-3.5 w-3.5" /> Comparar
              </Button>

              <Button onClick={() => cargar()} disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl px-5 h-9 font-semibold shadow-sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Generar
              </Button>
            </div>
          </div>

          {/* Segundo rango (período B) — solo visible al comparar */}
          {comparar && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Período B · comparación</span>
              <div className="flex items-center gap-2 border border-indigo-200 bg-indigo-50/40 rounded-xl px-3 py-1.5 ml-auto">
                <Calendar className="h-4 w-4 text-indigo-400" />
                <Input type="date" value={desdeB} onChange={e => setDesdeB(e.target.value)}
                  className="h-7 w-[130px] border-0 bg-transparent p-0 text-sm font-medium focus-visible:ring-0 shadow-none" />
                <span className="text-indigo-300">→</span>
                <Input type="date" value={hastaB} onChange={e => setHastaB(e.target.value)}
                  className="h-7 w-[130px] border-0 bg-transparent p-0 text-sm font-medium focus-visible:ring-0 shadow-none" />
              </div>
              <Button variant="ghost" size="sm" onClick={usarPeriodoAnterior}
                className="h-8 px-3 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Período anterior
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Estado vacío o error */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center flex-grow py-24 text-center">
          {error ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <TrendingDown className="h-8 w-8 text-red-400" />
              </div>
              <p className="text-slate-700 font-semibold">{error}</p>
              <p className="text-slate-400 text-sm mt-1">Intentá nuevamente</p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <BarChart2 className="h-10 w-10 text-blue-400" />
              </div>
              <p className="text-slate-700 font-semibold text-lg">Seleccioná un rango y hacé clic en Generar</p>
              <p className="text-slate-400 text-sm mt-1">El dashboard mostrará todos los indicadores de ventas del período</p>
            </>
          )}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center flex-grow py-24">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium">Calculando resumen…</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Banner comparación A vs B ── */}
          {dataB && (
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="font-bold text-slate-700">Período A</span>
                <span className="text-slate-400">{fmtFecha(desde)} → {fmtFecha(hasta)}</span>
                <span className="font-black text-slate-900">{fmtPeso(data.kpis.montoNeto)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-indigo-300 flex-shrink-0" />
                <span className="font-bold text-slate-700">Período B</span>
                <span className="text-slate-400">{fmtFecha(desdeB)} → {fmtFecha(hastaB)}</span>
                <span className="font-black text-slate-900">{fmtPeso(dataB.kpis.montoNeto)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs ml-auto">
                <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Variación neto global</span>
                <Delta current={data.kpis.montoNeto} prev={dataB.kpis.montoNeto} className="text-sm" />
              </div>
            </div>
          )}

          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">

            {/* Tarjeta única: ventas por punto de venta */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-500">
                  <Store className="h-5 w-5" />
                </div>
                <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Cantidad de ventas</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {data.porPuntoVenta.map((pv, i) => {
                  const hex = pv.color && pv.color !== "#000000" ? pv.color : PALETTE[i % PALETTE.length];
                  return (
                    <div key={pv.nombre} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                      <span className="text-xs text-slate-600 flex-1 truncate">{pv.nombre}</span>
                      <span className="text-xs font-black text-slate-900">{pv.cantidad}</span>
                    </div>
                  );
                })}
                <div className="border-t border-slate-100 pt-1.5 mt-0.5 flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Total</span>
                  <div className="flex items-center gap-2">
                    {dataB && <Delta current={data.kpis.totalVentas} prev={dataB.kpis.totalVentas} />}
                    <span className="text-xs font-black text-slate-900">{data.kpis.totalVentas}</span>
                  </div>
                </div>
              </div>
            </div>

            <KpiCard icon={TrendingUp} label="Neto global (Instagram, MercadoLibre, etc.)" value={fmtPeso(data.kpis.montoNeto)}
              color="bg-green-50 text-green-600" badge="Principal"
              delta={dataB && <div className="flex items-center gap-1.5"><Delta current={data.kpis.montoNeto} prev={dataB.kpis.montoNeto} /><span className="text-[11px] text-slate-400">vs {fmtPeso(dataB.kpis.montoNeto)}</span></div>} />
            <KpiCard icon={DollarSign} label="Neto ML" value={fmtPeso(data.kpis.montoNetoML)}
              sub="Neto recibido MercadoLibre"
              color="bg-emerald-50 text-emerald-600"
              delta={dataB && <div className="flex items-center gap-1.5"><Delta current={data.kpis.montoNetoML} prev={dataB.kpis.montoNetoML} /><span className="text-[11px] text-slate-400">vs {fmtPeso(dataB.kpis.montoNetoML)}</span></div>} />
            <KpiCard icon={TrendingDown} label="Bruto ML" value={fmtPeso(data.kpis.montoBrutoML)}
              sub="Precio de lista MercadoLibre"
              color="bg-orange-50 text-orange-600"
              delta={dataB && <div className="flex items-center gap-1.5"><Delta current={data.kpis.montoBrutoML} prev={dataB.kpis.montoBrutoML} /><span className="text-[11px] text-slate-400">vs {fmtPeso(dataB.kpis.montoBrutoML)}</span></div>} />
            <KpiCard icon={Receipt} label="Facturadas" value={data.kpis.facturadas.toLocaleString("es-AR")}
              sub={`${data.kpis.totalVentas > 0 ? Math.round(data.kpis.facturadas / data.kpis.totalVentas * 100) : 0}% del total`}
              color="bg-teal-50 text-teal-600"
              delta={dataB && <div className="flex items-center gap-1.5"><Delta current={data.kpis.facturadas} prev={dataB.kpis.facturadas} /><span className="text-[11px] text-slate-400">vs {dataB.kpis.facturadas.toLocaleString("es-AR")}</span></div>} />
          </div>

          {/* ── Fila 1: Evolución de ventas por día (interactivo por multi-punto de venta y métrica) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
            {/* Header + Selectores */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Lado izquierdo: Título + Selector de Puntos de Venta */}
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-900 text-base">Evolución de ventas por día</h3>
                    <Badge variant="outline" className="text-[11px] font-bold text-blue-700 bg-blue-50/70 border-blue-200">
                      {pvsSeleccionados.length === 0
                        ? "Todos los canales"
                        : pvsSeleccionados.length === 1
                        ? pvsSeleccionados[0]
                        : `${pvsSeleccionados.length} canales`}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    1 venta con múltiples artículos = 1 sola venta
                    {dataB && " · comparando con período B"}
                  </p>
                </div>

                {/* Selector Múltiple de Puntos de Venta (Ubicación fija a la izquierda) */}
                <div className="relative" ref={pvDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPvDropdownOpen(!isPvDropdownOpen)}
                    className="flex items-center justify-between w-[210px] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all shadow-sm"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Store className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span className="font-bold text-slate-900 truncate">
                        {pvsSeleccionados.length === 0
                          ? "Todos los canales"
                          : pvsSeleccionados.length === 1
                          ? pvsSeleccionados[0]
                          : `${pvsSeleccionados.length} canales elegidos`}
                      </span>
                    </div>
                    <ChevronDown className={`h-3 w-3 text-slate-400 flex-shrink-0 transition-transform ${isPvDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isPvDropdownOpen && (
                    <div className="absolute left-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in-0 zoom-in-95">
                      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Elegir canales (+1)
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={seleccionarTodosPv}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                          >
                            Todos
                          </button>
                          {pvsSeleccionados.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPvsSeleccionados([])}
                              className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 max-h-60 overflow-y-auto pr-0.5">
                        {/* Opción Todos */}
                        <div
                          onClick={seleccionarTodosPv}
                          className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                            pvsSeleccionados.length === 0
                              ? "bg-blue-50/70 text-blue-900 font-bold"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                pvsSeleccionados.length === 0
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "border-slate-300"
                              }`}
                            >
                              {pvsSeleccionados.length === 0 && <Check className="h-3 w-3" />}
                            </div>
                            <span>Todos los canales</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{data.kpis.totalVentas}v</span>
                        </div>

                        <div className="h-px bg-slate-100 my-1" />

                        {/* Lista de Puntos de Venta */}
                        {data.porPuntoVenta.map((pv, idx) => {
                          const isSelected = pvsSeleccionados.length === 0 || pvsSeleccionados.includes(pv.nombre);
                          const color = pv.color && pv.color !== "#000000" ? pv.color : PALETTE[idx % PALETTE.length];
                          return (
                            <div
                              key={pv.nombre}
                              onClick={() => togglePv(pv.nombre)}
                              className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                                pvsSeleccionados.includes(pv.nombre)
                                  ? "bg-blue-50/70 text-blue-900 font-bold"
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <div
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
                                    isSelected
                                      ? "bg-blue-600 border-blue-600 text-white"
                                      : "border-slate-300"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                <span className="truncate">{pv.nombre}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 font-mono text-[10px] text-slate-400">
                                <span>{pv.cantidad}v</span>
                                <span>·</span>
                                <span className="font-semibold text-slate-600">{fmtPeso(pv.monto)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lado derecho: Selectores de Métrica, Desglose y Gráfico */}
              <div className="flex flex-wrap items-center gap-2.5 ml-auto">

                {/* Selector de Métrica */}
                <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setMetricaSeleccionada("monto")}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg font-bold transition-all ${
                      metricaSeleccionada === "monto"
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Monto
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricaSeleccionada("cantidad")}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg font-bold transition-all ${
                      metricaSeleccionada === "cantidad"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Hash className="h-3.5 w-3.5" />
                    Cantidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricaSeleccionada("ambos")}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg font-bold transition-all ${
                      metricaSeleccionada === "ambos"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Ambos
                  </button>
                </div>

                {/* Sub-toggle: Desglose por canal vs Total consolidado (cuando hay múltiples PVs activos y métrica simple) */}
                {pvsActivos.length > 1 && metricaSeleccionada !== "ambos" && (
                  <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setModoDesglose("acumulado")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        modoDesglose === "acumulado"
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                      title="Muestra el total sumado de los canales seleccionados"
                    >
                      Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoDesglose("desglosado")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        modoDesglose === "desglosado"
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                      title="Muestra una serie individual por cada canal seleccionado"
                    >
                      Por canal
                    </button>
                  </div>
                )}

                {/* Selector Tipo de Gráfico (solo en modo acumulado) */}
                {metricaSeleccionada !== "ambos" && modoDesglose === "acumulado" && (
                  <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setTipoGrafico("area")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        tipoGrafico === "area"
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Área
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoGrafico("bar")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        tipoGrafico === "bar"
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Barras
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Chips de Puntos de Venta seleccionados (si hay filtro activo) */}
            {pvsSeleccionados.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 font-semibold mr-1">Canales activos:</span>
                {pvsSeleccionados.map((nombre) => {
                  const color = pvColorMap.get(nombre) || "#3b82f6";
                  return (
                    <span
                      key={nombre}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {nombre}
                      <button
                        type="button"
                        onClick={() => togglePv(nombre)}
                        className="hover:text-red-500 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={seleccionarTodosPv}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 ml-1 hover:underline"
                >
                  Restablecer a todos
                </button>
              </div>
            )}

            {/* Cinta de estadísticas rápidas del filtro seleccionado */}
            {metricasGrafico && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {metricaSeleccionada === "cantidad" ? "Total ventas seleccionadas" : "Total monto seleccionado"}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {metricaSeleccionada === "cantidad"
                      ? `${metricasGrafico.totalCant.toLocaleString("es-AR")} ventas`
                      : fmtPeso(metricasGrafico.totalMonto)}
                  </span>
                  {metricaSeleccionada === "monto" && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      {metricasGrafico.totalCant} {metricasGrafico.totalCant === 1 ? "venta" : "ventas"}
                    </span>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Promedio por día</span>
                  <span className="text-sm font-black text-slate-900">
                    {metricaSeleccionada === "cantidad"
                      ? `${metricasGrafico.promCantDia.toFixed(1)} v/día`
                      : `${fmtPeso(metricasGrafico.promMontoDia)}/día`}
                  </span>
                  {metricaSeleccionada === "monto" && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      {metricasGrafico.promCantDia.toFixed(1)} ventas promedio/día
                    </span>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ticket promedio</span>
                  <span className="text-sm font-black text-slate-900">
                    {fmtPeso(metricasGrafico.ticketProm)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">por transacción</span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mejor día</span>
                  <span className="text-sm font-black text-emerald-600 truncate">
                    {metricasGrafico.mejorDia?.label || "—"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium truncate">
                    {metricaSeleccionada === "cantidad"
                      ? `${metricasGrafico.mejorDia?.cantidad ?? 0} ventas (${fmtPeso(metricasGrafico.mejorDia?.monto ?? 0)})`
                      : `${fmtPeso(metricasGrafico.mejorDia?.monto ?? 0)} (${metricasGrafico.mejorDia?.cantidad ?? 0}v)`}
                  </span>
                </div>
              </div>
            )}

            {/* Gráfico Recharts */}
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={datasetGrafico} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradNeto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCantidad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBruto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  {pvsActivos.map((nombre, i) => {
                    const color = pvColorMap.get(nombre) || PALETTE[i % PALETTE.length];
                    return (
                      <linearGradient key={nombre} id={`grad_pv_${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />

                {metricaSeleccionada === "monto" && (
                  <YAxis
                    yAxisId="monto"
                    tickFormatter={(v) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`)}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                  />
                )}

                {metricaSeleccionada === "cantidad" && (
                  <YAxis
                    yAxisId="cantidad"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                  />
                )}

                {metricaSeleccionada === "ambos" && (
                  <>
                    <YAxis
                      yAxisId="monto"
                      orientation="left"
                      tickFormatter={(v) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`)}
                      tick={{ fontSize: 11, fill: "#3b82f6" }}
                    />
                    <YAxis
                      yAxisId="cantidad"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#8b5cf6" }}
                    />
                  </>
                )}

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;

                    const desgloses = (d.desglosesA as Record<string, { monto: number; cantidad: number; color: string }>) || {};
                    const entries = Object.entries(desgloses).filter(([_, val]) => val.cantidad > 0 || val.monto > 0);

                    return (
                      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-3.5 text-xs min-w-[260px] max-w-xs z-50">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">
                              {d.fecha ? fmtFechaConDia(d.fecha) : label}
                            </p>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {pvsSeleccionados.length === 0
                                ? "Todos los canales"
                                : pvsSeleccionados.length === 1
                                ? pvsSeleccionados[0]
                                : `${pvsSeleccionados.length} canales`}
                            </span>
                          </div>
                          {pvsSeleccionados.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                              Filtrado
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 py-1">
                          {(metricaSeleccionada === "monto" || metricaSeleccionada === "ambos") && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                {pvsActivos.length > 1 ? "Monto total sel.:" : "Monto neto:"}
                              </span>
                              <span className="font-bold text-slate-900">{fmtPeso(d.monto)}</span>
                            </div>
                          )}

                          {(metricaSeleccionada === "cantidad" || metricaSeleccionada === "ambos") && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                                {pvsActivos.length > 1 ? "Ventas totales sel.:" : "Cantidad ventas:"}
                              </span>
                              <span className="font-bold text-slate-900 font-mono">
                                {d.cantidad} {d.cantidad === 1 ? "venta" : "ventas"}
                              </span>
                            </div>
                          )}

                          {d.cantidad > 0 && d.monto > 0 && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px]">
                              <span className="text-slate-400">Ticket promedio:</span>
                              <span className="font-semibold text-slate-700">{fmtPeso(d.ticketProm)}</span>
                            </div>
                          )}

                          {dataB && (d.montoB !== null || d.cantidadB !== null) && (
                            <div className="pt-2 border-t border-slate-100 mt-2 space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-indigo-600 font-medium">Período B ({d.fechaB}):</span>
                                <span className="font-bold text-indigo-700">
                                  {metricaSeleccionada === "cantidad" ? `${d.cantidadB ?? 0} ventas` : fmtPeso(d.montoB ?? 0)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-400">Variación vs B:</span>
                                <Delta
                                  current={metricaSeleccionada === "cantidad" ? d.cantidad : d.monto}
                                  prev={metricaSeleccionada === "cantidad" ? (d.cantidadB ?? 0) : (d.montoB ?? 0)}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {entries.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                              Desglose del día
                            </p>
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {entries.map(([nombre, val]) => (
                                <div key={nombre} className="flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-1.5 truncate max-w-[130px]">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: val.color }} />
                                    <span className="text-slate-600 truncate">{nombre}</span>
                                  </div>
                                  <div className="flex items-center gap-2 font-mono text-[10px]">
                                    <span className="text-slate-500 font-semibold">{val.cantidad}v</span>
                                    <span className="font-bold text-slate-800">{fmtPeso(val.monto)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />

                {/* ── Series Monto ── */}
                {metricaSeleccionada === "monto" && (
                  <>
                    {modoDesglose === "desglosado" && pvsActivos.length > 1 ? (
                      pvsActivos.map((nombre, i) => {
                        const color = pvColorMap.get(nombre) || PALETTE[i % PALETTE.length];
                        return (
                          <Area
                            key={nombre}
                            yAxisId="monto"
                            type="monotone"
                            dataKey={`pv_monto_${nombre}`}
                            name={nombre}
                            stroke={color}
                            strokeWidth={2.5}
                            fill={`url(#grad_pv_${i})`}
                            dot={false}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        );
                      })
                    ) : (
                      <>
                        {tipoGrafico === "area" ? (
                          <Area
                            yAxisId="monto"
                            type="monotone"
                            dataKey="monto"
                            name={pvsActivos.length > 1 ? "Monto Total Sel. ($)" : `Monto ${pvsActivos[0]} ($)`}
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            fill="url(#gradNeto)"
                            dot={false}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        ) : (
                          <Bar
                            yAxisId="monto"
                            dataKey="monto"
                            name={pvsActivos.length > 1 ? "Monto Total Sel. ($)" : `Monto ${pvsActivos[0]} ($)`}
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        )}
                      </>
                    )}
                    {dataB && (
                      <Line
                        yAxisId="monto"
                        type="monotone"
                        dataKey="montoB"
                        name="Monto (período B)"
                        stroke="#6366f1"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </>
                )}

                {/* ── Series Cantidad ── */}
                {metricaSeleccionada === "cantidad" && (
                  <>
                    {modoDesglose === "desglosado" && pvsActivos.length > 1 ? (
                      pvsActivos.map((nombre, i) => {
                        const color = pvColorMap.get(nombre) || PALETTE[i % PALETTE.length];
                        return (
                          <Line
                            key={nombre}
                            yAxisId="cantidad"
                            type="monotone"
                            dataKey={`pv_cant_${nombre}`}
                            name={nombre}
                            stroke={color}
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: color }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        );
                      })
                    ) : (
                      <>
                        {tipoGrafico === "area" ? (
                          <Area
                            yAxisId="cantidad"
                            type="monotone"
                            dataKey="cantidad"
                            name={pvsActivos.length > 1 ? "Ventas Totales Sel." : `Ventas ${pvsActivos[0]}`}
                            stroke="#8b5cf6"
                            strokeWidth={2.5}
                            fill="url(#gradCantidad)"
                            dot={false}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        ) : (
                          <Bar
                            yAxisId="cantidad"
                            dataKey="cantidad"
                            name={pvsActivos.length > 1 ? "Ventas Totales Sel." : `Ventas ${pvsActivos[0]}`}
                            fill="#8b5cf6"
                            radius={[4, 4, 0, 0]}
                          />
                        )}
                      </>
                    )}
                    {dataB && (
                      <Line
                        yAxisId="cantidad"
                        type="monotone"
                        dataKey="cantidadB"
                        name="Cantidad (período B)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </>
                )}

                {/* ── Series Ambos (Doble Eje) ── */}
                {metricaSeleccionada === "ambos" && (
                  <>
                    <Area
                      yAxisId="monto"
                      type="monotone"
                      dataKey="monto"
                      name={pvsActivos.length > 1 ? "Monto Total Sel. ($)" : `Monto ${pvsActivos[0]} ($)`}
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#gradNeto)"
                      dot={false}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="cantidad"
                      type="monotone"
                      dataKey="cantidad"
                      name={pvsActivos.length > 1 ? "Ventas Totales Sel. (#)" : `Ventas ${pvsActivos[0]} (#)`}
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#8b5cf6" }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    {dataB && (
                      <Line
                        yAxisId="monto"
                        type="monotone"
                        dataKey="montoB"
                        name="Monto (período B)"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ── Fila 2: Puntos de venta (pie + bar) ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Pie: Punto de venta */}
            <ChartCard title="Distribución por punto de venta" subtitle={dataB ? "% del monto neto del período A · Δ del monto vs período B" : "Porcentaje del monto neto total por canal"}>
              {data.porPuntoVenta.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Sin datos de puntos de venta</div>
              ) : (
                <div className="flex gap-4 items-center">
                  <ResponsiveContainer width="50%" height={230}>
                    <PieChart>
                      <Pie data={data.porPuntoVenta} dataKey="monto" nameKey="nombre"
                        cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                        labelLine={false} label={PieLabel}
                        onMouseEnter={(_, i) => setActiveMetodoIndex(i)}
                        onMouseLeave={() => setActiveMetodoIndex(undefined)}>
                        {data.porPuntoVenta.map((entry, i) => (
                          <Cell key={i}
                            fill={entry.color !== "#000000" ? entry.color : PALETTE[i % PALETTE.length]}
                            stroke={activeMetodoIndex === i ? "#1e293b" : "white"}
                            strokeWidth={activeMetodoIndex === i ? 2 : 1}
                            opacity={activeMetodoIndex === undefined || activeMetodoIndex === i ? 1 : 0.65} />
                        ))}
                      </Pie>
                      <Tooltip content={<PesoTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 flex flex-col gap-2">
                    {data.porPuntoVenta.map((pv, i) => {
                      const color = pv.color !== "#000000" ? pv.color : PALETTE[i % PALETTE.length];
                      const total = data.porPuntoVenta.reduce((s, x) => s + x.monto, 0);
                      const pct = total > 0 ? (pv.monto / total * 100).toFixed(1) : "0";
                      const b = puntoVentaB.get(pv.nombre);
                      return (
                        <div key={pv.nombre} className="flex items-center gap-2 cursor-default"
                          onMouseEnter={() => setActiveMetodoIndex(i)} onMouseLeave={() => setActiveMetodoIndex(undefined)}>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-xs text-slate-600 flex-1 truncate font-medium">{pv.nombre}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{pv.cantidad}v</span>
                          <span className="text-xs font-bold text-slate-700 w-11 text-right">{pct}%</span>
                          {dataB && <Delta current={pv.monto} prev={b?.monto ?? 0} className="text-[11px] w-14 justify-end" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ChartCard>

            {/* Bar: Por punto de venta */}
            <ChartCard title="Ventas por punto de venta" subtitle={dataB ? "Monto neto acumulado · período A" : "Monto neto acumulado por sucursal / canal"}>
              {data.porPuntoVenta.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Sin datos de puntos de venta</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.porPuntoVenta} layout="vertical" margin={{ top: 0, right: 90, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip content={<PesoTooltip />} />
                    <Bar dataKey="monto" name="Monto neto" radius={[0, 6, 6, 0]}>
                      {data.porPuntoVenta.map((entry, i) => (
                        <Cell key={i} fill={entry.color !== "#000000" ? entry.color : PALETTE[i % PALETTE.length]} />
                      ))}
                      <LabelList dataKey="monto" position="right" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
                        formatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}k`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ── Fila 3: Top productos + Distribución horaria ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Horizontal bar: Top productos */}
            <ChartCard title="Top 15 productos más vendidos" subtitle="Ranking por cantidad de unidades vendidas">
              {data.topProductos.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Sin productos</div>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={data.topProductos} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis type="category" dataKey="nombre" width={150}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickFormatter={v => v.length > 22 ? v.slice(0, 22) + "…" : v} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm max-w-xs">
                            <p className="font-bold text-slate-700 mb-2 break-words">{label}</p>
                            <p className="text-slate-500">Cantidad: <span className="font-bold text-slate-800">{d.cantidad}</span></p>
                            <p className="text-slate-500">Monto: <span className="font-bold text-slate-800">{fmtPeso(d.monto)}</span></p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="cantidad" name="Unidades" radius={[0, 5, 5, 0]}>
                      {data.topProductos.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <div className="flex flex-col gap-4">
              {/* Pie: Facturado vs no facturado */}
              <ChartCard title="Estado de facturación" subtitle="Ventas con comprobante AFIP vs sin factura">
                <div className="flex gap-4 items-center">
                  <ResponsiveContainer width="45%" height={160}>
                    <PieChart>
                      <Pie data={[
                        { name: "Facturadas", value: data.kpis.facturadas },
                        { name: "Sin factura", value: data.kpis.noFacturadas },
                      ]}
                        dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={38} labelLine={false} label={PieLabel}>
                        <Cell fill="#10b981" />
                        <Cell fill="#e2e8f0" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-xs text-slate-600 font-medium">Facturadas</span>
                      </div>
                      <p className="text-xl font-black text-slate-900 ml-4">{data.kpis.facturadas}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                        <span className="text-xs text-slate-600 font-medium">Sin factura</span>
                      </div>
                      <p className="text-xl font-black text-slate-900 ml-4">{data.kpis.noFacturadas}</p>
                    </div>
                  </div>
                </div>
              </ChartCard>

              {/* Bar: Distribución horaria */}
              <ChartCard title="Distribución horaria" subtitle="Cantidad de ventas por hora del día" className="flex-1">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.porHora.filter(h => h.hora >= 6 && h.hora <= 22)} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="hora" tickFormatter={h => `${h}h`} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 text-sm">
                            <p className="font-bold text-slate-700">{d.hora}:00 hs</p>
                            <p className="text-slate-500">Ventas: <span className="font-bold text-slate-800">{d.cantidad}</span></p>
                            <p className="text-slate-500">Monto: <span className="font-bold text-slate-800">{fmtPeso(d.monto)}</span></p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="cantidad" name="Ventas" radius={[4, 4, 0, 0]}>
                      {data.porHora.filter(h => h.hora >= 6 && h.hora <= 22).map((h, i) => (
                        <Cell key={i} fill={h.cantidad === Math.max(...data.porHora.map(x => x.cantidad)) ? "#3b82f6" : "#bfdbfe"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          {/* ── Fila 4: Cantidad de ventas por día (bar) ── */}
          <ChartCard title="Cantidad de ventas por día" subtitle="Número de transacciones registradas cada día">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.porDia.map(d => ({ ...d, fecha: fmtFecha(d.fecha) }))}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
                        <p className="font-bold text-slate-700 mb-1">{label}</p>
                        <p className="text-slate-500">Ventas: <span className="font-bold text-slate-800">{d.cantidad}</span></p>
                        <p className="text-slate-500">Neto: <span className="font-bold text-slate-800">{fmtPeso(d.neto)}</span></p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="cantidad" name="Cantidad" radius={[5, 5, 0, 0]} fill="#6366f1">
                  {data.porDia.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? "#6366f1" : "#818cf8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── Tabla resumen por método de pago ── */}
          <ChartCard title="Detalle por método de pago" subtitle={dataB ? "Comparativa de montos: período A vs período B" : "Resumen comparativo de todos los métodos"}>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Método</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Cantidad</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">% ventas</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Monto total{dataB && " (A)"}</th>
                    {dataB && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-indigo-500">Monto (B)</th>}
                    {dataB && <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-indigo-500">Δ monto</th>}
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">% monto</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ticket prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porMetodoPago.map((m, i) => {
                    const color = METODO_COLORS[m.metodo] || PALETTE[i % PALETTE.length];
                    const totalCant = data.kpis.totalVentas;
                    const totalMonto = data.kpis.montoNeto;
                    const pctCant = totalCant > 0 ? (m.cantidad / totalCant * 100).toFixed(1) : "0";
                    const pctMonto = totalMonto > 0 ? (m.monto / totalMonto * 100).toFixed(1) : "0";
                    const ticket = m.cantidad > 0 ? m.monto / m.cantidad : 0;
                    const b = metodoB.get(m.metodo);
                    return (
                      <tr key={m.metodo} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="font-medium text-slate-700">{m.metodo}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{m.cantidad.toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{ width: `${pctCant}%`, background: color }} />
                            </div>
                            <span className="text-slate-500 text-xs w-10 text-right">{pctCant}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtPeso(m.monto)}</td>
                        {dataB && <td className="px-4 py-3 text-right text-slate-500">{b ? fmtPeso(b.monto) : "—"}</td>}
                        {dataB && <td className="px-4 py-3 text-right"><div className="flex justify-end"><Delta current={m.monto} prev={b?.monto ?? 0} /></div></td>}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{ width: `${pctMonto}%`, background: color }} />
                            </div>
                            <span className="text-slate-500 text-xs w-10 text-right">{pctMonto}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{fmtPeso(ticket)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-3 text-slate-800">TOTAL</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800">{data.kpis.totalVentas.toLocaleString("es-AR")}</td>
                    <td className="px-4 py-3 text-right text-slate-500">100%</td>
                    <td className="px-4 py-3 text-right text-slate-900">{fmtPeso(data.kpis.montoNeto)}</td>
                    {dataB && <td className="px-4 py-3 text-right text-slate-600">{fmtPeso(dataB.kpis.montoNeto)}</td>}
                    {dataB && <td className="px-4 py-3 text-right"><div className="flex justify-end"><Delta current={data.kpis.montoNeto} prev={dataB.kpis.montoNeto} /></div></td>}
                    <td className="px-4 py-3 text-right text-slate-500">100%</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmtPeso(data.kpis.ticketPromedio)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

        </>
      )}
    </div>
  );
}
