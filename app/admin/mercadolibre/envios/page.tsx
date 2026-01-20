import { Button } from "@/components/ui/button";
import { ArrowLeft, Construction } from "lucide-react";
import Link from "next/link";

export default function GestionEnviosPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Encabezado con botón de volver */}
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Envíos (Colecta y Flex)</h1>
      </div>

      {/* Contenedor de marcador de posición (Placeholder) */}
      <div className="bg-white p-12 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="bg-slate-50 p-4 rounded-full mb-4">
          <Construction className="h-12 w-12 text-slate-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-700">Sección en Construcción</h2>
        <p className="text-slate-500 max-w-sm mt-2">
          Estamos preparando las herramientas para el control de Colectas y la logística de Mercado Envíos Flex.
        </p>
      </div>
    </div>
  );
}
