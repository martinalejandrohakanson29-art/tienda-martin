"use client";

import React from "react";
import { History, Clock, User, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface AuditoriaItem {
  id?: string;
  usuario: string;
  accion: string;
  detalle: string;
  createdAt: string | Date;
}

interface ModalHistorialAuditoriaProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  historial: AuditoriaItem[];
  isLoading?: boolean;
  numeroCompra?: number | string;
}

export function ModalHistorialAuditoria({
  isOpen,
  onOpenChange,
  historial,
  isLoading = false,
  numeroCompra,
}: ModalHistorialAuditoriaProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] rounded-3xl p-6 border border-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2.5 text-slate-900">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <History className="h-5 w-5" />
            </div>
            <span>Historial de Auditoría {numeroCompra ? `· Compra #${numeroCompra}` : ""}</span>
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Registro cronológico de todas las modificaciones y acciones realizadas en este comprobante.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto mt-4 space-y-2.5 pr-1">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              <p className="text-xs">Cargando eventos de auditoría...</p>
            </div>
          ) : historial.length === 0 ? (
            <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Clock className="h-8 w-8 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-600">Sin historial registrado</p>
              <p className="text-[10px] text-slate-400">No se encontraron modificaciones posteriores a la creación.</p>
            </div>
          ) : (
            historial.map((h, i) => (
              <div
                key={h.id || i}
                className="p-3.5 bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/80 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100/70 text-blue-700">
                    {h.accion.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(h.createdAt).toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>{h.usuario || "Usuario del sistema"}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed bg-white p-2.5 rounded-xl border border-slate-100 font-medium">
                  {h.detalle}
                </p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
