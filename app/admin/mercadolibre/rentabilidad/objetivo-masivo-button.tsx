"use client";

import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AjustePrecio } from "@/app/actions/ajuste-precios";
import type { ProductoRentabilidad } from "./rentabilidad-table";
import { crearAjusteObjetivo, type ModoBaja } from "./objetivo-ajuste";

export default function ObjetivoMasivoButton({
  data,
  selectedIds,
  onAplicar,
}: {
  data: ProductoRentabilidad[];
  selectedIds: Set<string>;
  onAplicar: (ajustes: AjustePrecio[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [targetPct, setTargetPct] = useState("");
  const [modoBaja, setModoBaja] = useState<ModoBaja>("DESCUENTO");

  const seleccionados = data.filter((d) => selectedIds.has(d.item_id));
  const cantidad = seleccionados.length;
  const targetNum = Number(targetPct);
  const targetValido = targetPct !== "" && !isNaN(targetNum);

  const resultados = useMemo(() => {
    if (!targetValido) return [];
    return seleccionados.map((item) => ({
      item,
      resultado: crearAjusteObjetivo(item, targetNum, modoBaja),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, data, targetNum, targetValido, modoBaja]);

  const aplicables = resultados.filter((r) => r.resultado.ajuste !== null);

  const aplicar = () => {
    onAplicar(aplicables.map((r) => r.resultado.ajuste!));
    setOpen(false);
    setTargetPct("");
  };

  if (cantidad === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 gap-1.5"
      >
        <Target className="h-3.5 w-3.5" />
        Rentabilidad objetivo
        <span className="bg-violet-100 text-violet-700 font-bold rounded-full px-1.5 py-0.5 text-[10px] leading-none">
          {cantidad}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-violet-600" />
              Llevar a rentabilidad objetivo
            </DialogTitle>
            <DialogDescription>
              Calcula el precio necesario para que cada una de las {cantidad} publicaciones tildadas
              quede en la ganancia % que definas, subiendo o bajando el precio según corresponda.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 pb-4 border-b space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                Ganancia objetivo
              </span>
              <Input
                type="number"
                placeholder="%"
                value={targetPct}
                onChange={(e) => setTargetPct(e.target.value)}
                className="w-28 text-right"
                autoFocus
              />
              <span className="text-sm text-slate-500">%</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                A las que hay que bajarles el precio, hacerlo:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModoBaja("DESCUENTO")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                    modoBaja === "DESCUENTO"
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Percent className="h-3.5 w-3.5" /> Con descuento (promoción ML)
                </button>
                <button
                  type="button"
                  onClick={() => setModoBaja("PRECIO")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                    modoBaja === "PRECIO"
                      ? "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <DollarSign className="h-3.5 w-3.5" /> Modificando el precio
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Las que necesitan subir siempre modifican el precio de lista real (ML no permite subir vía promoción).
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {!targetValido ? (
              <p className="p-6 text-sm text-slate-400 text-center">
                Ingresá una ganancia objetivo para ver la simulación.
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-100 border-b">
                  <tr>
                    <th className="text-left p-2 pl-4 font-semibold text-slate-600">Publicación</th>
                    <th className="text-right p-2 font-semibold text-[#d413c3]">Gan. actual</th>
                    <th className="text-center p-2 font-semibold text-slate-600">Acción</th>
                    <th className="text-right p-2 font-semibold text-slate-600">P. actual</th>
                    <th className="text-right p-2 pr-4 font-semibold text-violet-700">Nuevo precio</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map(({ item, resultado }, i) => {
                    const sube = resultado.ajuste
                      ? resultado.ajuste.nuevo_precio >= resultado.ajuste.precio_actual_nuestro
                      : false;
                    return (
                      <tr
                        key={item.item_id}
                        className={cn(
                          "border-b border-slate-100",
                          i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                        )}
                      >
                        <td className="p-2 pl-4">
                          <span className="font-medium text-slate-800 truncate max-w-[220px] block">
                            {item.nombre}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">{item.item_id}</span>
                        </td>
                        <td className="p-2 text-right font-black text-[#d413c3]">
                          {item.ganancia_porcentaje.toFixed(1)}%
                        </td>
                        <td className="p-2 text-center">
                          {resultado.ajuste ? (
                            sube ? (
                              <Badge className="text-[9px] h-5 bg-emerald-100 text-emerald-700 gap-0.5 hover:bg-emerald-100">
                                <TrendingUp className="h-3 w-3" /> Sube
                              </Badge>
                            ) : (
                              <Badge className="text-[9px] h-5 bg-amber-100 text-amber-700 gap-0.5 hover:bg-amber-100">
                                <TrendingDown className="h-3 w-3" /> Baja
                              </Badge>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400">{resultado.motivo}</span>
                          )}
                        </td>
                        <td className="p-2 text-right text-slate-600 font-medium">
                          ${Math.round(item.precio_final_nuestro).toLocaleString("es-AR")}
                        </td>
                        <td className="p-2 pr-4 text-right font-black text-violet-700">
                          {resultado.ajuste
                            ? `$${resultado.ajuste.nuevo_precio.toLocaleString("es-AR")}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="p-4 border-t bg-slate-50 rounded-b-lg">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-slate-500">
                {aplicables.length} de {cantidad} se pueden ajustar a este objetivo.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={aplicar}
                  disabled={aplicables.length === 0}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  <Target className="h-4 w-4" />
                  Encolar {aplicables.length} ajustes
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
