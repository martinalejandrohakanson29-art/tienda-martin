"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  prepararRestauracionSnapshot,
  type ItemRestaurable,
  type ItemExcluido,
  type SnapshotPrecios,
} from "@/app/actions/snapshots-precios";
import { ejecutarAjustesRentabilidad } from "@/app/actions/ajuste-precios";

export default function RestaurarSnapshotDialog({
  snapshot,
  onClose,
}: {
  snapshot: SnapshotPrecios;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [restaurables, setRestaurables] = useState<ItemRestaurable[]>([]);
  const [excluidos, setExcluidos] = useState<ItemExcluido[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [ejecutando, setEjecutando] = useState(false);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    prepararRestauracionSnapshot(snapshot.id).then((res) => {
      if (!activo) return;
      setRestaurables(res.restaurables);
      setExcluidos(res.excluidos);
      setSeleccionados(new Set(res.restaurables.map((r) => r.item_id)));
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [snapshot.id]);

  const toggle = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmar = async () => {
    const items = restaurables.filter((r) => seleccionados.has(r.item_id));
    if (items.length === 0) return;
    setEjecutando(true);
    const payload = items.map((r) => ({
      item_id: r.item_id,
      nuevo_precio: r.nuevo_precio,
      precio_original: r.precio_original,
      tipo: "DESCUENTO" as const,
    }));
    const result = await ejecutarAjustesRentabilidad(payload);
    setEjecutando(false);
    if (result.success) {
      toast.success(`Restaurados ${items.length} descuento(s)`);
      router.refresh();
      onClose();
    } else {
      toast.error("Error al enviar la restauración");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-violet-600" />
            Restaurar &quot;{snapshot.nombre}&quot;
          </DialogTitle>
          <DialogDescription>
            Se recalcula el precio aplicando el mismo % de descuento guardado sobre el precio de lista actual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center p-10 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              {restaurables.length > 0 && (
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 border-b">
                    <tr>
                      <th className="p-2 pl-4 w-8" />
                      <th className="text-left p-2 font-semibold text-slate-600">Publicación</th>
                      <th className="text-right p-2 font-semibold text-slate-400">P. original hoy</th>
                      <th className="text-right p-2 font-semibold text-violet-700">Nuevo precio</th>
                      <th className="text-right p-2 font-semibold text-amber-600">Descuento</th>
                      <th className="text-right p-2 pr-4 font-semibold text-[#d413c3]">Ganancia resultante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restaurables.map((r, i) => (
                      <tr
                        key={r.item_id}
                        className={cn("border-b border-slate-100", i % 2 === 0 ? "bg-white" : "bg-slate-50/50")}
                      >
                        <td className="p-2 pl-4">
                          <Checkbox
                            checked={seleccionados.has(r.item_id)}
                            onCheckedChange={() => toggle(r.item_id)}
                          />
                        </td>
                        <td className="p-2">
                          <span className="font-medium text-slate-800 truncate max-w-[220px] block">{r.nombre}</span>
                          <span className="text-[9px] font-mono text-slate-400">{r.item_id}</span>
                        </td>
                        <td className="p-2 text-right text-slate-400">${r.precio_original.toLocaleString("es-AR")}</td>
                        <td className="p-2 text-right font-black text-violet-700">${r.nuevo_precio.toLocaleString("es-AR")}</td>
                        <td className="p-2 text-right font-bold text-amber-600">-{r.ajuste_pct.toFixed(1)}%</td>
                        <td
                          className={cn(
                            "p-2 pr-4 text-right font-black",
                            r.ganancia_pct != null && r.ganancia_pct < 0 ? "text-red-600" : "text-[#d413c3]"
                          )}
                        >
                          {r.ganancia_pct != null ? `${r.ganancia_pct.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {excluidos.length > 0 && (
                <div className="p-3 m-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <p className="font-semibold flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {excluidos.length} publicación(es) no se pueden restaurar
                  </p>
                  <ul className="space-y-0.5">
                    {excluidos.map((e) => (
                      <li key={e.item_id}>
                        {e.nombre}: {e.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {restaurables.length === 0 && excluidos.length === 0 && (
                <p className="text-sm text-slate-500 p-6 text-center">Esta foto no tiene publicaciones guardadas.</p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-slate-50 rounded-b-lg">
          <Button variant="outline" onClick={onClose} disabled={ejecutando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={ejecutando || loading || seleccionados.size === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {ejecutando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Restaurar {seleccionados.size} descuento(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
