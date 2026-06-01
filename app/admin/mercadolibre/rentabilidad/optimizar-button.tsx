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
import {
  calcularAjustesRentabilidad,
  ejecutarAjustesRentabilidad,
  type AjustePrecio,
} from "@/app/actions/ajuste-precios";
import { cn } from "@/lib/utils";

export default function OptimizarPreciosButton() {
  const [calculando, setCalculando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [open, setOpen] = useState(false);
  const [ajustes, setAjustes] = useState<AjustePrecio[]>([]);
  const [estado, setEstado] = useState<"idle" | "sin_cambios" | "enviado" | "error">("idle");

  const handleCalcular = async () => {
    setCalculando(true);
    setEstado("idle");
    const { success, ajustes: data } = await calcularAjustesRentabilidad();
    setCalculando(false);
    if (!success) { setEstado("error"); return; }
    if (data.length === 0) { setEstado("sin_cambios"); return; }
    setAjustes(data);
    setOpen(true);
  };

  const handleEjecutar = async () => {
    setEjecutando(true);
    const payload = ajustes.map(a => ({
      item_id: a.item_id,
      nuevo_precio: a.nuevo_precio,
      precio_original: a.precio_original,
    }));
    const { success } = await ejecutarAjustesRentabilidad(payload);
    setEjecutando(false);
    if (success) {
      setOpen(false);
      setEstado("enviado");
      setAjustes([]);
    } else {
      setEstado("error");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleCalcular}
        disabled={calculando}
        variant="outline"
        className="border-violet-300 text-violet-700 hover:bg-violet-50 gap-2"
      >
        {calculando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <TrendingDown className="h-4 w-4" />
        )}
        Optimizar precios
      </Button>

      {estado === "sin_cambios" && (
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Todos bajo 70%
        </span>
      )}
      {estado === "enviado" && (
        <span className="text-xs text-violet-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Ajustes enviados a ML
        </span>
      )}
      {estado === "error" && (
        <span className="text-xs text-red-500 font-medium">Error al procesar</span>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-violet-600" />
              Optimizar precios — {ajustes.length} publicaciones
            </DialogTitle>
            <DialogDescription>
              Ganancia actual &gt;70%. Se aplicará descuento propio para llevar al 65%.
              El cambio se aplica directamente en MercadoLibre.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-100 border-b">
                <tr>
                  <th className="text-left p-2 pl-4 font-semibold text-slate-600">Publicación</th>
                  <th className="text-right p-2 font-semibold text-[#d413c3]">Gan. actual</th>
                  <th className="text-right p-2 font-semibold text-slate-400">P. original</th>
                  <th className="text-right p-2 font-semibold text-slate-600">P. actual (nuestro)</th>
                  <th className="text-right p-2 pr-4 font-semibold text-violet-700">Nuevo precio</th>
                  <th className="text-right p-2 pr-4 font-semibold text-amber-600">Dcto. a aplicar</th>
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
                Se actualizará <strong>price</strong> y <strong>original_price</strong> en cada publicación de ML.
                La promoción no tiene vencimiento.
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
