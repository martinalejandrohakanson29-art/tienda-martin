"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { actualizarAlertaML } from "@/app/actions/ventas-mostrador";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta: any;
  onAlertaGuardada: (ventaId: string, activa: boolean, observacion: string) => void;
}

export function AlertaMLModal({
  open,
  onOpenChange,
  venta,
  onAlertaGuardada,
}: Props) {
  const [alertaActiva, setAlertaActiva] = useState(false);
  const [alertaObservacion, setAlertaObservacion] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (venta) {
      setAlertaActiva(venta.mlAlerta ?? false);
      setAlertaObservacion(venta.mlObservacion ?? "");
    }
  }, [venta]);

  const handleGuardar = async () => {
    if (!venta) return;
    setIsSaving(true);
    try {
      const res = await actualizarAlertaML(venta.id, alertaActiva, alertaObservacion);
      if (res.success) {
        onAlertaGuardada(venta.id, alertaActiva, alertaObservacion);
        onOpenChange(false);
      } else {
        alert("Error al actualizar alerta: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al guardar alerta.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl p-6 border border-orange-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-orange-950">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Alerta Venta Mercado Libre
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            {venta?.numeroVenta ? `Venta #${venta.numeroVenta}` : venta?.cliente} - MLA:{" "}
            {venta?.mlMla || venta?.mlIdVenta || "S/D"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex items-center gap-3 p-3 rounded-xl border border-orange-200 bg-orange-50/50 cursor-pointer select-none">
            <Checkbox
              checked={alertaActiva}
              onCheckedChange={(v) => setAlertaActiva(!!v)}
              className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
            />
            <div className="text-xs">
              <p className="font-bold text-orange-900">Activar Alerta</p>
              <p className="text-orange-700 text-[11px]">
                Marcará esta venta con fondo naranja para revisión.
              </p>
            </div>
          </label>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">Observación de la alerta</label>
            <Textarea
              value={alertaObservacion}
              onChange={(e) => setAlertaObservacion(e.target.value)}
              placeholder="Ej: El cliente solicitó cambio de color antes del despacho..."
              className="h-24 text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-slate-200"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            disabled={isSaving}
            className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar Alerta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
