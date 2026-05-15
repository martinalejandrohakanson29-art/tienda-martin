"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  TrendingUp, TrendingDown, RefreshCcw, ChevronDown, Search, AlertTriangle, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CheckCircle } from "lucide-react";
import { DateRangeCalendar } from "./date-range-calendar";
import { obtenerVentasRendimiento } from "@/app/actions/ventas-mostrador";

interface PuntoVenta {
  id: string;
  nombre: string;
  color?: string | null;
}

interface ItemRendimiento {
  id: string;
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  costo: number | null;
}

interface VentaRendimiento {
  id: string;
  numeroVenta: number | null;
  createdAt: string;
  cliente: string;
  metodo_pago: string;
  mlIdVenta: string | null;
  cupon: string | null;
  de: string | null;
  puntoVenta: PuntoVenta | null;
  total: number;
  totalFinal: number;
  neto: number;
  costoTotal: number;
  ganancia: number;
  margenPct: number | null;
  tieneCostoParcial: boolean;
  itemsCount: number;
  items: ItemRendimiento[];
}

interface VentaConAjuste extends VentaRendimiento {
  gananciaEfectiva: number;
  marcacionEfectiva: number | null;
  margenEfectivo: number | null;
  esAjustado: boolean;
}

interface Props {
  puntosVenta: PuntoVenta[];
  fechaDesdeInicial: string;
  fechaHastaInicial: string;
}

export default function RendimientoVentasTab({ puntosVenta, fechaDesdeInicial, fechaHastaInicial }: Props) {
  const [fechaDesde, setFechaDesde] = useState(fechaDesdeInicial);
  const [fechaHasta, setFechaHasta] = useState(fechaHastaInicial);
  const [ventas, setVentas] = useState<VentaRendimiento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cargado, setCargado] = useState(false);

  const [filtroPuntoVenta, setFiltroPuntoVenta] = useState<string[]>([]);
  const [isPuntoVentaOpen, setIsPuntoVentaOpen] = useState(false);
  const puntoVentaRef = React.useRef<HTMLDivElement>(null);

  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [filtroMetodoPago, setFiltroMetodoPago] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [marcacionInstagram, setMarcacionInstagram] = useState("");
  const [marcacionMayorista, setMarcacionMayorista] = useState("");
  const [marcacionMostrador, setMarcacionMostrador] = useState("");

  const cargar = useCallback(async (desde: string, hasta: string) => {
    if (!desde || !hasta) return;
    setIsLoading(true);
    const res = await obtenerVentasRendimiento(desde, hasta);
    if (res.success) {
      setVentas((res.data as VentaRendimiento[]) || []);
      setCargado(true);
    }
    setIsLoading(false);
  }, []);

  // Recarga automática cuando cambian las fechas (solo si ya se cargó al menos una vez)
  useEffect(() => {
    if (!cargado) return;
    cargar(fechaDesde, fechaHasta);
  }, [fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      if (filtroPuntoVenta.length > 0 && (!v.puntoVenta || !filtroPuntoVenta.includes(v.puntoVenta.id))) return false;
      if (filtroMetodoPago && v.metodo_pago !== filtroMetodoPago) return false;
      if (filtroBusqueda) {
        const q = filtroBusqueda.toLowerCase();
        const numVenta = v.numeroVenta?.toString() || "";
        if (!v.cliente.toLowerCase().includes(q) && !numVenta.includes(q) && !v.mlIdVenta?.includes(q)) return false;
      }
      return true;
    });
  }, [ventas, filtroPuntoVenta, filtroMetodoPago, filtroBusqueda]);

  const ventasConAjuste = useMemo((): VentaConAjuste[] => {
    const mktInsta = parseFloat(marcacionInstagram) || 0;
    const mktMayor = parseFloat(marcacionMayorista) || 0;
    const mktMostr = parseFloat(marcacionMostrador) || 0;
    return ventasFiltradas.map(v => {
      const pvNombre = v.puntoVenta?.nombre?.toLowerCase() || '';
      let markup = 0;
      if (pvNombre.includes('instagram')) markup = mktInsta;
      else if (pvNombre.includes('mayorista')) markup = mktMayor;
      else if (pvNombre.includes('mostrador')) markup = mktMostr;
      const esAjustado = markup > 0 && (v.costoTotal === 0 || v.tieneCostoParcial);
      if (esAjustado) {
        const margenDecimal = markup / (100 + markup);
        return {
          ...v,
          gananciaEfectiva: v.neto * margenDecimal,
          marcacionEfectiva: markup,
          margenEfectivo: margenDecimal * 100,
          esAjustado: true,
        };
      }
      return {
        ...v,
        gananciaEfectiva: v.ganancia,
        marcacionEfectiva: v.margenPct,
        margenEfectivo: v.neto > 0 ? (v.ganancia / v.neto) * 100 : null,
        esAjustado: false,
      };
    });
  }, [ventasFiltradas, marcacionInstagram, marcacionMayorista, marcacionMostrador]);

  const totales = useMemo(() => {
    const totalNeto = ventasConAjuste.reduce((a, v) => a + v.neto, 0);
    const totalCosto = ventasConAjuste.reduce((a, v) => a + v.costoTotal, 0);
    const totalGanancia = ventasConAjuste.reduce((a, v) => a + v.gananciaEfectiva, 0);
    const margenGlobal = totalCosto > 0 ? (totalGanancia / totalCosto) * 100 : null;
    const conParcial = ventasConAjuste.filter(v => v.tieneCostoParcial && !v.esAjustado).length;
    return { totalNeto, totalCosto, totalGanancia, margenGlobal, conParcial };
  }, [ventasConAjuste]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fmtARS = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  const colorMargen = (pct: number) => {
    if (pct < 40) return 'text-red-600';
    if (pct < 50) return 'text-amber-500';
    if (pct < 60) return 'text-emerald-600';
    return 'text-fuchsia-600';
  };
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const copiar = (ventaId: string, val: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiadoId(ventaId);
    setTimeout(() => setCopiadoId(id => id === ventaId ? null : id), 1200);
  };

  return (
    <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">

      {/* FILTROS */}
      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtrar por Fecha</Label>
            <div className="flex items-center gap-2">
              <DateRangeCalendar
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
                setFechaDesde={setFechaDesde}
                setFechaHasta={setFechaHasta}
                onApply={() => {}}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => cargar(fechaDesde, fechaHasta)}
                disabled={isLoading}
                className="rounded-xl border-slate-200 h-10 w-10 text-slate-400 hover:text-emerald-600 transition-all"
              >
                <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Punto de Venta</Label>
            <Popover ref={puntoVentaRef}>
              <PopoverTrigger
                onClick={() => setIsPuntoVentaOpen(!isPuntoVentaOpen)}
                className="h-10 w-44 rounded-xl border border-slate-200 px-3 text-xs focus:outline-none bg-white flex items-center justify-between hover:border-slate-300 transition-all shadow-sm"
              >
                <span className="truncate">
                  {filtroPuntoVenta.length === 0
                    ? "Todos los Puntos"
                    : filtroPuntoVenta.length === 1
                      ? puntosVenta.find(p => p.id === filtroPuntoVenta[0])?.nombre
                      : `${filtroPuntoVenta.length} Seleccionados`}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400 ml-2" />
              </PopoverTrigger>
              {isPuntoVentaOpen && (
                <PopoverContent className="p-2 w-64 shadow-xl border-slate-100 rounded-xl bg-white" align="start">
                  <div className="flex flex-col gap-1">
                    <div
                      className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer"
                      onClick={() => { setFiltroPuntoVenta([]); setIsPuntoVentaOpen(false); }}
                    >
                      <div className={`flex items-center justify-center h-4 w-4 rounded border transition-all ${filtroPuntoVenta.length === 0 ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {filtroPuntoVenta.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <span className={`text-xs font-semibold ${filtroPuntoVenta.length === 0 ? 'text-blue-600' : 'text-slate-600'}`}>Todos los Puntos</span>
                    </div>
                    <div className="h-px bg-slate-100 my-1" />
                    {puntosVenta.map((p) => {
                      const sel = filtroPuntoVenta.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer ${sel ? 'bg-blue-50/50' : ''}`}
                          onClick={() => setFiltroPuntoVenta(sel ? filtroPuntoVenta.filter(id => id !== p.id) : [...filtroPuntoVenta, p.id])}
                        >
                          <div className={`flex items-center justify-center h-4 w-4 rounded border transition-all ${sel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                            {sel && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <span className={`text-xs ${sel ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>{p.nombre}</span>
                          {p.color && <div className="h-2 w-2 rounded-full ml-auto" style={{ backgroundColor: p.color }} />}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>

          {/* Marcación manual para PVs sin costo */}
          <div className="flex flex-wrap items-end gap-4 pt-3 border-t border-slate-100 w-full">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider self-center">% Marcación estimada</span>
            {([
              { label: 'Instagram', value: marcacionInstagram, set: setMarcacionInstagram },
              { label: 'Mayorista', value: marcacionMayorista, set: setMarcacionMayorista },
              { label: 'Mostrador', value: marcacionMostrador, set: setMarcacionMostrador },
            ] as { label: string; value: string; set: (v: string) => void }[]).map(({ label, value, set }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-500">{label}</span>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="h-8 w-20 border-slate-200 text-slate-700 rounded-lg text-xs pr-5"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">%</span>
                </div>
              </div>
            ))}
            <span className="text-[10px] text-slate-300 italic self-center">— Solo aplica a ventas sin costo completo</span>
          </div>

          {/* KPIs resumen */}
          {cargado && (
            <div className="ml-auto flex flex-wrap gap-6 items-end">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Neto Total</p>
                <p className="text-lg font-black text-slate-900">{fmtARS(totales.totalNeto)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Costo Total</p>
                <p className="text-lg font-black text-slate-500">{fmtARS(totales.totalCosto)}</p>
              </div>
              <div className="flex items-stretch gap-3 border border-emerald-200 rounded-xl px-4 py-2 bg-emerald-50/50">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Ganancia Total</p>
                  <p className={`text-lg font-black ${totales.totalGanancia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtARS(totales.totalGanancia)}
                  </p>
                </div>
                {totales.totalNeto > 0 && (
                  <>
                    <div className="w-px bg-emerald-200 self-stretch" />
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Margen Real</p>
                      <p className={`text-lg font-black ${totales.totalGanancia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fmtPct((totales.totalGanancia / totales.totalNeto) * 100)}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {totales.margenGlobal !== null && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">% Marcación</p>
                  <p className={`text-lg font-black ${colorMargen(totales.margenGlobal)}`}>
                    {fmtPct(totales.margenGlobal)}
                  </p>
                </div>
              )}
              {totales.conParcial > 0 && (
                <div className="flex items-center gap-1 text-amber-600 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3" />
                  {totales.conParcial} ventas sin costo completo
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {!cargado ? (
          <div className="flex-grow flex flex-col items-center justify-center gap-4 text-slate-400">
            <TrendingUp className="h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">Seleccioná un rango de fechas y presioná actualizar</p>
            <Button
              onClick={() => cargar(fechaDesde, fechaHasta)}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2"
            >
              {isLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              Cargar Rendimiento
            </Button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-grow h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase py-3">ID Venta</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Fecha</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Cliente / Canal</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Artículos</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Cupón / De / Id venta MLA</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-3">Neto</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-3">Costo</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-3 text-emerald-700">Ganancia</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-3 text-emerald-700">% Marcación</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-3 text-blue-700">% Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasConAjuste.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-20 text-center text-slate-400 italic">
                      No se encontraron ventas con estos filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  ventasConAjuste.map((v) => {
                    const expanded = expandedRows.has(v.id);
                    const gananciaPositiva = v.gananciaEfectiva >= 0;
                    return (
                      <React.Fragment key={v.id}>
                        <TableRow
                          className={`hover:bg-slate-50/50 align-top transition-colors ${!gananciaPositiva ? 'bg-red-50/30' : ''}`}
                        >
                          <TableCell className="py-4">
                            <span className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200">
                              {v.numeroVenta || v.id.slice(0, 8)}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-700 font-bold whitespace-nowrap">
                                {new Date(v.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                                {new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="text-xs font-medium text-slate-700">{v.cliente}</span>
                            {v.puntoVenta && (
                              <div className="mt-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${v.puntoVenta.nombre.toLowerCase().includes('mercadolibre') ? 'text-slate-900' : 'text-white'}`}
                                  style={{ backgroundColor: v.puntoVenta.color || '#10b981' }}
                                >
                                  {v.puntoVenta.nombre}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              onClick={() => toggleRow(v.id)}
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                              <span className="ml-1 text-xs">({v.itemsCount})</span>
                            </Button>
                            {v.tieneCostoParcial && (
                              <span title="Algunos artículos no tienen costo cargado">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 inline ml-1" />
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : v.metodo_pago === 'Mixto' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {v.metodo_pago === "mercadopago (ML)" ? "MercadoLibre" : v.metodo_pago}
                            </span>
                          </TableCell>
                          <TableCell
                            className={`py-4 text-xs font-mono max-w-[180px] truncate cursor-pointer transition-colors ${copiadoId === v.id ? 'text-emerald-600' : 'text-slate-600 hover:text-blue-600'}`}
                            title="Click para copiar"
                            onClick={() => {
                              const val = (v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto')
                                ? (v.de || "")
                                : (v.mlIdVenta || v.cupon || "");
                              if (val) copiar(v.id, val);
                            }}
                          >
                            {copiadoId === v.id ? (
                              <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                <Check className="h-3.5 w-3.5 shrink-0" /> Copiado
                              </span>
                            ) : (
                              (v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto')
                                ? (v.de || "-")
                                : (v.mlIdVenta || v.cupon || "-")
                            )}
                          </TableCell>
                          <TableCell className="text-right py-4 font-bold text-slate-800 text-xs">
                            {fmtARS(v.neto)}
                          </TableCell>
                          <TableCell className="text-right py-4 text-xs text-slate-500">
                            {v.costoTotal > 0 ? fmtARS(v.costoTotal) : <span className="text-slate-300 italic text-[10px]">sin costo</span>}
                          </TableCell>
                          <TableCell className={`text-right py-4 font-black text-sm ${gananciaPositiva ? 'text-emerald-600' : 'text-red-600'}`}>
                            <div className="flex items-center justify-end gap-1">
                              {gananciaPositiva
                                ? <TrendingUp className="h-3.5 w-3.5" />
                                : <TrendingDown className="h-3.5 w-3.5" />}
                              {fmtARS(v.gananciaEfectiva)}
                              {v.esAjustado && <span className="text-[8px] font-bold text-amber-500 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded ml-0.5">~est</span>}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right py-4 font-bold text-xs ${v.marcacionEfectiva !== null ? colorMargen(v.marcacionEfectiva) : 'text-slate-300'}`}>
                            {v.marcacionEfectiva !== null ? fmtPct(v.marcacionEfectiva) : <span className="italic text-[10px]">—</span>}
                          </TableCell>
                          <TableCell className={`text-right py-4 font-bold text-xs ${v.margenEfectivo !== null ? colorMargen(v.margenEfectivo) : 'text-slate-300'}`}>
                            {v.margenEfectivo !== null ? fmtPct(v.margenEfectivo) : <span className="italic text-[10px]">—</span>}
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <TableRow className="bg-slate-50/30 border-b-2 border-slate-200">
                            <TableCell colSpan={11} className="py-0">
                              <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
                                {v.items.length > 0 ? (
                                  v.items.map((item) => {
                                    const costoItem = item.costo !== null ? item.costo * item.cantidad : null;
                                    const gananciaItem = costoItem !== null ? item.subtotal - costoItem : null;
                                    return (
                                      <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200">
                                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                          <span className="font-bold text-slate-800 text-xs uppercase truncate">{item.nombre}</span>
                                          {item.productoId && (
                                            <span className="text-[9px] text-slate-400 font-mono">{item.productoId}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-4 ml-4 flex-shrink-0 text-xs">
                                          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black text-[10px]">x{item.cantidad}</span>
                                          <span className="text-slate-500 w-28 text-right">
                                            Costo: {costoItem !== null ? fmtARS(costoItem) : <span className="text-slate-300 italic">—</span>}
                                          </span>
                                          <span className="text-slate-700 font-bold w-28 text-right">
                                            Venta: {fmtARS(item.subtotal)}
                                          </span>
                                          <span className={`font-black w-28 text-right ${gananciaItem !== null ? (gananciaItem >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-slate-300'}`}>
                                            {gananciaItem !== null ? fmtARS(gananciaItem) : <span className="italic text-[10px]">sin costo</span>}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p className="text-xs text-slate-400 italic">Sin artículos</p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
}
