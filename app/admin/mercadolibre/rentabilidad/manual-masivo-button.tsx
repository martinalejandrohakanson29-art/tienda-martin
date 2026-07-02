"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendingDown, TrendingUp, PencilLine } from "lucide-react";
import { toast } from "sonner";
import type { AjustePrecio } from "@/app/actions/ajuste-precios";
import type { ProductoRentabilidad } from "./rentabilidad-table";
import { crearAjusteManual } from "./manual-ajuste";

export default function DescuentoManualMasivoButton({
  data,
  selectedIds,
  onAplicar,
}: {
  data: ProductoRentabilidad[];
  selectedIds: Set<string>;
  onAplicar: (ajustes: AjustePrecio[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState("");

  const seleccionados = data.filter((d) => selectedIds.has(d.item_id));
  const cantidad = seleccionados.length;
  const pctNum = Number(pct);
  const pctValido = !!pct && !isNaN(pctNum) && pctNum > 0;

  const aplicar = (tipo: "DESCUENTO" | "SUBA") => {
    if (!pctValido) return;
    try {
      onAplicar(seleccionados.map((item) => crearAjusteManual(item, pctNum, tipo)));
      setOpen(false);
      setPct("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo aplicar el ajuste.");
    }
  };

  if (cantidad === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
      >
        <PencilLine className="h-3.5 w-3.5" />
        Descuento manual
        <span className="bg-blue-100 text-blue-700 font-bold rounded-full px-1.5 py-0.5 text-[10px] leading-none">
          {cantidad}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-blue-600" />
              Ajuste manual masivo
            </DialogTitle>
            <DialogDescription>
              Se aplicará el mismo porcentaje a las {cantidad} publicaciones tildadas, pisando
              cualquier sugerencia por regla que tuvieran.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="%"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="text-right"
              autoFocus
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => aplicar("DESCUENTO")}
              disabled={!pctValido}
              className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-2"
            >
              <TrendingDown className="h-4 w-4" /> Aplicar como descuento
            </Button>
            <Button
              onClick={() => aplicar("SUBA")}
              disabled={!pctValido}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <TrendingUp className="h-4 w-4" /> Aplicar como suba
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
