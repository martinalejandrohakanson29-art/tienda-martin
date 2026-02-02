import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, TrendingUp } from "lucide-react";
import Link from "next/link";
import RentabilidadTable from "./rentabilidad-table";
import { getRentabilidadData } from "@/app/actions/rentabilidad";

export default async function RentabilidadPage() {
  // Obtenemos los datos desde el servidor
  const data = await getRentabilidadData();

  // Cálculos rápidos para las tarjetas de resumen
  const totalItems = data.length;
  const itemsConEnvio = data.filter(i => i.envio > 0).length;

  return (
    <div className="space-y-6 p-6 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/admin/mercadolibre">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-amber-700">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-amber-600" />
              Rentabilidad y Costos
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-10">
            Analiza los costos de venta, envío y financiación de tus publicaciones.
          </p>
        </div>
        
        <Button className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar Costos ML
        </Button>
      </div>

      {/* Tarjetas de Resumen (Stats) */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-4 bg-white border border-amber-100 rounded-lg shadow-sm">
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">Total Publicaciones</p>
          <p className="text-3xl font-bold text-gray-900">{totalItems}</p>
        </div>
        <div className="p-4 bg-white border border-blue-100 rounded-lg shadow-sm">
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-1">Subsidio Envíos</p>
          <p className="text-3xl font-bold text-gray-900">{itemsConEnvio}</p>
          <p className="text-xs text-gray-400 mt-1">Publicaciones donde pagas envío</p>
        </div>
      </div>

      {/* Tabla Interactiva */}
      <RentabilidadTable data={data} />
    </div>
  );
}
