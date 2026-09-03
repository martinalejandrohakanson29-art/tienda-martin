"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Loader2, Ban, CheckSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cancelarVenta, eliminarVentaMostrador } from "@/app/actions/ventas-mostrador";

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
  const [isProcesando, setIsProcesando] = useState(false);
  const [soloMarcarCancelada, setSoloMarcarCancelada] = useState(false);
  const [accionSeleccionada, setAccionSeleccionada] = useState<"cancelar" | "eliminar">("cancelar");

  if (!venta) return null;

  const isCancelada = venta.estadoPedido === "CANCELADO";
  const tieneFacturaARCA = !!venta.cae && !venta.info?.includes("ANULADA CON NC");

  const handleEjecutar = async () => {
    setIsProcesando(true);
    try {
      if (isCancelada || accionSeleccionada === "eliminar") {
        // Borrado permanente
        const res = await eliminarVentaMostrador(venta.id, "Admin");
        if (res.success) {
          onEliminadaExito(venta.id);
          onOpenChange(false);
        } else {
          alert("Error al eliminar la venta: " + res.error);
        }
      } else {
        // Cancelación manteniendo registro en base de datos
        const res = await cancelarVenta(venta.id, {
          soloMarcarCancelada: tieneFacturaARCA ? soloMarcarCancelada : false,
        });

        if (res.success) {
          onEliminadaExito(venta.id);
          onOpenChange(false);
        } else {
          const detalle = res.details ? `\nDetalle: ${JSON.stringify(res.details)}` : "";
          alert(`Error al procesar la cancelación: ${res.error || "Desconocido"}${detalle}`);
        }
      }
    } catch (e: any) {
      console.error(e);
      alert("Error de conexión o inesperado: " + (e?.message || ""));
    } finally {
      setIsProcesando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`sm:max-w-[460px] rounded-2xl p-6 border shadow-2xl ${
          tieneFacturaARCA ? "border-rose-300" : isCancelada ? "border-slate-300" : "border-red-300"
        }`}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
            {tieneFacturaARCA ? (
              <>
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                Anular Venta con Nota de Crédito
              </>
            ) : isCancelada ? (
              <>
                <Trash2 className="h-5 w-5 text-red-600" />
                Eliminar Venta Cancelada de la BD
              </>
            ) : (
              <>
                <Ban className="h-5 w-5 text-amber-600" />
                Cancelar Venta
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-xs">
            {tieneFacturaARCA
              ? "Esta venta tiene factura fiscal en ARCA. Se generará la Nota de Crédito correspondiente y la venta quedará guardada como CANCELADA sin sumar al total de ventas."
              : isCancelada
              ? "Esta venta ya figura como cancelada. Esta acción borrará el registro definitivamente de la base de datos."
              : "Podés cancelar la venta (recomendado para conservar el registro e historial) o eliminarla permanentemente."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          {/* Card informativa de la venta */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-[11px] text-slate-500 font-bold uppercase">
                Venta #{venta.numeroVenta || venta.id.slice(0, 8)}
              </p>
              {isCancelada && (
                <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded text-[10px]">
                  YA CANCELADA
                </span>
              )}
            </div>
            <p className="font-bold text-slate-900 text-sm">{venta.cliente || "Consumidor Final"}</p>
            {venta.cae && (
              <p className="text-blue-600 font-semibold text-xs">
                Factura #{venta.facturaNumero || "-"} | CAE: {venta.cae}
              </p>
            )}
            <p className="font-bold text-slate-800">
              Total: ${Number(venta.totalFinal || venta.total).toLocaleString("es-AR")}
            </p>
          </div>

          {/* Opciones según tipo de venta */}
          {tieneFacturaARCA ? (
            <div className="space-y-2">
              <div className="p-3 rounded-xl border bg-rose-50/70 border-rose-200 text-xs space-y-1">
                <p className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  Acciones automáticas:
                </p>
                <ul className="list-disc list-inside text-rose-700 space-y-0.5 text-[11px]">
                  {!soloMarcarCancelada ? (
                    <li>
                      Emisión de <b>Nota de Crédito</b> en ARCA (AFIP) por ${Number(venta.totalFinal || venta.total).toLocaleString("es-AR")}
                    </li>
                  ) : (
                    <li>
                      <b>No emitirá NC en ARCA</b> (se asume emitida previamente en comprobantes en línea)
                    </li>
                  )}
                  <li>Devolución automática de stock de todos los artículos</li>
                  <li>Reversión de saldo a proveedor si aplica</li>
                  <li>
                    <b>La venta permanecerá visible como CANCELADA</b> y no sumará a los montos de venta
                  </li>
                </ul>
              </div>

              <label className="flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={soloMarcarCancelada}
                  onChange={(e) => setSoloMarcarCancelada(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-600"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">
                    Ya emití la Nota de Crédito manualmente en ARCA
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Marcá esta casilla si hiciste la NC en la web de AFIP para que el sistema no intente generar una segunda NC.
                  </span>
                </div>
              </label>
            </div>
          ) : !isCancelada ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAccionSeleccionada("cancelar")}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    accionSeleccionada === "cancelar"
                      ? "border-amber-500 bg-amber-50/70 text-amber-900 font-bold ring-2 ring-amber-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold">1. Cancelar (Recomendado)</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Devuelve stock, conserva registro como CANCELADA y no suma en ventas.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAccionSeleccionada("eliminar")}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    accionSeleccionada === "eliminar"
                      ? "border-red-500 bg-red-50/70 text-red-900 font-bold ring-2 ring-red-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold text-red-700">2. Eliminar de la BD</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Borra el registro por completo de la base de datos y devuelve stock.
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl border bg-red-50 border-red-200 text-xs text-red-800">
              <p className="font-bold">⚠️ Atención:</p>
              <p className="text-[11px] mt-0.5">
                Esta venta ya está cancelada. Si confirmás, se borrará definitivamente de la base de datos.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcesando}
            className="rounded-xl border-slate-200"
          >
            Volver
          </Button>
          <Button
            onClick={handleEjecutar}
            disabled={isProcesando}
            className={`rounded-xl font-bold px-5 text-white ${
              tieneFacturaARCA
                ? "bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20"
                : isCancelada || accionSeleccionada === "eliminar"
                ? "bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20"
                : "bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20"
            }`}
          >
            {isProcesando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...
              </>
            ) : tieneFacturaARCA ? (
              soloMarcarCancelada ? (
                <>
                  <CheckSquare className="h-4 w-4 mr-2" /> Marcar como Cancelada
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" /> Anular con NC en ARCA
                </>
              )
            ) : isCancelada || accionSeleccionada === "eliminar" ? (
              <>
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar de la BD
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" /> Cancelar Venta
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
