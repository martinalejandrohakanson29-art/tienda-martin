"use client";

import React, { useState } from "react";
import {
  Search,
  RefreshCcw,
  ChevronDown,
  Printer,
  FileText,
  Camera,
  AlertTriangle,
  Edit,
  ArrowRightLeft,
  Trash2,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Package,
  History,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangeCalendar } from "../../date-range-calendar";
import { PuntoVenta } from "../../types";
import { TipoBusqueda } from "../../hooks/use-ventas-listado";
import { colorMetodoPago } from "../../constants";

interface Props {
  listado: {
    fechaDesde: string;
    setFechaDesde: (val: string) => void;
    fechaHasta: string;
    setFechaHasta: (val: string) => void;
    isLoadingVentas: boolean;
    isLoadingML: boolean;
    isSearchingGlobal: boolean;
    mostrarSoloOffline: boolean;
    setMostrarSoloOffline: (val: boolean) => void;
    filtroPuntoVenta: string[];
    setFiltroPuntoVenta: React.Dispatch<React.SetStateAction<string[]>>;
    tipoBusqueda: TipoBusqueda;
    setTipoBusqueda: (val: TipoBusqueda) => void;
    filtroBusquedaTexto: string;
    setFiltroBusquedaTexto: (val: string) => void;
    filtroMetodoPago: string;
    setFiltroMetodoPago: (val: string) => void;
    paginaActual: number;
    setPaginaActual: (val: number | ((prev: number) => number)) => void;
    totalPaginas: number;
    totalItems: number;
    itemsPorPagina: number;
    ventasFiltradas: any[];
    ventasParaTabla: any[];
    ventasPaginadas: any[];
    mostrandoGlobal: boolean;
    esBusquedaGlobal: boolean;
    handleCargar: () => Promise<void>;
    handleBuscarGlobal: () => Promise<void>;
  };
  puntosVenta: PuntoVenta[];
  onAbrirExportModal: () => void;
  onImprimirTicket: (venta: any) => void;
  onImprimirFactura: (venta: any) => void;
  onVerFotosVenta: (venta: any) => void;
  onVerFotosPedido: (venta: any) => void;
  onAbrirAlertaML: (venta: any) => void;
  onAbrirHistorial: (venta: any) => void;
  onEditarVenta: (venta: any) => void;
  onRefacturarVenta: (venta: any) => void;
  onEliminarVenta: (venta: any) => void;
  enviosConFoto: Set<string>;
  pedidosConFoto: Record<string, string>;
  loadingFotosVentaId: string | null;
}

export function ListadoVentasTab({
  listado,
  puntosVenta,
  onAbrirExportModal,
  onImprimirTicket,
  onImprimirFactura,
  onVerFotosVenta,
  onVerFotosPedido,
  onAbrirAlertaML,
  onAbrirHistorial,
  onEditarVenta,
  onRefacturarVenta,
  onEliminarVenta,
  enviosConFoto,
  pedidosConFoto,
  loadingFotosVentaId,
}: Props) {
  const {
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    isLoadingVentas,
    isLoadingML,
    isSearchingGlobal,
    mostrarSoloOffline,
    setMostrarSoloOffline,
    filtroPuntoVenta,
    setFiltroPuntoVenta,
    tipoBusqueda,
    setTipoBusqueda,
    filtroBusquedaTexto,
    setFiltroBusquedaTexto,
    filtroMetodoPago,
    setFiltroMetodoPago,
    paginaActual,
    setPaginaActual,
    totalPaginas,
    totalItems,
    ventasPaginadas,
    mostrandoGlobal,
    esBusquedaGlobal,
    handleCargar,
    handleBuscarGlobal,
  } = listado;

  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());
  const [isPuntoVentaOpen, setIsPuntoVentaOpen] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedVentas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden h-full">
      <main className="flex-grow flex flex-col p-4 md:p-6 max-w-[1800px] mx-auto w-full gap-3.5 overflow-hidden h-full">
        {/* Barra superior de filtros */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-end justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-end gap-3 flex-grow">
            {/* Fechas */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Rango de Fecha</Label>
              <div className="flex items-center gap-1.5">
                <DateRangeCalendar
                  fechaDesde={fechaDesde}
                  fechaHasta={fechaHasta}
                  setFechaDesde={setFechaDesde}
                  setFechaHasta={setFechaHasta}
                  onApply={handleCargar}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCargar}
                  disabled={isLoadingVentas || isLoadingML}
                  className="rounded-xl h-10 w-10 border-slate-200 text-slate-500 hover:text-blue-600"
                  title="Recargar"
                >
                  <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Punto de Venta */}
            <div className="space-y-1 relative">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Punto de Venta</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPuntoVentaOpen(!isPuntoVentaOpen)}
                className="h-10 px-3 text-xs rounded-xl border-slate-200 font-medium bg-white flex items-center justify-between min-w-[160px]"
              >
                <span className="truncate">
                  {filtroPuntoVenta.length === 0
                    ? "Todos los Puntos"
                    : filtroPuntoVenta.length === 1
                    ? puntosVenta.find((p) => p.id === filtroPuntoVenta[0])?.nombre
                    : `${filtroPuntoVenta.length} Seleccionados`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-2" />
              </Button>

              {isPuntoVentaOpen && (
                <div className="absolute z-50 mt-1 p-2 w-56 rounded-xl shadow-xl bg-white border border-slate-200 top-full left-0">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-700"
                      onClick={() => {
                        setFiltroPuntoVenta([]);
                        setIsPuntoVentaOpen(false);
                      }}
                    >
                      <div
                        className={`h-4 w-4 rounded border flex items-center justify-center ${
                          filtroPuntoVenta.length === 0
                            ? "bg-blue-600 border-blue-600"
                            : "border-slate-300"
                        }`}
                      >
                        {filtroPuntoVenta.length === 0 && (
                          <CheckCircle className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <span>Todos los Puntos</span>
                    </div>
                    <div className="h-px bg-slate-100 my-1" />
                    <div className="max-h-52 overflow-y-auto space-y-1">
                      {puntosVenta.map((p) => {
                        const sel = filtroPuntoVenta.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer text-xs ${
                              sel ? "bg-blue-50/60 font-semibold text-blue-700" : "text-slate-600"
                            }`}
                            onClick={() => {
                              if (sel) {
                                setFiltroPuntoVenta((prev) => prev.filter((id) => id !== p.id));
                              } else {
                                setFiltroPuntoVenta((prev) => [...prev, p.id]);
                              }
                            }}
                          >
                            <div
                              className={`h-4 w-4 rounded border flex items-center justify-center ${
                                sel ? "bg-blue-600 border-blue-600" : "border-slate-300"
                              }`}
                            >
                              {sel && <CheckCircle className="h-3 w-3 text-white" />}
                            </div>
                            <span className="truncate">{p.nombre}</span>
                            {p.color && (
                              <div
                                className="h-2 w-2 rounded-full ml-auto shrink-0"
                                style={{ backgroundColor: p.color }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Buscador de texto con selector de campo */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Filtrar por</Label>
              <div className="flex items-center rounded-xl overflow-hidden border border-slate-200 shadow-xs focus-within:border-blue-500">
                <select
                  value={tipoBusqueda}
                  onChange={(e) => setTipoBusqueda(e.target.value as any)}
                  className="h-10 bg-slate-50 border-r border-slate-200 px-2.5 text-[11px] font-bold uppercase text-slate-600 focus:outline-none cursor-pointer"
                >
                  <option value="venta">Venta</option>
                  <option value="cliente">Cliente</option>
                  <option value="articulo">Artículo</option>
                  <option value="mla_venta">Id ML</option>
                  <option value="mla_envio">Id Envío ML</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Escribe para buscar..."
                    value={filtroBusquedaTexto}
                    onChange={(e) => setFiltroBusquedaTexto(e.target.value)}
                    className="h-10 border-none focus-visible:ring-0 pl-9 text-xs w-44 sm:w-56 shadow-none"
                  />
                </div>
              </div>
            </div>

            {/* Búsqueda global si aplica */}
            {esBusquedaGlobal && filtroBusquedaTexto.trim() && (
              <Button
                variant="secondary"
                onClick={handleBuscarGlobal}
                disabled={isSearchingGlobal}
                className="h-10 px-3.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold gap-1.5"
              >
                <Search className="h-3.5 w-3.5" />
                {isSearchingGlobal ? "Buscando en BD..." : "Búsqueda Global"}
              </Button>
            )}

            {/* Método de pago */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Método de Pago</Label>
              <select
                value={filtroMetodoPago}
                onChange={(e) => setFiltroMetodoPago(e.target.value)}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-3 text-xs focus:outline-none"
              >
                <option value="">Todos</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                <option value="MercadoLibre">MercadoLibre</option>
                <option value="MercadoPago">MercadoPago</option>
                <option value="Cruzada">Cruzada</option>
                <option value="A Cuenta Corriente">A Cuenta Corriente</option>
              </select>
            </div>

            {/* Solo Offline */}
            <div className="flex items-center space-x-2 bg-slate-50 px-3 h-10 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                id="filterOfflineTab"
                checked={mostrarSoloOffline}
                onChange={(e) => setMostrarSoloOffline(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-600"
              />
              <Label htmlFor="filterOfflineTab" className="text-xs font-bold text-slate-700 cursor-pointer">
                Offline
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={onAbrirExportModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 text-xs font-bold gap-2 shadow-sm"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </Button>
          </div>
        </div>

        {/* Banner de búsqueda global activa */}
        {mostrandoGlobal && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center justify-between text-xs text-sky-900 font-semibold shrink-0">
            <span>Resultados de Búsqueda Global en toda la base de datos</span>
            <Badge className="bg-sky-200 text-sky-800 border-none font-bold">
              {totalItems} encontrados
            </Badge>
          </div>
        )}

        {/* Tabla paginada de ventas */}
        <div className="flex-grow bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-grow h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-xs">
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Venta / Fecha</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Cliente</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Método de Pago</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Pto. Venta</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase py-2.5">Total</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase py-2.5">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingVentas ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-20 text-center text-slate-400 text-xs font-medium">
                      Cargando ventas del período...
                    </TableCell>
                  </TableRow>
                ) : ventasPaginadas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-20 text-center text-slate-400 text-xs italic">
                      No hay ventas registradas que coincidan con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  ventasPaginadas.map((v) => {
                    const isExpanded = expandedVentas.has(v.id);
                    const tieneFotoML = !!v.mlIdEnvio && enviosConFoto.has(v.mlIdEnvio);
                    const estadoFotoPedido = pedidosConFoto[v.id];

                    return (
                      <React.Fragment key={v.id}>
                        <TableRow className="hover:bg-slate-50/70 transition-colors border-b border-slate-100">
                          <TableCell className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleExpand(v.id)}
                              className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform duration-200 ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </TableCell>

                          <TableCell className="py-2.5 text-xs font-medium">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">
                                {v.numeroVenta ? `#${v.numeroVenta}` : v.id.slice(0, 8)}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {new Date(v.createdAt).toLocaleDateString("es-AR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5 text-xs font-semibold text-slate-800">
                            <div className="flex flex-col">
                              <span>{v.cliente || "Consumidor Final"}</span>
                              {v.dni && <span className="text-[11px] text-slate-400 font-mono">{v.dni}</span>}
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5 text-xs">
                            <Badge
                              variant="outline"
                              className="font-semibold text-xs rounded-lg border"
                              style={{
                                borderColor: colorMetodoPago(v.metodo_pago),
                                color: colorMetodoPago(v.metodo_pago),
                              }}
                            >
                              {v.metodo_pago}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-2.5 text-xs">
                            {v.puntoVenta ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                                  style={{ backgroundColor: v.puntoVenta.color || "#64748b" }}
                                />
                                <span
                                  className="font-bold tracking-tight"
                                  style={{ color: v.puntoVenta.color || "#334155" }}
                                >
                                  {v.puntoVenta.nombre}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full shrink-0 bg-slate-400" />
                                <span className="font-semibold text-slate-600">Mostrador</span>
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 text-right font-black text-slate-900 text-sm">
                            $ {Number(v.totalFinal || v.total).toLocaleString("es-AR")}
                          </TableCell>

                          {/* Acciones */}
                          <TableCell className="py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onImprimirTicket(v)}
                                className="h-7 w-7 text-slate-500 hover:text-slate-900"
                                title="Imprimir Ticket"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onImprimirFactura(v)}
                                className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                                title={v.cae ? "Ver Factura AFIP (A4)" : "Ver Comprobante (A4)"}
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>

                              {v.mlIdEnvio && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onVerFotosVenta(v)}
                                  disabled={loadingFotosVentaId === v.id || !tieneFotoML}
                                  className={`h-7 w-7 ${
                                    tieneFotoML
                                      ? "text-indigo-600 hover:bg-indigo-50"
                                      : "text-slate-300 cursor-not-allowed"
                                  }`}
                                  title="Fotos de Preparación ML"
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              {estadoFotoPedido && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onVerFotosPedido(v)}
                                  className="h-7 w-7 text-indigo-600 hover:bg-indigo-50"
                                  title="Fotos de Preparación Pedido"
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onAbrirAlertaML(v)}
                                className={`h-7 w-7 ${
                                  v.mlAlerta ? "text-orange-600 bg-orange-50" : "text-slate-400 hover:text-orange-500"
                                }`}
                                title="Alerta Mercado Libre"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onAbrirHistorial(v)}
                                className="h-7 w-7 text-slate-400 hover:text-slate-700"
                                title="Historial de Modificaciones"
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEditarVenta(v)}
                                className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                                title="Editar Venta"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>

                              {v.tipoComprobante === 6 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onRefacturarVenta(v)}
                                  className="h-7 w-7 text-violet-600 hover:bg-violet-50"
                                  title="Refacturar como Factura A"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEliminarVenta(v)}
                                className="h-7 w-7 text-red-500 hover:bg-red-50"
                                title={v.cae ? "Anular con Nota de Crédito" : "Eliminar Venta"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Desglose de ítems (Acordeón) */}
                        {isExpanded && (
                          <TableRow className="bg-slate-50/50">
                            <TableCell colSpan={7} className="p-3 pl-12">
                              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                                <p className="text-[11px] font-bold text-slate-500 uppercase">
                                  Detalle de Artículos ({v.items?.length || 0})
                                </p>
                                <div className="space-y-1">
                                  {(v.items || []).map((item: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-600">{item.cantidad}x</span>
                                        <span className="font-medium text-slate-800">{item.nombre}</span>
                                      </div>
                                      <span className="font-bold text-slate-800">
                                        $ {Number(item.subtotal).toLocaleString("es-AR")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
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

          {/* Footer de Paginación */}
          <div className="bg-white border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span>
              Mostrando {ventasPaginadas.length} de {totalItems} ventas
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaActual <= 1}
                className="h-8 px-2 rounded-lg border-slate-200"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>

              <span className="font-semibold text-slate-700">
                Pág. {paginaActual} / {totalPaginas}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual >= totalPaginas}
                className="h-8 px-2 rounded-lg border-slate-200"
              >
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
