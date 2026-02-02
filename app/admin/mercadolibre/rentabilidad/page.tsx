import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RentabilidadPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a Gestión ML
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Rentabilidad</h1>
      </div>

      <div className="bg-white p-8 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-semibold text-gray-700">Próximamente</h2>
        <p className="text-gray-500">Aquí enriqueceremos la sección con los datos de costos y márgenes.</p>
      </div>
    </div>
  );
}
