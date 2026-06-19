import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import PlanningTable from "./planning-table"; 

export default function PlanningPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/mercadolibre">
            <Button variant="ghost" size="sm" className="gap-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
          </Link>
          <h1 className="text-lg md:text-3xl font-bold tracking-tight text-gray-800 truncate">Planificación de Pedido</h1>
        </div>
        <div className="flex gap-2">
            <Link href="https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=html" target="_blank">
                <Button variant="outline" size="sm" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Ver Original
                </Button>
            </Link>
        </div>
      </div>

      {/* Cargamos la tabla inicialmente vacía */}
      <PlanningTable initialHeaders={[]} initialBody={[]} />
    </div>
  );
}
