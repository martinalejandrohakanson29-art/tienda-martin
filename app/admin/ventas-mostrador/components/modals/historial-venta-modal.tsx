"use client";

import React from "react";
import { History, Clock, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historial: any[];
}

export function HistorialVentaModal({
  open,
  onOpenChange,
  historial,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl p-6 border border-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
            <History className="h-5 w-5 text-blue-600" /> Historial de Modificaciones
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Registro cronológico de cambios realizados sobre este ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[380px] overflow-y-auto space-y-3 py-2 pr-1">
          {historial.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs italic">
              No hay modificaciones registradas para esta venta.
            </div>
          ) : (
            historial.map((h, i) => (
              <div
                key={h.id || i}
                className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
                    <User className="h-3.5 w-3.5" />
                    <span>{h.usuario || "Sistema"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    <span>
                      {new Date(h.createdAt).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <p className="font-semibold text-slate-800">
                  {h.accion || h.tipo || "Modificación de venta"}
                </p>

                {h.detalles && (
                  <p className="text-slate-600 font-mono text-[11px] bg-white p-2 rounded-lg border border-slate-100 whitespace-pre-wrap">
                    {h.detalles}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white"
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
