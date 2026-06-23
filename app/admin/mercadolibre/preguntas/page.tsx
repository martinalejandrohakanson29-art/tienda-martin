import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAutoRespuestaConfig } from "@/app/actions/preguntas-ml";
import { PreguntasClient } from "./preguntas-client";

export default async function PreguntasMLPage() {
  const config = await getAutoRespuestaConfig();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Preguntas ML</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Configurá las respuestas automáticas a preguntas de compradores en Mercado Libre
          </p>
        </div>
      </div>

      <PreguntasClient config={config} />
    </div>
  );
}
