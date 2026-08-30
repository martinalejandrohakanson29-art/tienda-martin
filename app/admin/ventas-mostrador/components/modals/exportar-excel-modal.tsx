"use client";

import React, { useState } from "react";
import { FileSpreadsheet, FileDown, Loader2, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportarVentasListadoParaExcel } from "@/app/actions/ventas-mostrador";
import { PuntoVenta } from "../../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fechaDesdeInicial: string;
  fechaHastaInicial: string;
  puntosVenta: PuntoVenta[];
}

export function ExportarExcelModal({
  open,
  onOpenChange,
  fechaDesdeInicial,
  fechaHastaInicial,
  puntosVenta,
}: Props) {
  const [desde, setDesde] = useState(fechaDesdeInicial);
  const [hasta, setHasta] = useState(fechaHastaInicial);
  const [puntosSeleccionados, setPuntosSeleccionados] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const togglePunto = (id: string) => {
    setPuntosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExportar = async () => {
    setIsExporting(true);
    try {
      const datos = await exportarVentasListadoParaExcel(
        desde,
        hasta,
        puntosSeleccionados.length > 0 ? puntosSeleccionados : undefined
      );

      const filas: any[] = [];
      for (const venta of datos) {
        const fecha = new Date(venta.createdAt).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "America/Argentina/Buenos_Aires",
        });
        venta.items.forEach((item: any, idx: number) => {
          filas.push({
            "N° Venta": venta.numeroVenta ?? "",
            Fecha: fecha,
            Cliente: venta.cliente,
            Artículo: item.nombre,
            Cantidad: item.cantidad,
            "Precio Unit.": item.precio_unit,
            "Método de Pago": idx === 0 ? venta.metodo_pago : "",
            "Total Venta": idx === 0 ? venta.totalFinal : "",
            "Punto de Venta": idx === 0 ? venta.puntoVenta ?? "" : "",
          });
        });
      }

      // Dynamic import de XLSX para que no pese en el bundle inicial
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [
        { wch: 10 },
        { wch: 14 },
        { wch: 28 },
        { wch: 45 },
        { wch: 10 },
        { wch: 14 },
        { wch: 22 },
        { wch: 14 },
        { wch: 20 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Listado de Ventas");
      XLSX.writeFile(wb, `ventas_${desde}_${hasta}.xlsx`);
      onOpenChange(false);
    } catch (err) {
      console.error("Error al exportar:", err);
      alert("Ocurrió un error al generar el archivo Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl p-6 border border-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Exportar Listado a Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Desde</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="h-10 text-xs bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Hasta</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="h-10 text-xs bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">
              Puntos de Venta (opcional)
            </Label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
              {puntosVenta.map((pv) => {
                const sel = puntosSeleccionados.includes(pv.id);
                return (
                  <button
                    key={pv.id}
                    type="button"
                    onClick={() => togglePunto(pv.id)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                      sel
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {pv.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-slate-200"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExportar}
            disabled={isExporting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 shadow-md shadow-emerald-600/20 font-bold"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generando...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" /> Descargar XLSX
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
