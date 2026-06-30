import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown, Zap, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { getRentabilidadData } from "@/app/actions/rentabilidad";
import { calcularAjustesRentabilidad } from "@/app/actions/ajuste-precios";
import { getComposicionAgregados } from "@/app/actions/kits";
import { getSnapshotsPrecios } from "@/app/actions/snapshots-precios";
import RefreshButton from "./refresh-button";
import ClearButton from "./clear-button";
import RentabilidadClient from "./rentabilidad-client";
import SnapshotsClient from "./snapshots/snapshots-client";

export default async function RentabilidadPage() {
  const [data, { ajustes }, agregados, snapshots] = await Promise.all([
    getRentabilidadData(),
    calcularAjustesRentabilidad(),
    getComposicionAgregados(),
    getSnapshotsPrecios(),
  ]);

  const totalItems = data.length;
  const conDescuento = data.filter(i => i.desc_pct_total > 0).length;
  const subasSugeridas = ajustes.filter(a => a.tipo === "SUBA").length;
  const descuentosSugeridos = ajustes.filter(a => a.tipo === "DESCUENTO").length;

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="p-6 pb-4 space-y-6 flex-none">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Link href="/admin/mercadolibre">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-amber-600" />
              Análisis de Rentabilidad Real
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/mercadolibre/rentabilidad/reglas">
              <Button variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Reglas de ajuste
              </Button>
            </Link>
            <SnapshotsClient snapshots={snapshots} />
            <ClearButton />
            <RefreshButton />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="p-4 bg-white border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Publicaciones</p>
            <p className="text-2xl font-bold text-slate-900">{totalItems}</p>
          </div>
          <div className="p-4 bg-white border border-green-100 rounded-lg">
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wider mb-1">Con Promociones</p>
            <p className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {conDescuento} <Zap className="h-5 w-5 fill-amber-400 text-amber-400" />
            </p>
          </div>
          <div className="p-4 bg-white border border-amber-100 rounded-lg">
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">Descuentos sugeridos</p>
            <p className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {descuentosSugeridos} <TrendingDown className="h-5 w-5 text-amber-500" />
            </p>
          </div>
          <div className="p-4 bg-white border border-emerald-100 rounded-lg">
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Subas sugeridas</p>
            <p className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {subasSugeridas} <TrendingUp className="h-5 w-5 text-emerald-500" />
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 min-h-0">
        <RentabilidadClient data={data} ajustes={ajustes} agregados={agregados} />
      </div>
    </div>
  );
}
