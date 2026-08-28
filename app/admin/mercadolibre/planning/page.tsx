import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSpreadsheet, PackageCheck, Truck } from "lucide-react";
import Link from "next/link";
import PlanningTable from "./planning-table"; 

export default function PlanningPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/mercadolibre/full">
            <Button variant="ghost" size="sm" className="gap-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
              Volver a FULL
            </Button>
          </Link>
          <div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight text-gray-900 flex items-center gap-2">
              <Truck className="h-7 w-7 text-blue-600" /> Planificación de Envíos FULL
            </h1>
            <p className="text-xs md:text-sm text-gray-500">
              Previsión de demanda, stock en bodegas de ML, cálculo de cobertura y disponibilidad en taller.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/mercadolibre/full/preparacion">
            <Button variant="outline" size="sm" className="gap-2 text-purple-700 border-purple-200 hover:bg-purple-50">
              <PackageCheck className="h-4 w-4 text-purple-600" />
              Guía de Preparación
            </Button>
          </Link>
          <Link href="https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=html" target="_blank">
            <Button variant="ghost" size="sm" className="gap-2 text-gray-600">
              <FileSpreadsheet className="h-4 w-4" />
              Ver Sheet
            </Button>
          </Link>
        </div>
      </div>

      <PlanningTable initialHeaders={[]} initialBody={[]} />
    </div>
  );
}

