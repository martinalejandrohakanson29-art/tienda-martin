// app/admin/mercadolibre/ventas-rango/page.tsx
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import VentasRangoClient from "./ventas-rango-client";

export default function VentasRangoPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a Mercado Libre
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Ventas por Rango de Fechas</h1>
      </div>
      
      <p className="text-gray-500">
        Selecciona las fechas para consultar el rendimiento de ventas en ese período.
      </p>

      {/* Aquí cargamos el componente interactivo (el que tiene los botones y estados) */}
      <VentasRangoClient />
    </div>
  );
}
