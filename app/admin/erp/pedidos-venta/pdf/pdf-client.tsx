"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { PedidoVentaA4 } from "@/app/admin/ventas-mostrador/components/print/pedido-venta-a4";

interface PedidoPDFClientProps {
  pedido: any;
}

export default function PedidoPDFClient({ pedido }: PedidoPDFClientProps) {

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-6 print:p-0 print:bg-white">
      {/* Barra superior de control (oculta en impresión) */}
      <div className="w-[210mm] max-w-full flex items-center justify-between mb-4 px-2 print:hidden">
        <Link
          href="/admin/ventas-mostrador"
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Ventas Mostrador
        </Link>
        <Button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 rounded-xl text-xs font-bold gap-1.5 shadow-sm"
        >
          <Printer className="h-4 w-4" />
          Imprimir / Guardar PDF
        </Button>
      </div>

      {/* Contenedor A4 */}
      <div className="bg-white shadow-xl print:shadow-none">
        <PedidoVentaA4 venta={pedido} />
      </div>
    </div>
  );
}
