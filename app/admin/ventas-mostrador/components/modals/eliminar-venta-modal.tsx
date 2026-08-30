"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { eliminarVentaMostrador } from "@/app/actions/ventas-mostrador";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta: any;
  onEliminadaExito: (ventaId: string) => void;
}

export function EliminarVentaModal({
  open,
  onOpenChange,
  venta,
  onEliminadaExito,
}: Props) {
  const [isEliminando, setIsEliminando] = useState(false);

  if (!venta) return null;
  const tieneFacturaARCA = venta.cae && !venta.info?.includes("ANULADA CON NC");

  const handleEliminar = async () => {
    setIsEliminando(true);
    try {
      const res = await eliminarVentaMostrador(venta.id, "Admin");
      if (res.success) {
        onEliminadaExito(venta.id);
        onOpenChange(false);
      } else {
        alert("Error al eliminar la venta: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al eliminar la venta.");
    } finally {
      setIsEliminando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`sm:max-w-[450px] rounded-2xl p-6 border shadow-2xl ${
          tieneFacturaARCA ? "border-rose-300" : "border-red-300"
        }`}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-950">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {tieneFacturaARCA
              ? "Anular Venta con Nota de Crédito"
              : "Confirmar Eliminación de Venta"}
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-xs">
            {tieneFacturaARCA
              ? "Esta venta tiene una factura ARCA. Se generará una Nota de Crédito y se devolverá el stock."
              : "Esta acción eliminará permanentemente la venta y devolverá el stock."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              tieneFacturaARCA
                ? "bg-rose-50/60 border-rose-200"
                : "bg-red-50/60 border-red-200"
            }`}
          >
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-rose-900">
                {tieneFacturaARCA ? "Acciones automáticas:" : "¡Atención! Acción irreversible:"}
              </p>
              <ul className="list-disc list-inside text-rose-700 space-y-0.5 text-[11px]">
                {tieneFacturaARCA && <li>Generación de <b>Nota de Crédito</b> en ARCA</li>}
                <li>Devolución de stock de todos los artículos</li>
                <li>Reversión de cuenta corriente / cruzada si aplica</li>
                <li>
                  {tieneFacturaARCA
                    ? "La venta quedará marcada como CANCELADA"
                    : "Eliminación del registro de venta"}
                </li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
            <p className="text-[11px] text-slate-500 font-bold uppercase">
              Venta #{venta.numeroVenta || venta.id.slice(0, 8)}
            </p>
            <p className="font-bold text-slate-900 text-sm">{venta.cliente}</p>
            {venta.cae && (
              <p className="text-blue-600 font-semibold text-xs">CAE: {venta.cae}</p>
            )}
            <p className="font-bold text-slate-800">
              Total: ${Number(venta.totalFinal || venta.total).toLocaleString("es-AR")}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isEliminando}
            className="rounded-xl border-slate-200"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleEliminar}
            disabled={isEliminando}
            className={`rounded-xl font-bold px-5 text-white ${
              tieneFacturaARCA
                ? "bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20"
                : "bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20"
            }`}
          >
            {isEliminando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...
              </>
            ) : tieneFacturaARCA ? (
              <>
                <AlertTriangle className="h-4 w-4 mr-2" /> Anular con NC
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar Venta
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
