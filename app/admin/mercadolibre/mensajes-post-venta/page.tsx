import Link from "next/link";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getComposicionAgregados } from "@/app/actions/kits";
import {
  getMensajesPostVentaRules,
  getMensajesPostVentaLogs,
} from "@/app/actions/mensajes-post-venta";
import MensajesPostVentaClient from "./mensajes-post-venta-client";

export default async function MensajesPostVentaPage() {
  const [agregados, rulesRes, logsRes] = await Promise.all([
    getComposicionAgregados(),
    getMensajesPostVentaRules(),
    getMensajesPostVentaLogs(60),
  ]);

  return (
    <div className="flex flex-col min-h-full bg-slate-50/50 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/mercadolibre">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <MessageSquareText className="h-6 w-6 text-emerald-600" />
              Mensajes Post-Venta Automáticos
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Configurá mensajes automáticos por artículo (o combos que lo incluyan) para enviar recomendaciones y tips a los compradores.
            </p>
          </div>
        </div>
      </div>

      <MensajesPostVentaClient
        agregados={agregados}
        initialRules={rulesRes.data || []}
        initialLogs={logsRes.data || []}
      />
    </div>
  );
}
