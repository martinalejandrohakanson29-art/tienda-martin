import { getArticulos } from "@/app/actions/costos";
import { getConfig } from "@/app/actions/config"; // Importamos tu acción
import { ArticulosTable } from "./articulos-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function ArticulosPage() {
  const data = await getArticulos();
  const config = await getConfig(); // Traemos la config persistente

  return (
    <div className="flex flex-col h-screen">
      <div className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/mercadolibre">
            <Button variant="outline" size="sm" className="gap-2 border-slate-200">
              <ArrowLeft className="h-4 w-4" />
              Volver a Gestión
            </Button>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">Tabla Maestra de Artículos</h2>
        </div>
        <div className="text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
          {data.length} Artículos cargados
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 pt-4">
        {/* Pasamos la configuración inicial a la tabla */}
        <ArticulosTable data={data} initialConfig={config} />
      </div>
    </div>
  );
}
