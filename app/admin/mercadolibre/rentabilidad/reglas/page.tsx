import { Button } from "@/components/ui/button";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { getReglasAjuste } from "@/app/actions/reglas-ajuste";
import ReglasClient from "./reglas-client";

export const dynamic = "force-dynamic";

export default async function ReglasPage() {
  const reglas = await getReglasAjuste();

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="p-6 pb-4 space-y-2 flex-none">
        <div className="flex items-center gap-2">
          <Link href="/admin/mercadolibre/rentabilidad">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6 text-violet-600" />
            Reglas de ajuste de precios
          </h1>
        </div>
        <p className="text-sm text-slate-500 max-w-3xl">
          Las reglas se evalúan por <strong>prioridad ascendente</strong> (menor primero). Para cada
          publicación se aplica la <strong>primera regla activa</strong> cuyas condiciones (margen y
          ventas 30d) se cumplan todas. Una regla de <strong>descuento</strong> baja el precio vía
          promoción en ML; una de <strong>suba</strong> aumenta el precio de lista real un % fijo.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 min-h-0">
        <ReglasClient reglas={reglas} />
      </div>
    </div>
  );
}
