import { Button } from "@/components/ui/button";
import { ArrowLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import { getComposicionAgregados } from "@/app/actions/kits";
import EstadoPublicacionesClient from "./estado-publicaciones-client";

export default async function EstadoPublicacionesPage() {
  const agregados = await getComposicionAgregados();

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="p-6 pb-4 space-y-1 flex-none">
        <div className="flex items-center gap-2">
          <Link href="/admin/mercadolibre">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ToggleRight className="h-6 w-6 text-fuchsia-600" />
            Estado de Publicaciones
          </h1>
        </div>
        <p className="text-sm text-slate-500 pl-10">
          Publicaciones activas y pausadas en Mercado Libre, con ventas de los últimos 30 días. Pausá o activá sin salir de la app.
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 min-h-0">
        <EstadoPublicacionesClient agregados={agregados} />
      </div>
    </div>
  );
}
