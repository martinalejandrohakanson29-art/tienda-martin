"use client";

import React, { useState } from "react";
import { Camera, Maximize2, ImageOff, X } from "lucide-react";
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
  fotosVenta: { venta: any; fotos: any[] } | null;
}

export function FotosAuditoriaModal({
  open,
  onOpenChange,
  fotosVenta,
}: Props) {
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);

  if (!fotosVenta) return null;
  const { venta, fotos } = fotosVenta;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] rounded-2xl p-6 border border-indigo-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-indigo-900">
              <Camera className="h-5 w-5 text-indigo-600" />
              Fotos de Preparación / Auditoría
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              {venta.numeroVenta ? `Venta #${venta.numeroVenta}` : venta.cliente}
              {venta.mlIdEnvio && ` - Envío ML #${venta.mlIdEnvio}`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {!fotos || fotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <ImageOff className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-medium">No hay fotos registradas para este envío o pedido.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto p-1">
                {fotos.map((foto, idx) => (
                  <div
                    key={foto.id || idx}
                    className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square cursor-pointer shadow-sm hover:shadow-md transition-all"
                    onClick={() => setFotoExpandida(foto.url)}
                  >
                    <img
                      src={foto.url}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 className="h-5 w-5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Zoom Foto Completa */}
      {fotoExpandida && (
        <Dialog open={!!fotoExpandida} onOpenChange={() => setFotoExpandida(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-black/95 border-none rounded-2xl flex flex-col items-center justify-center">
            <button
              onClick={() => setFotoExpandida(null)}
              className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-50"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={fotoExpandida}
              alt="Foto ampliada"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
