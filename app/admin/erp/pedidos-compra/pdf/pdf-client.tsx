"use client";

import React, { useEffect } from "react";
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
  Printer,
  ArrowLeft,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

type ItemCompra = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
};

type Pedido = {
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
  estadoPedido?: string | null;
  info?: string | null;
  numeroCompra?: number;
  items: ItemCompra[];
};

interface PedidoPDFClientProps {
  pedido: Pedido;
}

export default function PedidoPDFClient({ pedido }: PedidoPDFClientProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white print:m-0 print:p-0">
      <div className="max-w-7xl mx-auto px-4 py-8 print:max-w-none print:w-full print:px-0 print:py-4">
        {/* Header - Solo visible en pantalla web, oculto en PDF */}
        <div className="mb-8 flex items-center justify-between print:hidden">
          <div>
            <Link
              href="/admin/erp/pedidos-compra"
              className="flex items-center gap-1 mb-2 text-slate-500 hover:text-indigo-600 transition-colors text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">
              Detalles del Pedido de Compra
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
            title="Imprimir Pedido"
          >
            <Printer className="h-4 w-4 mr-1" />
            Imprimir
          </Button>
        </div>

        {/* Encabezado especial para el PDF */}
        <div className="hidden print:block mb-8 border-b-2 border-slate-300 pb-4">
          <h1 className="text-2xl font-bold text-black uppercase">Pedido de Compra</h1>
          <p className="text-sm text-gray-500 mt-1"><strong>ID:</strong> {pedido.numeroCompra || pedido.id}</p>
          <p className="text-sm text-gray-500"><strong>Fecha:</strong> {new Date(pedido.createdAt).toLocaleDateString("es-AR")} {new Date(pedido.createdAt).toLocaleTimeString("es-AR").slice(0, 5)}</p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none print:rounded-none">
          <Table className="print:text-sm">
            <TableHeader className="bg-slate-50 border-b-2 border-slate-200 print:bg-transparent print:border-b-2 print:border-black">
              <TableRow>
                <TableHead className="w-16 print:text-black">ID</TableHead>
                <TableHead className="print:text-black">Proveedor</TableHead>
                <TableHead className="print:text-black">Comprador</TableHead>
                <TableHead className="print:text-black">Artículos</TableHead>
                <TableHead className="text-right print:text-black">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="print:border-b print:border-slate-300">
                <TableCell className="font-mono text-sm text-slate-500 py-4 print:text-black print:p-2">
                  {pedido.numeroCompra || pedido.id.slice(0, 8)}
                </TableCell>
                <TableCell className="font-medium text-slate-900 py-4 print:text-black print:p-2">
                  {pedido.proveedor || "Sin proveedor"}
                </TableCell>
                <TableCell className="text-slate-700 py-4 print:text-black print:p-2">
                  {pedido.comprador}
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
              </TableRow>
            </TableBody>
          </Table>

          {/* Info adicional */}
          <div className="print:grid print:grid-cols-2 print:gap-4 print:mt-6">
            {pedido.info && (
              <div className="border-t border-slate-200 p-6 bg-slate-50 print:bg-transparent print:p-2 print:border-none print:mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-4 print:mb-1 print:text-black print:uppercase">
                  Observaciones:
                </h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap print:text-black">
                  {pedido.info}
                </p>
              </div>
            )}
            
            <div className="border-t border-slate-200 p-6 bg-slate-50 print:bg-transparent print:p-2 print:border-none print:mb-4">
              <h3 className="text-sm font-bold text-slate-700 mb-4 print:mb-1 print:text-black print:uppercase">
                Detalles del Pago:
              </h3>
              <p className="text-sm text-slate-600 print:text-black">
                <strong>Método:</strong> {pedido.metodo_pago}
              </p>
              <p className="text-sm text-slate-600 print:text-black">
                <strong>Estado:</strong> {pedido.estadoPedido}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
