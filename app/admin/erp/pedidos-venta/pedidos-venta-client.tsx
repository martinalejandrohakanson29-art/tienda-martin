"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Printer,
  ArrowRight,
  RefreshCcw,
  ChevronDown,
} from "lucide-react";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosVenta,
  confirmarPedidoVenta,
  eliminarPedidoVenta,
  actualizarEstadoPedido,
} from "@/app/actions/ventas-mostrador";

type ItemVenta = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
};

type Venta = {
  id: string;
  cliente: string;
  vendedor: string;
  total: number;
  totalFinal: number;
  metodo_pago: string;
  createdAt: string;
  tipoVenta: string;
  items: ItemVenta[];
  dni?: string | null;
  telefono?: string | null;
  info?: string | null;
  cupon?: string | null;
  transaccionId?: string | null;
  de?: string | null;
  para?: string | null;
  email?: string | null;
  eventoOffline?: boolean;
  puntoVentaId?: string | null;
  estadoPedido?: string | null;
};

export default function PedidosVentaClient() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split("T")[0]);
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isEliminarDialogOpen, setIsEliminarDialogOpen] = useState(false);
  const [ventaParaEliminar, setVentaParaEliminar] = useState<Venta | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());

  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidosVenta(fechaDesde, fechaHasta);
      setVentas(data);
    } catch (err) {
      console.error("Error al cargar pedidos:", err);
      setError("No se pudieron cargar los pedidos de venta");
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmarPedido = (venta: Venta) => {
    setVentaSeleccionada(venta);
    setIsConfirmDialogOpen(true);
  };

  const handleEliminarPedido = (venta: Venta) => {
    setVentaParaEliminar(venta);
    setIsEliminarDialogOpen(true);
  };

  const confirmarPedido = async () => {
    if (!ventaSeleccionada) return;

    try {
      setIsProcessing(true);
      await confirmarPedidoVenta(ventaSeleccionada.id);
      setVentaSeleccionada(null);
      setIsConfirmDialogOpen(false);
      cargarPedidos();
    } catch (err) {
      console.error("Error al confirmar pedido:", err);
      alert("Error al confirmar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const eliminarPedido = async () => {
    if (!ventaParaEliminar) return;

    try {
      setIsProcessing(true);
      await eliminarPedidoVenta(ventaParaEliminar.id);
      setVentaParaEliminar(null);
      setIsEliminarDialogOpen(false);
      cargarPedidos();
    } catch (err) {
      console.error("Error al eliminar pedido:", err);
      alert("Error al eliminar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarEstado = async (ventaId: string, nuevoEstado: string) => {
    try {
      setIsProcessing(true);
      await actualizarEstadoPedido(ventaId, nuevoEstado);
      cargarPedidos();
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = (venta: Venta) => {
    window.print();
  };

  const ventasPorVendedor = useMemo(() => {
    const ventasPorVendedorMap = new Map<string, { total: number; count: number }>();
    ventas.forEach((venta) => {
      const vendedor = venta.vendedor;
      if (!ventasPorVendedorMap.has(vendedor)) {
        ventasPorVendedorMap.set(vendedor, { total: 0, count: 0 });
      }
      const vendedorData = ventasPorVendedorMap.get(vendedor)!;
      vendedorData.total += venta.totalFinal;
      vendedorData.count += 1;
    });
    return Array.from(ventasPorVendedorMap.entries())
      .map(([vendedor, data]) => ({ vendedor, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [ventas]);

  useEffect(() => {
    cargarPedidos();
  }, [fechaDesde, fechaHasta]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-600" />
            Pedidos de Venta
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de pedidos de venta pendientes de confirmación
          </p>
        </div>



        {/* Filters */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Fecha Desde
              </Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="border-slate-300"
              />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Fecha Hasta
              </Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="border-slate-300"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={cargarPedidos}
                disabled={cargando}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6"
              >
                {cargando ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Filtrar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : ventas.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">
                No hay pedidos de venta en este período
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 border-b-2 border-slate-200">
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead className="text-right">Total Final</TableHead>
                  <TableHead className="text-right">Fecha</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.map((venta) => {
                  const isExpanded = expandedVentas.has(venta.id);
                  return (
                    <React.Fragment key={venta.id}>
                      <TableRow className="hover:bg-slate-50 align-top">
                        <TableCell className="font-mono text-sm text-slate-500 py-4">
                          {venta.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 py-4">
                          {venta.cliente || "Sin cliente"}
                        </TableCell>
                        <TableCell className="text-slate-700 py-4">
                          {venta.vendedor}
                        </TableCell>
                        <TableCell className="py-4">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg" onClick={() => {
                            const newExpanded = new Set(expandedVentas);
                            if (isExpanded) newExpanded.delete(venta.id);
                            else newExpanded.add(venta.id);
                            setExpandedVentas(newExpanded);
                          }}>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            <span className="ml-1 text-xs">Ver ({venta.items?.length || 0})</span>
                          </Button>
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-900 py-4">
                          {formatPrice(venta.totalFinal)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 py-4">
                          {new Date(venta.createdAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <select 
                            value={venta.estadoPedido || "PENDIENTE"}
                            onChange={(e) => handleActualizarEstado(venta.id, e.target.value)}
                            disabled={isProcessing}
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer ${
                              venta.estadoPedido === 'DESPACHADO' ? 'bg-green-100 text-green-700 border-green-200' :
                              venta.estadoPedido === 'PREPARADO' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              venta.estadoPedido === 'LISTO_PARA_PREPARAR' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                              'bg-amber-100 text-amber-700 border-amber-200'
                            }`}
                          >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="LISTO_PARA_PREPARAR">Listo p/ Preparar</option>
                            <option value="PREPARADO">Preparado</option>
                            <option value="DESPACHADO">Despachado</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmarPedido(venta)}
                              className="border-green-600 text-green-700 hover:bg-green-50"
                              title="Registrar Venta"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEliminarPedido(venta)}
                              className="border-red-600 text-red-700 hover:bg-red-50"
                              title="Eliminar Pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-slate-50/50">
                          <TableCell colSpan={8} className="py-3 px-6">
                            {venta.info && (
                              <div className="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                                <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Observaciones / Datos de Envío:</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{venta.info}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              {venta.items?.length > 0 ? (
                                venta.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                    <div>
                                      <span className="font-semibold text-slate-700 uppercase">{item.nombre}</span>
                                      <span className="text-[10px] text-slate-400 ml-2 font-mono uppercase">ID: {item.productoId || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">x{item.cantidad}</span>
                                      <span className="font-bold text-slate-700">{formatPrice(item.subtotal)}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-slate-400 italic">Sin artículos</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>


      </div>

      {/* Confirm Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl border-amber-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900">
              <Clock className="h-5 w-5" />
              Confirmar Pedido de Venta
            </DialogTitle>
          </DialogHeader>
          {ventaSeleccionada && (
            <div className="mt-4 space-y-4">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-800">
                  <strong>Cliente:</strong> {ventaSeleccionada.cliente || "Sin cliente"}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Total:</strong> {formatPrice(ventaSeleccionada.total)}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Total Final:</strong>{" "}
                  {formatPrice(ventaSeleccionada.totalFinal)}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Fecha:</strong>{" "}
                  {new Date(ventaSeleccionada.createdAt).toLocaleDateString(
                    "es-AR"
                  )}
                </p>
              </div>
              <p className="text-sm text-slate-600">
                ¿Desea registrar este pedido como una venta completada? Se descontará el stock correspondiente y el pedido desaparecerá de esta lista para pasar a Ventas Realizadas.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarPedido}
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Registrar Venta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminate Dialog */}
      <Dialog open={isEliminarDialogOpen} onOpenChange={setIsEliminarDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl border-red-200">
          <DialogHeader>
            <DialogTitle className="text-red-900">
              Eliminar Pedido de Venta
            </DialogTitle>
          </DialogHeader>
          {ventaParaEliminar && (
            <div className="mt-4">
              <p className="text-sm text-slate-600">
                ¿Desea eliminar definitivamente este pedido de venta? Esta acción
                no se puede deshacer.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsEliminarDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={eliminarPedido}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Pedido
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
