"use client";

import React, { useState } from "react";
import { Save, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { actualizarPrecioArticuloDB } from "@/app/actions/ventas-mostrador";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fastUpdateData: {
    id: string;
    nombre: string;
    oldPrice: number;
    newPrice: number;
  } | null;
  onPrecioActualizado: (id: string, newPrice: number, updatedAt: string) => void;
}

export function FastUpdateDbModal({
  open,
  onOpenChange,
  fastUpdateData,
  onPrecioActualizado,
}: Props) {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!fastUpdateData) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const res = await actualizarPrecioArticuloDB(
        fastUpdateData.id,
        fastUpdateData.newPrice,
        "Admin"
      );
      if (res.success) {
        onPrecioActualizado(
          fastUpdateData.id,
          fastUpdateData.newPrice,
          new Date().toISOString()
        );
        onOpenChange(false);
      } else {
        alert("Error al actualizar precio en base de datos: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al actualizar precio.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl p-6 border border-emerald-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-950">
            <Save className="h-5 w-5 text-emerald-600" /> Confirmar Cambio de Precio
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-xs">
            ¿Confirmar modificación del precio en la <b>Base de Datos</b>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 flex flex-col items-center text-center">
            <p className="text-xs font-bold text-slate-800 mb-3">{fastUpdateData.nombre}</p>

            <div className="flex items-center justify-center gap-5 w-full">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">
                  Precio anterior
                </span>
                <span className="text-sm font-medium text-slate-400 line-through">
                  ${fastUpdateData.oldPrice.toLocaleString("es-AR")}
                </span>
              </div>

              <div className="bg-emerald-200 text-emerald-800 p-1.5 rounded-full">
                <CheckCircle2 className="h-4 w-4" />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-700 font-bold uppercase mb-0.5">
                  Precio nuevo
                </span>
                <span className="text-xl font-black text-emerald-700">
                  ${fastUpdateData.newPrice.toLocaleString("es-AR")}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-center text-slate-400">
            Esta acción registrará el cambio de precio en la auditoría del sistema.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-slate-200"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-6 shadow-md shadow-emerald-600/20"
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sí, Actualizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
