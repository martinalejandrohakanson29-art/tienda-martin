"use client";

import React, { useState } from "react";
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
  CheckCircle2,
  Printer,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { confirmarPedidoVenta, eliminarPedidoVenta, actualizarEstadoPedido } from "@/app/actions/ventas-mostrador";

type ItemVenta = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
};

type Pedido = {
  id: string;
  cliente: string;
  vendedor: string;
  total: number;
  interes: number;
  totalFinal: number;
  metodo_pago: string;
  createdAt: string;
  tipoVenta: string;
  estadoPedido?: string | null;
  dni?: string | null;
  telefono?: string | null;
  email?: string | null;
  info?: string | null;
  cupon?: string | null;
  transaccionId?: string | null;
  de?: string | null;
  para?: string | null;
  eventoOffline?: boolean;
  puntoVentaId?: string | null;
  items: ItemVenta[];
};

interface PedidoPDFClientProps {
  pedido: Pedido;
}

export default function PedidoPDFClient({ pedido }: PedidoPDFClientProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirmarPedido = async () => {
    try {
      setIsProcessing(true);
      await confirmarPedidoVenta(pedido.id);
      window.location.href = `/admin/erp/pedidos-venta`;
    } catch (err) {
      alert("Error al confirmar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEliminarPedido = async () => {
    if (!confirm("¿Está seguro que desea eliminar este pedido?")) return;
    try {
      setIsProcessing(true);
      await eliminarPedidoVenta(pedido.id);
      window.location.href = `/admin/erp/pedidos-venta`;
    } catch (err) {
      alert("Error al eliminar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarEstado = async (nuevoEstado: string) => {
    try {
      setIsProcessing(true);
      await actualizarEstadoPedido(pedido.id, nuevoEstado);
      window.location.href = window.location.href;
    } catch (err) {
      alert("Error al actualizar el estado. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <h1 className="text-3xl font-bold text-slate-900">
              Detalles del Pedido
            </h1>
            <p className="text-slate-600 mt-2">
              Información completa del pedido de venta
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-blue-600 text-blue-700 hover:bg-blue-50"
            title="Imprimir Pedido"
          >
            <Printer className="h-4 w-4 mr-1" />
            Imprimir
          </Button>
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
                  {pedido.id.slice(0, 8)}
                </TableCell>
                <TableCell className="font-medium text-slate-900 py-4">
                  {pedido.cliente || "Sin cliente"}
                </TableCell>
                <TableCell className="text-slate-700 py-4">
                  {pedido.vendedor}
                </TableCell>
                <TableCell className="py-4">
                  <div className="space-y-2">
                    {pedido.items?.length > 0 ? (
                      pedido.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0"
                        >
                          <div>
                            <span className="font-semibold text-slate-700 uppercase">
                              {item.nombre}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-2 font-mono uppercase">
                              ID: {item.productoId || "-"}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">
                              x{item.cantidad}
                            </span>
                            <span className="font-bold text-slate-700">
                              {formatPrice(item.subtotal)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        Sin artículos
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-slate-900 py-4">
                  {formatPrice(pedido.totalFinal)}
                </TableCell>
                <TableCell className="text-center py-4">
                  <select
                    value={pedido.estadoPedido || "PENDIENTE"}
                    onChange={(e) => handleActualizarEstado(e.target.value)}
                    disabled={isProcessing}
                    className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer ${
                      pedido.estadoPedido === "DESPACHADO"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : pedido.estadoPedido === "PREPARADO"
                          ? "bg-blue-100 text-blue-700 border-blue-200"
                          : pedido.estadoPedido === "LISTO_PARA_PREPARAR"
                            ? "bg-purple-100 text-purple-700 border-purple-200"
                            : "bg-amber-100 text-amber-700 border-amber-200"
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
                      onClick={handleConfirmarPedido}
                      disabled={isProcessing}
                      className="bg-green-600 text-white border-green-600 hover:bg-green-700"
                      title="Confirmar Venta"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEliminarPedido}
                      disabled={isProcessing}
                      className="border-red-600 text-red-700 hover:bg-red-50"
                      title="Eliminar Pedido"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Additional Info Section */}
          {pedido.info && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">
                Observaciones / Datos de Envío:
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {pedido.info}
              </p>
            </div>
          )}

          {/* Contact Info */}
          {(pedido.dni || pedido.telefono || pedido.email) && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">
                Contacto:
              </h3>
              {pedido.dni && (
                <p className="text-sm text-slate-600">
                  <strong>DNI:</strong> {pedido.dni}
                </p>
              )}
              {pedido.telefono && (
                <p className="text-sm text-slate-600">
                  <strong>Teléfono:</strong> {pedido.telefono}
                </p>
              )}
              {pedido.email && (
                <p className="text-sm text-slate-600">
                  <strong>Email:</strong> {pedido.email}
                </p>
              )}
            </div>
          )}

          {/* Transaction Info */}
          {pedido.transaccionId && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">
                Transacción:
              </h3>
              <p className="text-sm text-slate-600">
                <strong>ID Transacción:</strong> {pedido.transaccionId}
              </p>
            </div>
          )}

          {/* Coupon Info */}
          {pedido.cupon && (
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Cupón:</h3>
              <p className="text-sm text-slate-600">
                <strong>Cupón:</strong> {pedido.cupon}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
