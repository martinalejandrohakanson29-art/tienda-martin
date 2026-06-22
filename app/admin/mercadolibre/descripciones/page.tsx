// app/admin/mercadolibre/descripciones/page.tsx
export const dynamic = "force-dynamic";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDescripcionesStats } from "@/app/actions/descripciones";
import { DescripcionesClient } from "./descripciones-client";

export default async function DescripcionesPage() {
  const stats = await getDescripcionesStats();

  return (
    <div className="flex flex-col h-screen bg-slate-50/50 overflow-hidden">
      <div className="flex items-center gap-4 px-8 py-4 border-b bg-white shadow-sm">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Descripción Publicaciones</h1>
          <p className="text-xs text-slate-500">
            Buscá una palabra y descubrí en qué publicaciones de Mercado Libre aparece.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <DescripcionesClient
          total={stats.total}
          ultimaActualizacion={stats.ultimaActualizacion ? stats.ultimaActualizacion.toISOString() : null}
        />
      </div>
    </div>
  );
}
