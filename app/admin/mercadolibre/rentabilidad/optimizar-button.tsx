"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingDown, TrendingUp, ArrowUpDown, Zap, CheckCircle2 } from "lucide-react";
import { ejecutarAjustesRentabilidad, type AjustePrecio } from "@/app/actions/ajuste-precios";
import { cn } from "@/lib/utils";

export default function OptimizarPreciosButton({
  ajustes,
}: {
  ajustes: AjustePrecio[];
}) {
  const [open, setOpen] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(false);

  const descuentos = useMemo(() => ajustes.filter((a) => a.tipo === "DESCUENTO"), [ajustes]);
  const subas = useMemo(() => ajustes.filter((a) => a.tipo === "SUBA"), [ajustes]);
  const manuales = useMemo(() => ajustes.filter((a) => a.es_manual), [ajustes]);

  const handleEjecutar = async () => {
    setEjecutando(true);
    setError(false);
    const payload = ajustes.map((a) => ({
      item_id: a.item_id,
      nuevo_precio: a.nuevo_precio,
      precio_original: a.precio_original,
      tipo: a.tipo,
    }));
    const { success } = await ejecutarAjustesRentabilidad(payload);
    setEjecutando(false);
    if (success) {
      setOpen(false);
      setEnviado(true);
    } else {
      setError(true);
    }
  };

  if (ajustes.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => { setEnviado(false); setError(false); setOpen(true); }}
        variant="outline"
        className="border-violet-300 text-violet-700 hover:bg-violet-50 gap-2 h-8 text-xs"
      >
        <Zap className="h-3.5 w-3.5" />
        Aplicar ajustes
        <span className="bg-violet-100 text-violet-700 font-bold rounded-full px-1.5 py-0.5 text-[10px] leading-none">
          {ajustes.length}
        </span>
      </Button>

      {enviado && (
        <span className="text-xs text-violet-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Ajustes enviados
        </span>
      )}
      {error && (
        <span className="text-xs text-red-500 font-medium">Error al enviar</span>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-violet-600" />
              Aplicar ajustes — {ajustes.length} publicaciones seleccionadas
            </DialogTitle>
            <DialogDescription className="flex flex-wrap gap-3">
              {descuentos.length > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {descuentos.length} descuento(s) → promoción en ML
                </span>
              )}
              {subas.length > 0 && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {subas.length} cambio(s) directo(s) de precio → precio de lista real
                </span>
              )}
              {manuales.length > 0 && (
                <span className="flex items-center gap-1 text-blue-600">
                  {manuales.length} manual(es)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-100 border-b">
                <tr>
                  <th className="text-left p-2 pl-4 font-semibold text-slate-600">Publicación</th>
                  <th className="text-center p-2 font-semibold text-slate-600">Acción</th>
                  <th className="text-right p-2 font-semibold text-[#d413c3]">Gan. actual</th>
                  <th className="text-right p-2 font-semibold text-slate-400">P. original</th>
                  <th className="text-right p-2 font-semibold text-slate-600">P. actual</th>
                  <th className="text-right p-2 pr-4 font-semibold text-violet-700">Nuevo precio</th>
                  <th className="text-right p-2 pr-4 font-semibold text-amber-600">Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((a, i) => {
                  // La dirección real (sube/baja) se determina por el precio, no por el
                  // tipo: "SUBA" es el mecanismo de precio directo y también se usa para
                  // bajar precio sin promoción (ver objetivo-ajuste.ts).
                  const sube = a.nuevo_precio >= a.precio_actual_nuestro;
                  return (
                    <tr
                      key={a.item_id}
                      className={cn(
                        "border-b border-slate-100",
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                      )}
                    >
                      <td className="p-2 pl-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-slate-800 truncate max-w-[200px]">
                            {a.nombre}
                          </span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9px] font-mono text-slate-400">{a.item_id}</span>
                            {a.es_manual ? (
                              <Badge className="text-[9px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100">
                                Manual
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 text-slate-500">
                                {a.regla_nombre}
                              </Badge>
                            )}
                            {a.tiene_campana_ml && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-blue-100 text-blue-700">
                                Campaña ML
                              </Badge>
                            )}
                            {a.nombre_variante && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                {a.nombre_variante}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        {sube ? (
                          <Badge className="text-[9px] h-5 bg-emerald-100 text-emerald-700 gap-0.5 hover:bg-emerald-100">
                            <TrendingUp className="h-3 w-3" /> Sube
                          </Badge>
                        ) : (
                          <Badge className="text-[9px] h-5 bg-amber-100 text-amber-700 gap-0.5 hover:bg-amber-100">
                            <TrendingDown className="h-3 w-3" /> {a.tipo === "DESCUENTO" ? "Descuento" : "Baja"}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-right font-black text-[#d413c3]">
                        {a.ganancia_actual.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-slate-400 line-through">
                        ${a.precio_original.toLocaleString("es-AR")}
                      </td>
                      <td className="p-2 text-right text-slate-600 font-medium">
                        ${a.precio_actual_nuestro.toLocaleString("es-AR")}
                      </td>
                      <td className={cn("p-2 pr-4 text-right font-black", sube ? "text-emerald-700" : "text-violet-700")}>
                        ${a.nuevo_precio.toLocaleString("es-AR")}
                      </td>
                      <td className={cn("p-2 pr-4 text-right font-bold", sube ? "text-emerald-600" : "text-amber-600")}>
                        {sube ? "+" : "-"}{Math.abs(a.ajuste_pct).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter className="p-4 border-t bg-slate-50 rounded-b-lg">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-slate-500">
                Descuentos: promoción <strong>PRICE_DISCOUNT</strong> (precio de lista intacto). Cambios directos: actualiza <strong>price</strong> real del ítem (sube o baja).
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={ejecutando}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleEjecutar}
                  disabled={ejecutando}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  {ejecutando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Aplicar {ajustes.length} ajustes
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
