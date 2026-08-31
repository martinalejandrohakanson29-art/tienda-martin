"use client";

import React, { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
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
import { Articulo } from "../../types";
import { redondearA50, calcularPrecioArt } from "../../constants";
import { crearArticuloMostrador } from "@/app/actions/listas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArticuloCreado: (nuevo: Articulo) => void;
}

export function CrearArticuloModal({
  open,
  onOpenChange,
  onArticuloCreado,
}: Props) {
  const [artData, setArtData] = useState<Articulo>({
    id: "",
    nombre: "",
    precio: 0,
    stock: 0,
    costo: 0,
    margenGanancia: 0,
    esServicio: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const nuevoId =
        "ART-" + Math.random().toString(36).substring(2, 9).toUpperCase();
      setArtData({
        id: nuevoId,
        nombre: "",
        precio: 0,
        stock: 1,
        costo: 0,
        margenGanancia: 50,
        esServicio: false,
      });
    }
  }, [open]);

  const handleCostoChange = (costoVal: number) => {
    const nuevoPrecio = calcularPrecioArt(costoVal, artData.margenGanancia || 0);
    setArtData((prev) => ({
      ...prev,
      costo: costoVal,
      precio: nuevoPrecio,
    }));
  };

  const handleMargenChange = (margenVal: number) => {
    const nuevoPrecio = calcularPrecioArt(artData.costo || 0, margenVal);
    setArtData((prev) => ({
      ...prev,
      margenGanancia: margenVal,
      precio: nuevoPrecio,
    }));
  };

  const handleCrear = async () => {
    if (!artData.nombre.trim()) {
      alert("El nombre del artículo es obligatorio");
      return;
    }
    setIsSubmitting(true);
    const precioRedondeado = redondearA50(artData.precio);
    try {
      const res = await crearArticuloMostrador({
        id: artData.id,
        nombre: artData.nombre.trim(),
        precio: precioRedondeado,
        stock: artData.esServicio ? 0 : artData.stock,
        costo: artData.costo,
        margenGanancia: artData.margenGanancia,
        esServicio: artData.esServicio,
      });

      if (res.success) {
        const nuevo: Articulo = {
          ...artData,
          nombre: artData.nombre.trim(),
          precio: precioRedondeado,
          stock: artData.esServicio ? 0 : artData.stock,
        };
        onArticuloCreado(nuevo);
        onOpenChange(false);
      } else {
        alert("Error al crear artículo: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al crear artículo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl p-6 border border-indigo-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-indigo-950">
            <Plus className="h-5 w-5 text-indigo-600" /> Crear Nuevo Artículo
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Ingresa los datos para dar de alta un producto en el sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase">SKU / ID</Label>
              <Input
                value={artData.id}
                readOnly
                className="font-mono bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase">
                Stock Inicial {artData.esServicio && <span className="text-[10px] text-slate-400 font-normal">(N/A)</span>}
              </Label>
              <Input
                type="number"
                disabled={artData.esServicio}
                value={artData.esServicio ? 0 : artData.stock}
                onChange={(e) =>
                  setArtData({ ...artData, stock: Math.max(0, Number(e.target.value)) })
                }
                className={`font-bold h-9 rounded-xl text-xs ${
                  artData.esServicio
                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-slate-50 border-slate-200"
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              id="esServicioCheck"
              checked={artData.esServicio || false}
              onChange={(e) =>
                setArtData({
                  ...artData,
                  esServicio: e.target.checked,
                  stock: e.target.checked ? 0 : (artData.stock || 1),
                })
              }
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4"
            />
            <label htmlFor="esServicioCheck" className="text-[11px] text-slate-700 font-medium cursor-pointer">
              Es <strong>Servicio / Costo Adicional</strong> (ej. Envío, Flete — no controla stock ni distorsiona rankings)
            </label>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción *</Label>
            <Input
              autoFocus
              value={artData.nombre}
              onChange={(e) => setArtData({ ...artData, nombre: e.target.value })}
              placeholder="Ej: Corona 38T Honda Titan"
              className="font-medium bg-slate-50 border-slate-200 h-9 rounded-xl text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
              <Input
                type="number"
                value={artData.costo || ""}
                onChange={(e) => handleCostoChange(Number(e.target.value))}
                placeholder="0"
                className="font-bold bg-slate-50 border-slate-200 h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
              <Input
                type="number"
                value={artData.margenGanancia || ""}
                onChange={(e) => handleMargenChange(Number(e.target.value))}
                placeholder="50"
                className="font-bold bg-slate-50 border-slate-200 h-9 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100">
            <Label className="text-xs font-bold text-indigo-700 uppercase mb-1.5 block">
              Precio Final de Venta
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-indigo-900">$</span>
              <Input
                type="number"
                value={artData.precio}
                onChange={(e) =>
                  setArtData({ ...artData, precio: Number(e.target.value) })
                }
                className="font-black text-xl bg-white border-indigo-200 text-indigo-800 h-10 rounded-xl"
              />
            </div>
            <p className="text-[10px] text-indigo-500 mt-1 italic">
              * Se redondea automáticamente a múltiplos de $50 al guardar.
            </p>
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
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-6 shadow-md shadow-indigo-600/20"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Crear Artículo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
