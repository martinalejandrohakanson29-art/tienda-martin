"use client";

import React, { useState, useEffect } from "react";
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

  // Auto-lanzar ventana de impresión al abrir (para Guardar como PDF)
  useEffect(() => {
    // 800ms ayuda a asegurar que los estilos de Tailwind carguen antes de imprimir
    const timer = setTimeout(() => {
      window.print();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

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
    <div className="min-h-screen bg-slate-50 print:bg-white print:m-0 print:p-0">
      <div className="max-w-7xl mx-auto px-4 py-8 print:max-w-none print:w-full print:px-0 print:py-4">
        {/* Header - Solo visible en pantalla web, oculto en PDF */}
        <div className="mb-8 flex items-center justify-between print:hidden">
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

        {/* Encabezado especial y purificado para el PDF */}
        <div className="hidden print:block mb-8 border-b-2 border-slate-300 pb-4">
          <h1 className="text-2xl font-bold text-black uppercase">Pedido de Venta</h1>
          <p className="text-sm text-gray-500 mt-1"><strong>ID:</strong> {pedido.id}</p>
          <p className="text-sm text-gray-500"><strong>Fecha:</strong> {new Date(pedido.createdAt).toLocaleDateString("es-AR")} {new Date(pedido.createdAt).toLocaleTimeString("es-AR").slice(0, 5)}</p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none print:rounded-none">
          <Table className="print:text-sm">
            <TableHeader className="bg-slate-50 border-b-2 border-slate-200 print:bg-transparent print:border-b-2 print:border-black">
              <TableRow>
                <TableHead className="w-16 print:text-black">ID</TableHead>
                <TableHead className="print:text-black">Cliente</TableHead>
                <TableHead className="print:text-black">Vendedor</TableHead>
                <TableHead className="print:text-black">Artículos</TableHead>
                <TableHead className="text-right print:text-black">Total</TableHead>
                {/* Ocultamos la columna de estados y botones a la hora del PDF */}
                <TableHead className="text-center print:hidden">Estado</TableHead>
                <TableHead className="text-center print:hidden">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="print:border-b print:border-slate-300">
                <TableCell className="font-mono text-sm text-slate-500 py-4 print:text-black print:p-2">
                  {pedido.id.slice(0, 8)}
                </TableCell>
                <TableCell className="font-medium text-slate-900 py-4 print:text-black print:p-2">
                  {pedido.cliente || "Sin cliente"}
                </TableCell>
                <TableCell className="text-slate-700 py-4 print:text-black print:p-2">
                  {pedido.vendedor}
                </TableCell>
                <TableCell className="py-4 print:p-2">
                  <div className="space-y-2">
                    {pedido.items?.length > 0 ? (
                      pedido.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0 print:border-slate-200"
                        >
                          <div>
                            <span className="font-semibold text-slate-700 uppercase print:text-black">
                              {item.nombre}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-2 font-mono uppercase print:text-gray-500">
                              ID: {item.productoId || "-"}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="bg-slate-200 print:border print:border-slate-300 print:bg-transparent px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 print:text-black">
                              x{item.cantidad}
                            </span>
                            <span className="font-bold text-slate-700 print:text-black">
                              {formatPrice(item.subtotal)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic print:text-black">
                        Sin artículos
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-slate-900 py-4 print:text-black print:p-2">
                  {formatPrice(pedido.totalFinal)}
                </TableCell>
                <TableCell className="text-center py-4 print:hidden">
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
                <TableCell className="text-center py-4 print:hidden">
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

          {/* Grilla extra para ordenar datos complementarios al imprimir */}
          <div className="print:grid print:grid-cols-2 print:gap-4 print:mt-6">
            {/* Additional Info Section */}
            {pedido.info && (
              <div className="border-t border-slate-200 p-6 bg-slate-50 print:bg-transparent print:p-2 print:border-none print:mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-4 print:mb-1 print:text-black print:uppercase">
                  Observaciones / Datos de Envío:
                </h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap print:text-black">
                  {pedido.info}
                </p>
              </div>
            )}

            {/* Contact Info */}
            {(pedido.dni || pedido.telefono || pedido.email) && (
              <div className="border-t border-slate-200 p-6 bg-slate-50 print:bg-transparent print:p-2 print:border-none print:mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-4 print:mb-1 print:text-black print:uppercase">
                  Contacto:
                </h3>
                {pedido.dni && (
                  <p className="text-sm text-slate-600 print:text-black">
                    <strong>DNI:</strong> {pedido.dni}
                  </p>
                )}
                {pedido.telefono && (
                  <p className="text-sm text-slate-600 print:text-black">
                    <strong>Teléfono:</strong> {pedido.telefono}
                  </p>
                )}
                {pedido.email && (
                  <p className="text-sm text-slate-600 print:text-black">
                    <strong>Email:</strong> {pedido.email}
                  </p>
                )}
              </div>
            )}

            {/* Transaction Info */}
            {pedido.transaccionId && (
              <div className="border-t border-slate-200 p-6 bg-slate-50 print:bg-transparent print:p-2 print:border-none">
                <h3 className="text-sm font-bold text-slate-700 mb-4 print:mb-1 print:text-black print:uppercase">
                  Transacción:
                </h3>
                <p className="text-sm text-slate-600 print:text-black">
                  <strong>ID Transacción:</strong> {pedido.transaccionId}
                </p>
              </div>
            )}

            {/* Coupon Info */}
            {pedido.cupon && (
              <div className="border-t border-slate-200 p-6 bg-slate-50 print:bg-transparent print:p-2 print:border-none">
                <h3 className="text-sm font-bold text-slate-700 mb-4 print:mb-1 print:text-black print:uppercase">Cupón:</h3>
                <p className="text-sm text-slate-600 print:text-black">
                  <strong>Cupón:</strong> {pedido.cupon}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
