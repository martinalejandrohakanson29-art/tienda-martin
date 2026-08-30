"use client";

import React, { useState } from "react";
import { Plus, Loader2, Sparkles } from "lucide-react";
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
import { DecimalInput } from "./decimal-input";
import { crearArticuloMostrador } from "@/app/actions/listas";
import { toast } from "sonner";
import { Articulo } from "./modal-buscar-articulo";

interface ModalNuevoArticuloProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onArticuloCreado: (nuevoArticulo: Articulo) => void;
}

export function ModalNuevoArticulo({
  isOpen,
  onOpenChange,
  onArticuloCreado,
}: ModalNuevoArticuloProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Articulo>({
    id: "",
    nombre: "",
    precio: 0,
    stock: 0,
    costo: 0,
    margenGanancia: 50,
  });

  React.useEffect(() => {
    if (isOpen) {
      const nuevoId = "ART-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      setFormData({
        id: nuevoId,
        nombre: "",
        precio: 0,
        stock: 0,
        costo: 0,
        margenGanancia: 50,
      });
    }
  }, [isOpen]);

  const calcularPrecio = (costo: number, margen: number) => {
    return Math.round(costo * (1 + margen / 100));
  };

  const handleCostoChange = (costo: number) => {
    const pvp = calcularPrecio(costo, formData.margenGanancia || 50);
    setFormData((prev) => ({ ...prev, costo, precio: pvp }));
  };

  const handleMargenChange = (margen: number) => {
    const pvp = calcularPrecio(formData.costo || 0, margen);
    setFormData((prev) => ({ ...prev, margenGanancia: margen, precio: pvp }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim() || !formData.nombre.trim()) {
      toast.error("El ID y el Nombre del artículo son obligatorios.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await crearArticuloMostrador({
        id: formData.id.trim().toUpperCase(),
        nombre: formData.nombre.trim(),
        precio: formData.precio,
        stock: formData.stock || 0,
        costo: formData.costo || 0,
        margenGanancia: formData.margenGanancia || 50,
      });

      if (res.success) {
        const nuevo: Articulo = {
          ...formData,
          id: formData.id.trim().toUpperCase(),
          precio: Number(formData.precio),
          stock: Number(formData.stock || 0),
          costo: Number(formData.costo || 0),
          margenGanancia: Number(formData.margenGanancia || 50),
        };
        toast.success(`Artículo "${nuevo.nombre}" creado e incluido`);
        onArticuloCreado(nuevo);
        onOpenChange(false);
      } else {
        toast.error("Error al crear artículo: " + res.error);
      }
    } catch (err: any) {
      toast.error("Ocurrió un error inesperado al crear el artículo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-3xl p-6 border-2 border-emerald-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-emerald-950">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Plus className="h-5 w-5" />
            </div>
            <span>Crear Nuevo Artículo</span>
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Se dará de alta en el catálogo general y se agregará inmediatamente a tu lista de compra.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase">ID / SKU</Label>
              <Input
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                className="font-mono text-xs uppercase bg-slate-50 border-slate-200"
                placeholder="ART-001"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase">Stock Inicial</Label>
              <Input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                className="font-bold text-center bg-slate-50 border-slate-200"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-500 uppercase">Nombre / Descripción</Label>
            <Input
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="bg-slate-50 border-slate-200 font-medium"
              placeholder="Ej: Aceite Motul 5100 15W50 1L"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase">Costo Unitario ($)</Label>
              <DecimalInput
                value={formData.costo || 0}
                onChange={handleCostoChange}
                className="font-bold bg-slate-50 border-slate-200 text-slate-900"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase">% Margen Ganancia</Label>
              <DecimalInput
                value={formData.margenGanancia || 50}
                onChange={handleMargenChange}
                className="font-bold bg-slate-50 border-slate-200 text-indigo-600 text-center"
                placeholder="50"
              />
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 rounded-2xl border border-emerald-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-black text-emerald-800 uppercase flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Precio Venta Público (PVP)
              </Label>
              <span className="text-[10px] text-emerald-600 font-medium bg-emerald-100/60 px-2 py-0.5 rounded-full">
                Sugerido según margen
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-emerald-900">$</span>
              <DecimalInput
                value={formData.precio}
                onChange={(val) => setFormData({ ...formData, precio: val })}
                className="font-black text-2xl bg-white border-emerald-300 text-emerald-800 focus-visible:ring-emerald-500 h-12 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-slate-500"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-6 shadow-md"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Crear e Incluir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
