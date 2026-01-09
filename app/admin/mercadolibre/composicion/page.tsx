// app/admin/mercadolibre/composicion/page.tsx
import { getComposicionKits } from "@/app/actions/kits";
import { getArticulos } from "@/app/actions/costos";
import { ComposicionTable } from "./composicion-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function ComposicionPage() {
  // Traemos los datos de los kits y la lista de artículos para el buscador/selector
  const [kits, articulos] = await Promise.all([
    getComposicionKits(),
    getArticulos()
  ]);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/mercadolibre">
            <Button variant="outline" size="sm" className="gap-2 border-slate-200">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">Composición de Kits (Recetas)</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 pt-4">
        <ComposicionTable kits={kits} articulos={articulos} />
      </div>
    </div>
  );
}
