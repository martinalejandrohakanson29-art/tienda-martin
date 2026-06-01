"use client";

import { useState } from "react";
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
import { Loader2, TrendingDown, Zap, CheckCircle2 } from "lucide-react";
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

  const handleEjecutar = async () => {
    setEjecutando(true);
    setError(false);
    const payload = ajustes.map((a) => ({
      item_id: a.item_id,
      nuevo_precio: a.nuevo_precio,
      precio_original: a.precio_original,
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
        <TrendingDown className="h-3.5 w-3.5" />
        Optimizar precios
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
              Optimizar precios — {ajustes.length} publicaciones seleccionadas
            </DialogTitle>
            <DialogDescription>
              Se aplicará descuento propio para llevar la ganancia al 65%.
              El cambio se aplica directamente en MercadoLibre sin vencimiento.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-100 border-b">
                <tr>
                  <th className="text-left p-2 pl-4 font-semibold text-slate-600">Publicación</th>
                  <th className="text-right p-2 font-semibold text-[#d413c3]">Gan. actual</th>
                  <th className="text-right p-2 font-semibold text-slate-400">P. original</th>
                  <th className="text-right p-2 font-semibold text-slate-600">P. actual</th>
                  <th className="text-right p-2 pr-4 font-semibold text-violet-700">Nuevo precio</th>
                  <th className="text-right p-2 pr-4 font-semibold text-amber-600">Dcto. aplicar</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((a, i) => (
                  <tr
                    key={a.item_id}
                    className={cn(
                      "border-b border-slate-100",
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    )}
                  >
                    <td className="p-2 pl-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-slate-800 truncate max-w-[220px]">
                          {a.nombre}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] font-mono text-slate-400">{a.item_id}</span>
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
                    <td className="p-2 text-right font-black text-[#d413c3]">
                      {a.ganancia_actual.toFixed(1)}%
                    </td>
                    <td className="p-2 text-right text-slate-400 line-through">
                      ${a.precio_original.toLocaleString("es-AR")}
                    </td>
                    <td className="p-2 text-right text-slate-600 font-medium">
                      ${a.precio_actual_nuestro.toLocaleString("es-AR")}
                    </td>
                    <td className="p-2 pr-4 text-right font-black text-violet-700">
                      ${a.nuevo_precio.toLocaleString("es-AR")}
                    </td>
                    <td className="p-2 pr-4 text-right font-bold text-amber-600">
                      -{a.nuevo_seller_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter className="p-4 border-t bg-slate-50 rounded-b-lg">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-slate-500">
                Actualiza <strong>price</strong> y <strong>original_price</strong> en ML. Sin vencimiento.
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
