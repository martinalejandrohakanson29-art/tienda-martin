"use client";

import React from "react";
import {
  FileText,
  User,
  Calendar,
  CreditCard,
  Download,
  Edit,
  Trash2,
  History,
  Copy,
  CheckCircle2,
  X,
  ArrowRight,
  Package,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CompraItemDetail {
  id?: string;
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
}

interface CompraDetail {
  id: string;
  numeroCompra?: number;
  proveedor: string;
  comprador: string;
  total: number;
  interes: number;
  descuento: number;
  totalFinal: number;
  metodo_pago: string;
  moneda?: "ARS" | "USD";
  createdAt: string;
  fechaCarga?: string;
  fechaIngreso?: string | null;
  comprobante?: string | null;
  items: CompraItemDetail[];
  pdfUrl?: string | null;
}

interface DrawerDetalleCompraProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  compra: CompraDetail | null;
  onEditar: (compra: CompraDetail) => void;
  onEliminar: (compra: CompraDetail) => void;
  onVerHistorial: (id: string) => void;
}

const formatFecha = (iso?: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

export function DrawerDetalleCompra({
  isOpen,
  onOpenChange,
  compra,
  onEditar,
  onEliminar,
  onVerHistorial,
}: DrawerDetalleCompraProps) {
  if (!compra) return null;

  const copiarTexto = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} copiado al portapapeles`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full p-0 flex flex-col bg-slate-50">
        {/* CABECERA */}
        <div className="bg-slate-900 text-white p-6 shrink-0 border-b border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                #{compra.numeroCompra || compra.id.slice(0, 8)}
              </span>
              <div>
                <h2 className="text-base font-bold text-white truncate max-w-[260px]">
                  {compra.proveedor}
                </h2>
                <p className="text-[11px] text-slate-400">
                  Cargada el {formatFecha(compra.fechaCarga || compra.createdAt)} por {compra.comprador}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TARJETA DE RESUMEN COMERCIAL */}
          <div className="grid grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Método de Pago
              </span>
              <span className="font-bold text-slate-800 inline-block bg-slate-100 px-2 py-0.5 rounded-md">
                {compra.metodo_pago}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Comprobante N°
              </span>
              <span className="font-mono font-bold text-slate-800">
                {compra.comprobante || <span className="text-slate-300 font-normal italic">Sin número</span>}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Fecha Ingreso Real
              </span>
              <span className="font-bold text-blue-600">
                {formatFecha(compra.fechaIngreso)}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Moneda Operación
              </span>
              <span className="font-bold text-slate-800">
                {compra.moneda || "ARS"}
              </span>
            </div>
          </div>

          {/* LISTA DE ARTÍCULOS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="h-4 w-4 text-emerald-600" />
                Artículos ({compra.items?.length || 0})
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {compra.items?.reduce((acc, i) => acc + i.cantidad, 0)} unidades en total
              </span>
            </div>

            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {compra.items?.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200/90 hover:border-blue-300 transition-all flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p
                        onClick={() => copiarTexto(item.nombre, "Nombre")}
                        className="text-xs font-bold text-slate-900 truncate hover:text-blue-600 cursor-pointer"
                        title="Click para copiar"
                      >
                        {item.nombre}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.productoId && (
                        <span
                          onClick={() => copiarTexto(item.productoId!, "Código")}
                          className="font-mono text-[9px] text-slate-400 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          {item.productoId}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        ${Number(item.costo_unit).toLocaleString("es-AR")} c/u
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                      x{item.cantidad}
                    </span>
                    <span className="text-xs font-black text-slate-900">
                      ${Number(item.subtotal).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DESGLOSE FINANCIERO */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal artículos:</span>
              <span className="font-bold">${Number(compra.total).toLocaleString("es-AR")}</span>
            </div>
            {Number(compra.interes) > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Recargo / Interés:</span>
                <span className="font-bold">+ ${Number(compra.interes).toLocaleString("es-AR")}</span>
              </div>
            )}
            {Number(compra.descuento) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Descuento:</span>
                <span className="font-bold">- ${Number(compra.descuento).toLocaleString("es-AR")}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
              <span className="font-bold text-slate-800 text-sm">Total Comprobante:</span>
              <span className="font-black text-xl text-slate-900">
                ${Number(compra.totalFinal).toLocaleString("es-AR")}
              </span>
            </div>
          </div>
        </div>

        {/* PIE DE ACCIONES */}
        <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onEditar(compra);
            }}
            className="flex-1 rounded-xl border-amber-200 text-amber-800 hover:bg-amber-50 font-bold text-xs h-10"
          >
            <Edit className="h-4 w-4 mr-1.5" /> Editar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onVerHistorial(compra.id);
            }}
            className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-10 px-3"
            title="Ver Historial de Cambios"
          >
            <History className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onEliminar(compra);
            }}
            className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs h-10 px-3"
            title="Eliminar Compra"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
