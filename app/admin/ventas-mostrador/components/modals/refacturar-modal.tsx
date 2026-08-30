"use client";

import React, { useState } from "react";
import { ArrowRightLeft, Search, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consultarPadron } from "@/app/actions/afip";
import { refacturarComoA } from "@/app/actions/ventas-mostrador";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta: any;
  onRefacturadoExito: () => void;
}

export function RefacturarModal({
  open,
  onOpenChange,
  venta,
  onRefacturadoExito,
}: Props) {
  const [refacturarCuit, setRefacturarCuit] = useState("");
  const [refacturarBuscando, setRefacturarBuscando] = useState(false);
  const [refacturarPadron, setRefacturarPadron] = useState<any>(null);
  const [refacturarProcesando, setRefacturarProcesando] = useState(false);

  const handleBuscarPadronRefacturar = async () => {
    const raw = refacturarCuit.replace(/\D/g, "");
    if (raw.length !== 11) {
      alert("El CUIT debe tener 11 dígitos");
      return;
    }
    setRefacturarBuscando(true);
    setRefacturarPadron(null);
    try {
      const res = await consultarPadron(raw);
      if (res.success) {
        setRefacturarPadron(res);
      } else {
        alert("No se pudo consultar el padrón de AFIP: " + (res.error || "Error desconocido"));
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al consultar padrón.");
    } finally {
      setRefacturarBuscando(false);
    }
  };

  const handleConfirmarRefacturar = async () => {
    if (!venta || !refacturarPadron || refacturarPadron.tipoFactura !== 1) return;
    setRefacturarProcesando(true);
    try {
      const res = await refacturarComoA(
        venta.id,
        refacturarCuit.replace(/\D/g, "")
      );
      if (res.success) {
        alert(
          `Refacturación exitosa.\nNC Factura B: N° ${(res.nc || 0)
            .toString()
            .padStart(8, "0")}\nNueva Factura A: N° ${(res.facturaA || 0)
            .toString()
            .padStart(8, "0")}`
        );
        onOpenChange(false);
        setRefacturarCuit("");
        setRefacturarPadron(null);
        onRefacturadoExito();
      } else {
        alert("Error al refacturar: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al procesar la refacturación.");
    } finally {
      setRefacturarProcesando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setRefacturarCuit("");
          setRefacturarPadron(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[480px] rounded-2xl p-6 border border-violet-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-violet-950">
            <ArrowRightLeft className="h-5 w-5 text-violet-600" /> Refacturar como Factura A
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-xs">
            Se generará una <b>Nota de Crédito</b> de la Factura B y se emitirá una{" "}
            <b>Factura A</b> con el CUIT del comprador, por el mismo importe.
          </DialogDescription>
        </DialogHeader>

        {venta && (
          <div className="py-2 space-y-4">
            <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 flex flex-col gap-1">
              <p className="text-[11px] text-violet-700 font-bold uppercase tracking-wider">
                Factura B a anular
              </p>
              <p className="text-xs font-bold text-slate-900">
                N° {(venta.facturaNumero || 0).toString().padStart(8, "0")} · PV{" "}
                {(venta.facturaPuntoVenta || 9).toString().padStart(4, "0")}
              </p>
              <p className="text-xs font-bold text-slate-900">
                Total: ${Number(venta.totalFinal || venta.total).toLocaleString("es-AR")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase">
                CUIT del comprador (Responsable Inscripto)
              </Label>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="30-12345678-9"
                  value={refacturarCuit}
                  onChange={(e) => {
                    setRefacturarCuit(e.target.value);
                    setRefacturarPadron(null);
                  }}
                  className="font-mono h-10 border-violet-200 focus-visible:ring-violet-500 rounded-xl text-xs"
                />
                <Button
                  type="button"
                  onClick={handleBuscarPadronRefacturar}
                  disabled={refacturarBuscando}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold px-4 shrink-0"
                >
                  {refacturarBuscando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {refacturarPadron && (
              refacturarPadron.tipoFactura === 1 ? (
                <div className="p-3 bg-green-50 rounded-xl border border-green-200 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                      Responsable Inscripto ✓
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {refacturarPadron.nombre}
                    </span>
                    {refacturarPadron.domicilio && (
                      <span className="text-[11px] text-slate-500">
                        {refacturarPadron.domicilio}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">
                      No es Responsable Inscripto
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {refacturarPadron.nombre}
                    </span>
                    <span className="text-[11px] text-rose-600">
                      No corresponde emitir Factura A para este CUIT.
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={refacturarProcesando}
            className="rounded-xl border-slate-200"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmarRefacturar}
            disabled={
              refacturarProcesando ||
              !refacturarPadron ||
              refacturarPadron.tipoFactura !== 1
            }
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold px-6 shadow-md disabled:opacity-50"
          >
            {refacturarProcesando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4 mr-2" /> Emitir Factura A
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
