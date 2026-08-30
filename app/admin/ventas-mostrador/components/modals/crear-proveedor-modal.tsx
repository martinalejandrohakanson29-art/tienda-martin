"use client";

import React, { useState } from "react";
import { Plus, Search, Loader2, Save } from "lucide-react";
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
import { crearProveedor } from "@/app/actions/listas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProveedorCreado: (nuevo: any) => void;
}

export function CrearProveedorModal({
  open,
  onOpenChange,
  onProveedorCreado,
}: Props) {
  const [cuit, setCuit] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [isSearchingPadron, setIsSearchingPadron] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleBuscarPadron = async () => {
    const raw = cuit.replace(/\D/g, "");
    if (raw.length !== 11) {
      alert("El CUIT debe tener 11 dígitos");
      return;
    }
    setIsSearchingPadron(true);
    try {
      const res = await consultarPadron(raw);
      if (res.success) {
        setRazonSocial(res.nombre || "");
        setCuit(raw);
      } else {
        alert("No se encontró el CUIT en el padrón AFIP: " + (res.error || ""));
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al consultar padrón.");
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleCrear = async () => {
    if (!razonSocial.trim() || !cuit.trim()) {
      alert("Razón Social y CUIT son obligatorios");
      return;
    }
    setIsCreating(true);
    try {
      const res = await crearProveedor({
        razonSocial: razonSocial.trim(),
        cuit: cuit.trim(),
      });
      if (res.success && res.data) {
        onProveedorCreado(res.data);
        setCuit("");
        setRazonSocial("");
        onOpenChange(false);
      } else {
        alert("Error al crear proveedor: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al crear proveedor.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl p-6 border border-amber-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-950">
            <Plus className="h-5 w-5 text-amber-600" /> Nuevo Proveedor
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Crea un proveedor rápidamente para la venta cruzada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 uppercase">CUIT / DNI *</Label>
            <div className="flex gap-2">
              <Input
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="20-XXXXXXXX-X"
                className="flex-1 h-10 text-xs rounded-xl border-slate-200"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleBuscarPadron}
                disabled={isSearchingPadron}
                className="border-amber-200 text-amber-600 hover:bg-amber-50 rounded-xl h-10 w-10 shrink-0"
                title="Buscar en Padrón AFIP"
              >
                {isSearchingPadron ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600 uppercase">Razón Social *</Label>
            <Input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Nombre o empresa"
              className="h-10 text-xs rounded-xl border-slate-200"
            />
          </div>
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
            onClick={handleCrear}
            disabled={isCreating}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-md shadow-amber-600/20"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar Proveedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
