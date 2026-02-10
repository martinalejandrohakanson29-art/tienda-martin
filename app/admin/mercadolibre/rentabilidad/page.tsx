import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import RentabilidadTable from "./rentabilidad-table";
import { getRentabilidadData } from "@/app/actions/rentabilidad";
import RefreshButton from "./refresh-button"; // Importamos el nuevo botón

export default async function RentabilidadPage() {
  // Obtenemos los datos actualizados
  const data = await getRentabilidadData();
  
  const totalItems = data.length;
  const conDescuento = data.filter(i => i.desc_pct_total > 0).length;

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
          
          {/* Aquí usamos nuestro nuevo componente funcional */}
          <RefreshButton />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 min-h-0">
        <RentabilidadTable data={data} />
      </div>
    </div>
  );
}
