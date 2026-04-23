"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
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
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  ArrowLeft,
  RefreshCcw,
  ChevronDown,
  Eye,
  Download,
} from "lucide-react";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosCompra,
  confirmarPedidoCompra,
  eliminarPedidoCompra,
  actualizarEstadoPedidoCompra,
  obtenerPedidoCompraPorId,
  actualizarPedidoCompra,
  obtenerURLDescargaPDFCompra,
} from "@/app/actions/compras";

type ItemCompra = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
};

type Compra = {
  id: string;
  proveedor: string;
  comprador: string;
  total: number;
  interes: number;
  descuento: number;
  totalFinal: number;
  metodo_pago: string;
  createdAt: string;
  tipoCompra: string;
  items: ItemCompra[];
  dni?: string | null;
  telefono?: string | null;
  info?: string | null;
  estadoPedido?: string | null;
  pdfUrl?: string | null;
  numeroCompra?: number;
};

interface PedidosCompraClientProps {
  initialData: any[];
}

export default function PedidosCompraClient({ initialData }: PedidosCompraClientProps) {
  const [compras, setCompras] = useState<Compra[]>(initialData as Compra[]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split("T")[0]);
  const [compraSeleccionada, setCompraSeleccionada] = useState<Compra | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isEliminarDialogOpen, setIsEliminarDialogOpen] = useState(false);
  const [compraParaEliminar, setCompraParaEliminar] = useState<Compra | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedCompras, setExpandedCompras] = useState<Set<string>>(new Set());

  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidosCompra(fechaDesde, fechaHasta);
      setCompras(data as Compra[]);
    } catch (err) {
      console.error("Error al cargar pedidos:", err);
      setError("No se pudieron cargar los pedidos de compra");
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmarPedido = (compra: Compra) => {
    setCompraSeleccionada(compra);
    setIsConfirmDialogOpen(true);
  };

  const handleEliminarPedido = (compra: Compra) => {
    setCompraParaEliminar(compra);
    setIsEliminarDialogOpen(true);
  };

  const handleVerPDF = (compra: Compra) => {
    window.open(`/admin/erp/pedidos-compra/pdf/${compra.id}`, '_blank');
  };

  const confirmarPedido = async () => {
    if (!compraSeleccionada) return;

    try {
      setIsProcessing(true);
      const result = await confirmarPedidoCompra(compraSeleccionada.id);
      if (result.success) {
        setCompraSeleccionada(null);
        setIsConfirmDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al confirmar el pedido");
      }
    } catch (err) {
      console.error("Error al confirmar pedido:", err);
      alert("Error al confirmar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const eliminarPedido = async () => {
    if (!compraParaEliminar) return;

    try {
      setIsProcessing(true);
      const result = await eliminarPedidoCompra(compraParaEliminar.id);
      if (result.success) {
        setCompraParaEliminar(null);
        setIsEliminarDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al eliminar el pedido");
      }
    } catch (err) {
      console.error("Error al eliminar pedido:", err);
      alert("Error al eliminar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarEstado = async (compraId: string, nuevoEstado: string) => {
    try {
      setIsProcessing(true);
      const result = await actualizarEstadoPedidoCompra(compraId, nuevoEstado);
      if (result.success) {
        cargarPedidos();
      } else {
        alert(result.error || "Error al actualizar el estado");
      }
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPDF = async (compraId: string) => {
    try {
      setIsProcessing(true);
      const result = await obtenerURLDescargaPDFCompra(compraId);
      if (result.success && result.url) {
        window.open(result.url, '_blank');
      } else {
        alert(result.error || "Error al obtener el enlace de descarga");
      }
    } catch (err) {
      console.error("Error al descargar PDF:", err);
      alert("Error al procesar la descarga");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    // Solo cargar si las fechas cambian después del montaje inicial
    if (fechaDesde && fechaHasta) {
      // Evitar carga inicial doble si es posible, pero aquí es seguro
      // cargarPedidos();
    }
  }, [fechaDesde, fechaHasta]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/admin/erp"
              className="flex items-center gap-2 p-2 h-auto text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
              title="Volver al ERP"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Atrás</span>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500" />
            Pedidos de Compra
          </h1>
          <p className="text-slate-400 mt-2">
            Gestión de pedidos de compra a proveedores pendientes de recibir
          </p>
        </div>

        {/* Filters */}
        <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/10 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block text-slate-300">
                Fecha Desde
              </Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="bg-[#2a2a2a] border-white/10 text-white"
              />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block text-slate-300">
                Fecha Hasta
              </Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="bg-[#2a2a2a] border-white/10 text-white"
              />
            </div>
            <div className="flex items-end gap-2">
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
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 shadow-sm overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : compras.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                No hay pedidos de compra en este período
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-white/5 border-b border-white/10">
                <TableRow>
                  <TableHead className="text-slate-300">ID</TableHead>
                  <TableHead className="text-slate-300">Proveedor</TableHead>
                  <TableHead className="text-slate-300">Comprador</TableHead>
                  <TableHead className="text-slate-300">Artículos</TableHead>
                  <TableHead className="text-right text-slate-300">Total Final</TableHead>
                  <TableHead className="text-right text-slate-300">Fecha</TableHead>
                  <TableHead className="text-center text-slate-300">Estado</TableHead>
                  <TableHead className="text-center text-slate-300">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.map((compra) => {
                  const isExpanded = expandedCompras.has(compra.id);
                  return (
                    <React.Fragment key={compra.id}>
                      <TableRow className="hover:bg-white/5 border-b border-white/5 align-top">
                        <TableCell className="font-mono text-sm text-slate-500 py-4">
                          {compra.numeroCompra || compra.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-medium text-white py-4">
                          {compra.proveedor || "Sin proveedor"}
                        </TableCell>
                        <TableCell className="text-slate-400 py-4">
                          {compra.comprador}
                        </TableCell>
                        <TableCell className="py-4">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg" onClick={() => {
                            const newExpanded = new Set(expandedCompras);
                            if (isExpanded) newExpanded.delete(compra.id);
                            else newExpanded.add(compra.id);
                            setExpandedCompras(newExpanded);
                          }}>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            <span className="ml-1 text-xs">Ver ({compra.items?.length || 0})</span>
                          </Button>
                        </TableCell>
                        <TableCell className="text-right font-bold text-white py-4">
                          {formatPrice(compra.totalFinal)}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 py-4">
                          {new Date(compra.createdAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <select
                            value={compra.estadoPedido || "PENDIENTE"}
                            onChange={(e) => handleActualizarEstado(compra.id, e.target.value)}
                            disabled={isProcessing}
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer bg-transparent ${compra.estadoPedido === 'RECIBIDO' ? 'text-green-500 border-green-500/50' :
                              compra.estadoPedido === 'CANCELADO' ? 'text-red-500 border-red-500/50' :
                                'text-amber-500 border-amber-500/50'
                              }`}
                          >
                            <option value="PENDIENTE" className="bg-[#1a1a1a]">Pendiente</option>
                            <option value="RECIBIDO" className="bg-[#1a1a1a]">Recibido</option>
                            <option value="CANCELADO" className="bg-[#1a1a1a]">Cancelado</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerPDF(compra)}
                              className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
                              title="Ver Detalles / PDF"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmarPedido(compra)}
                              className="border-green-500/50 text-green-500 hover:bg-green-500/10"
                              title="Confirmar Recepción (Registrar Compra)"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            {compra.pdfUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadPDF(compra.id)}
                                className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
                                title="Descargar PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEliminarPedido(compra)}
                              className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                              title="Eliminar Pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-white/5">
                          <TableCell colSpan={8} className="py-3 px-6">
                            {compra.info && (
                              <div className="mb-4 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                                <p className="text-[10px] font-bold text-amber-500 uppercase mb-1">Observaciones:</p>
                                <p className="text-sm text-slate-300 whitespace-pre-wrap">{compra.info}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              {compra.items?.length > 0 ? (
                                compra.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-white/5 last:border-0 pb-2 last:pb-0">
                                    <div>
                                      <span className="font-semibold text-slate-200 uppercase">{item.nombre}</span>
                                      <span className="text-[10px] text-slate-500 ml-2 font-mono uppercase">ID: {item.productoId || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-slate-400">x{item.cantidad}</span>
                                      <span className="font-bold text-slate-200">{formatPrice(item.subtotal)}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500 italic">Sin artículos</p>
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
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white sm:max-w-[450px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <CheckCircle2 className="h-5 w-5" />
              Confirmar Recepción de Compra
            </DialogTitle>
          </DialogHeader>
          {compraSeleccionada && (
            <div className="mt-4 space-y-4">
              <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20">
                <p className="text-sm text-slate-300">
                  <strong>Proveedor:</strong> {compraSeleccionada.proveedor || "Sin proveedor"}
                </p>
                <p className="text-sm text-slate-300">
                  <strong>Total Final:</strong>{" "}
                  {formatPrice(compraSeleccionada.totalFinal)}
                </p>
              </div>
              <p className="text-sm text-slate-400">
                ¿Desea confirmar que ha recibido este pedido? 
                Esto marcará la compra como confirmada y actualizará el saldo con el proveedor si el pago es a Cuenta Corriente.
                El stock ya fue incrementado al guardar el pedido.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsConfirmDialogOpen(false)}
              className="text-slate-400 hover:text-white hover:bg-white/5"
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
                  Confirmar Recepción
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminate Dialog */}
      <Dialog open={isEliminarDialogOpen} onOpenChange={setIsEliminarDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white sm:max-w-[450px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Eliminar Pedido de Compra
            </DialogTitle>
          </DialogHeader>
          {compraParaEliminar && (
            <div className="mt-4">
              <p className="text-sm text-slate-400">
                ¿Desea eliminar definitivamente este pedido de compra? 
                Se revertirá el incremento de stock realizado al crear el pedido.
                Esta acción no se puede deshacer.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsEliminarDialogOpen(false)}
              className="text-slate-400 hover:text-white hover:bg-white/5"
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
