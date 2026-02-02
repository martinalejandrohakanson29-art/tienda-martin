import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import RentabilidadTable from "./rentabilidad-table";
import { getRentabilidadData } from "@/app/actions/rentabilidad";

export default function RentabilidadPage() {
  // En un escenario real, llamaríamos a la base de datos
  // Por ahora cargamos los datos maestros que ya existen
  const data = getRentabilidadData();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/mercadolibre">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver a Gestión ML
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-amber-800">Analisis de Rentabilidad</h1>
        </div>
        
        <Button className="bg-amber-600 hover:bg-amber-700 gap-2">
          <RefreshCw className="h-4 w-4" />
          Sincronizar con ML
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700 font-medium">Publicaciones Monitoreadas</p>
          <p className="text-2xl font-bold">124</p>
        </div>
        {/* Aquí irán más métricas como Margen Promedio, etc. */}
      </div>

      <RentabilidadTable data={Promise.resolve(data) as any} />
    </div>
  );
}
