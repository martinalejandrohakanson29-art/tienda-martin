import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileSpreadsheet } from "lucide-react";

export default function MercadoLibreDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-800">
        Gestión Mercado Libre
      </h1>
      <p className="text-muted-foreground">
        Selecciona una herramienta para comenzar.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Tarjeta de acceso a Planning */}
        <Link href="/admin/mercadolibre/planning">
          <Card className="hover:bg-slate-50 transition-colors cursor-pointer border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-bold text-gray-700">
                Planificación de Pedido
              </CardTitle>
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mt-2">
                Ver hoja de Google Sheets con el stock y reposición.
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Aquí podrás agregar más tarjetas en el futuro (ej. Métricas, Envíos, etc.) */}
      </div>
    </div>
  );
}
