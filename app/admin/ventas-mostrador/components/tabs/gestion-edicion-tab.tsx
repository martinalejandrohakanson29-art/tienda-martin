"use client";

import React, { useState } from "react";
import {
  Search,
  RefreshCcw,
  ChevronDown,
  Edit,
  AlertTriangle,
  History,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Props {
  listado: {
    fechaDesde: string;
    setFechaDesde: (val: string) => void;
    fechaHasta: string;
    setFechaHasta: (val: string) => void;
    isLoadingVentas: boolean;
    isLoadingML: boolean;
    filtroPuntoVenta: string[];
    setFiltroPuntoVenta: React.Dispatch<React.SetStateAction<string[]>>;
    tipoBusqueda: TipoBusqueda;
    setTipoBusqueda: (val: TipoBusqueda) => void;
    filtroBusquedaTexto: string;
    setFiltroBusquedaTexto: (val: string) => void;
    ventasParaTabla: any[];
    mostrandoGlobal: boolean;
    ventasGlobales: any[] | null;
    handleCargar: () => Promise<void>;
  };
  puntosVenta: PuntoVenta[];
  onCopiarTexto: (texto: string) => void;
  onEditarVenta: (venta: any) => void;
  onAnularConNC: (ventaId: string) => void;
  onAbrirHistorial: (ventaId: string) => void;
  onEliminarVenta: (venta: any) => void;
  isFacturando: boolean;
}

export function GestionEdicionTab({
  listado,
  puntosVenta,
  onCopiarTexto,
  onEditarVenta,
  onAnularConNC,
  onAbrirHistorial,
  onEliminarVenta,
  isFacturando,
}: Props) {
  const {
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    isLoadingVentas,
    isLoadingML,
    filtroPuntoVenta,
    setFiltroPuntoVenta,
    tipoBusqueda,
    setTipoBusqueda,
    filtroBusquedaTexto,
    setFiltroBusquedaTexto,
    ventasParaTabla,
    mostrandoGlobal,
    ventasGlobales,
    handleCargar,
  } = listado;

  const [isPuntoVentaOpen, setIsPuntoVentaOpen] = useState(false);

  const renderParaDisplay = (para: string) => {
    if (!para) return "-";
    if (para.trim().startsWith("[") || para.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(para);
        if (Array.isArray(parsed)) {
          return `${parsed[0]?.razonSocial || parsed[0]?.nombre || "?"} (+${
            parsed.length - 1
          })`;
        }
      } catch {
        return para;
      }
    }
    return para;
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden h-full select-text">
      <main className="flex-grow flex flex-col p-4 md:p-6 max-w-[1800px] mx-auto w-full gap-3.5 overflow-hidden h-full">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-xs flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-end gap-3 flex-grow">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Filtrar por Fecha
              </Label>
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
                  className="rounded-xl border-amber-300 h-10 w-10 text-amber-700 hover:bg-amber-100/50"
                  title="Recargar"
                >
                  <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            <div className="space-y-1 relative">
              <Label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Punto de Venta
              </Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPuntoVentaOpen(!isPuntoVentaOpen)}
                className="h-10 px-3 text-xs rounded-xl border-amber-300 font-medium bg-white flex items-center justify-between min-w-[160px]"
              >
                <span className="truncate">
                  {filtroPuntoVenta.length === 0
                    ? "Todos los Puntos"
                    : filtroPuntoVenta.length === 1
                    ? puntosVenta.find((p) => p.id === filtroPuntoVenta[0])?.nombre
                    : `${filtroPuntoVenta.length} Seleccionados`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-amber-500 ml-2" />
              </Button>

              {isPuntoVentaOpen && (
                <div className="absolute z-50 mt-1 p-2 w-56 rounded-xl shadow-xl bg-white border border-amber-200 top-full left-0">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-2 p-2 hover:bg-amber-50 rounded-lg cursor-pointer text-xs font-semibold text-amber-900"
                      onClick={() => {
                        setFiltroPuntoVenta([]);
                        setIsPuntoVentaOpen(false);
                      }}
                    >
                      <div
                        className={`h-4 w-4 rounded border flex items-center justify-center ${
                          filtroPuntoVenta.length === 0
                            ? "bg-amber-600 border-amber-600"
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
                            className={`flex items-center gap-2 p-2 hover:bg-amber-50 rounded-lg cursor-pointer text-xs ${
                              sel ? "bg-amber-100/50 font-bold text-amber-900" : "text-slate-600"
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
                                sel ? "bg-amber-600 border-amber-600" : "border-slate-300"
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

            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Filtrar por
              </Label>
              <div className="flex items-center rounded-xl overflow-hidden border border-amber-300 bg-white shadow-xs focus-within:border-amber-500">
                <select
                  value={tipoBusqueda}
                  onChange={(e) => setTipoBusqueda(e.target.value as any)}
                  className="h-10 bg-amber-50/50 border-r border-amber-200 px-2.5 text-[11px] font-bold uppercase text-amber-800 focus:outline-none cursor-pointer"
                >
                  <option value="venta">Venta</option>
                  <option value="cliente">Cliente</option>
                  <option value="articulo">Artículo</option>
                  <option value="mla_venta">Id ML</option>
                  <option value="mla_envio">Id Envío ML</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-amber-400" />
                  <Input
                    placeholder="Buscar para modificar..."
                    value={filtroBusquedaTexto}
                    onChange={(e) => setFiltroBusquedaTexto(e.target.value)}
                    className="h-10 border-none focus-visible:ring-0 pl-9 text-xs w-48 shadow-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-amber-900 font-bold flex items-center gap-1.5 justify-end">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Área de Modificaciones
            </p>
            <p className="text-[11px] text-amber-700">
              Todas las ediciones quedan registradas en el historial.
            </p>
          </div>
        </div>

        {/* Tabla administrativa */}
        <div className="flex-grow bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-grow h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-xs">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase py-2.5">ID Venta</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Fecha</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Cliente</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Método</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Origen / Cupón</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Destino / Trans.</TableHead>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Info Extra</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase py-2.5">Total</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase py-2.5">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostrandoGlobal && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-2 px-4 bg-amber-50 border-b border-amber-200">
                      <p className="text-xs text-amber-800 font-semibold">
                        Resultados fuera del rango de fechas — {ventasGlobales?.length || 0} venta/s encontrada/s
                      </p>
                    </TableCell>
                  </TableRow>
                )}

                {ventasParaTabla.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-20 text-center text-slate-400 text-xs italic">
                      No se encontraron ventas con estos filtros para gestión.
                    </TableCell>
                  </TableRow>
                ) : (
                  ventasParaTabla.map((v) => (
                    <TableRow key={v.id} className="hover:bg-slate-50/70 transition-colors border-b border-slate-100">
                      <TableCell className="py-3">
                        <span
                          className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer hover:text-blue-600"
                          onClick={() => onCopiarTexto(v.id)}
                          title="Click para copiar ID completo"
                        >
                          {v.numeroVenta ? `#${v.numeroVenta}` : v.id.slice(0, 8)}
                        </span>
                      </TableCell>

                      <TableCell className="py-3 text-xs text-slate-600">
                        {new Date(v.createdAt).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </TableCell>

                      <TableCell className="py-3 text-xs font-bold text-slate-800">
                        {v.cliente}
                      </TableCell>

                      <TableCell className="py-3 text-xs">
                        <span className="font-semibold text-slate-700">{v.metodo_pago}</span>
                      </TableCell>

                      <TableCell className="py-3 text-xs font-mono text-slate-500">
                        {(v.metodo_pago === "Cruzada" || v.metodo_pago === "Mixto") ? v.de || "-" : v.cupon || "-"}
                      </TableCell>

                      <TableCell className="py-3 text-xs font-mono text-slate-500">
                        {(v.metodo_pago === "Cruzada" || v.metodo_pago === "Mixto")
                          ? renderParaDisplay(v.para)
                          : v.transaccionId || "-"}
                      </TableCell>

                      <TableCell className="py-3 text-xs text-slate-500 max-w-[180px] truncate">
                        {v.info || "-"}
                      </TableCell>

                      <TableCell className="py-3 text-right font-black text-slate-900 text-xs">
                        $ {Number(v.totalFinal || v.total).toLocaleString("es-AR")}
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!v.info?.includes("ANULADA CON NC") && v.estadoPedido !== "CANCELADO" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEditarVenta(v)}
                                className="border-amber-300 text-amber-800 hover:bg-amber-50 h-8 px-2.5 text-xs font-bold"
                              >
                                <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                              </Button>

                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onAnularConNC(v.id)}
                                disabled={isFacturando || !v.cae}
                                className="bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300 h-8 px-2.5 text-xs font-bold disabled:opacity-50"
                              >
                                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Anular (NC)
                              </Button>
                            </>
                          )}

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onAbrirHistorial(v.id)}
                            className="bg-slate-100 text-slate-700 hover:bg-slate-200 h-8 px-2.5 text-xs font-semibold"
                          >
                            <History className="h-3.5 w-3.5 mr-1" /> Historial
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onEliminarVenta(v)}
                            className="bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 h-8 px-2.5 text-xs font-bold"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
