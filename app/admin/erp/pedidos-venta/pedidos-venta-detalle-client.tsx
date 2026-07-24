"use client";

import React, { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Printer,
  ArrowRight,
  ArrowLeft,
  RefreshCcw,
  ChevronDown,
  Eye,
  Edit,
} from "lucide-react";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosVenta,
  confirmarPedidoVenta,
  eliminarPedidoVenta,
  actualizarEstadoPedido,
  obtenerPedidoPorId,
  actualizarPedidoVenta,
} from "@/app/actions/ventas-mostrador";

type ItemVenta = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  esNota?: boolean;
};

type Venta = {
  id: string;
  cliente: string;
  vendedor: string;
  total: number;
  interes: number;
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
  numeroVenta?: number;
};

export default function PedidosVentaDetalleClient() {
  const [venta, setVenta] = useState<Venta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    if (id) {
      cargarPedido(id);
    }
  }, []);

  const cargarPedido = async (ventaId: string) => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidoPorId(ventaId);
      if (data) {
        setVenta(data);
      } else {
        setError("Pedido no encontrado");
      }
    } catch (err) {
      console.error("Error al cargar pedido:", err);
      setError("No se pudo cargar los datos del pedido");
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmarPedido = async () => {
    if (!venta) return;

    try {
      setIsProcessing(true);
      await confirmarPedidoVenta(venta.id);
      window.history.replaceState({}, "", `/admin/erp/pedidos-venta`);
      window.close();
    } catch (err) {
      console.error("Error al confirmar pedido:", err);
      alert("Error al confirmar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEliminarPedido = async () => {
    if (!venta) return;

    try {
      setIsProcessing(true);
      await eliminarPedidoVenta(venta.id);
      window.history.replaceState({}, "", `/admin/erp/pedidos-venta`);
      window.close();
    } catch (err) {
      console.error("Error al eliminar pedido:", err);
      alert("Error al eliminar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarEstado = async (nuevoEstado: string) => {
    if (!venta) return;

    try {
      setIsProcessing(true);
      await actualizarEstadoPedido(venta.id, nuevoEstado);
      window.history.replaceState({}, "", `/admin/erp/pedidos-venta`);
      window.close();
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">
            {error || "No se pudo cargar los datos del pedido"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/admin/erp/pedidos-venta"
              className="flex items-center gap-2 p-2 h-auto text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
              title="Volver a la lista"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Atrás</span>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-600" />
            Detalles del Pedido
          </h1>
          <p className="text-slate-600 mt-2">
            Información completa del pedido de venta
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 border-b-2 border-slate-200">
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Artículos</TableHead>
                <TableHead className="text-right">Total Final</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-sm text-slate-500 py-4">
                  {venta.numeroVenta || venta.id.slice(0, 8)}
                </TableCell>
                <TableCell className="font-medium text-slate-900 py-4">
                  {venta.cliente || "Sin cliente"}
                </TableCell>
                <TableCell className="text-slate-700 py-4">
                  {venta.vendedor}
                </TableCell>
                <TableCell className="py-4">
                  <div className="space-y-2">
                    {venta.items?.length > 0 ? (
                      venta.items.map((item, idx) => (
                        item.esNota ? (
                          <div key={idx} className="flex items-center gap-2 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0 text-amber-800">
                            <FileText className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            <span className="italic">{item.nombre}</span>
                            <span className="text-[10px] font-black bg-amber-100 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase ml-auto">Nota</span>
                          </div>
                        ) : (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                          <div>
                            <span className="font-semibold text-slate-700 uppercase">{item.nombre}</span>
                            <span className="text-[10px] text-slate-400 ml-2 font-mono uppercase">ID: {item.productoId || "-"}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">x{item.cantidad}</span>
                            <span className="font-bold text-slate-700">{formatPrice(item.subtotal)}</span>
                          </div>
                        </div>
                        )
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">Sin artículos</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-slate-900 py-4">
                  {formatPrice(venta.totalFinal)}
                </TableCell>
                <TableCell className="text-center py-4">
                  <select
                    value={venta.estadoPedido || "PENDIENTE"}
                    onChange={(e) => handleActualizarEstado(e.target.value)}
                    disabled={isProcessing}
                    className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer ${venta.estadoPedido === 'DESPACHADO' ? 'bg-green-100 text-green-700 border-green-200' :
                        venta.estadoPedido === 'PREPARADO' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          venta.estadoPedido === 'IMPRESO' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                            venta.estadoPedido === 'LISTO_PARA_PREPARAR' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                              'bg-amber-100 text-amber-700 border-amber-200'
                      }`}
                  >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="LISTO_PARA_PREPARAR">Listo p/ Preparar</option>
                    <option value="IMPRESO">Impreso</option>
                    <option value="PREPARADO">Preparado</option>
                    <option value="DESPACHADO">Despachado</option>
                  </select>
                </TableCell>
                <TableCell className="text-center py-4">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleConfirmarPedido}
                      className="bg-green-600 text-white border-green-600 hover:bg-green-700"
                      title="Confirmar Venta"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEliminarPedido}
                      className="border-red-600 text-red-700 hover:bg-red-50"
                      title="Eliminar Pedido"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrint}
                      className="border-blue-600 text-blue-700 hover:bg-blue-50"
                      title="Imprimir Pedido"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Additional Info Section */}
          {venta.info && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Observaciones / Datos de Envío:</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{venta.info}</p>
            </div>
          )}

          {/* Contact Info */}
          {(venta.dni || venta.telefono || venta.email) && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Contacto:</h3>
              {venta.dni && (
                <p className="text-sm text-slate-600">
                  <strong>DNI:</strong> {venta.dni}
                </p>
              )}
              {venta.telefono && (
                <p className="text-sm text-slate-600">
                  <strong>Teléfono:</strong> {venta.telefono}
                </p>
              )}
              {venta.email && (
                <p className="text-sm text-slate-600">
                  <strong>Email:</strong> {venta.email}
                </p>
              )}
            </div>
          )}

          {/* Transaction Info */}
          {venta.transaccionId && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Transacción:</h3>
              <p className="text-sm text-slate-600">
                <strong>ID Transacción:</strong> {venta.transaccionId}
              </p>
            </div>
          )}

          {/* Coupon Info */}
          {venta.cupon && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Cupón:</h3>
              <p className="text-sm text-slate-600">
                <strong>Cupón:</strong> {venta.cupon}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
