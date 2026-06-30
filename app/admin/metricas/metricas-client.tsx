"use client";

import React from "react";
import { BarChart2, TrendingUp, ArrowRightLeft, Store } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ResumenVentasTab from "@/app/admin/ventas-mostrador/resumen-ventas-tab";
import RendimientoVentasTab from "@/app/admin/ventas-mostrador/rendimiento-ventas-tab";
import ConciliacionArcaTab from "@/app/admin/ventas-mostrador/conciliacion-arca-tab";
import RendimientoPuntosVentaTab from "./rendimiento-puntos-venta-tab";

interface PuntoVenta {
  id: string;
  nombre: string;
  color?: string | null;
}

interface Props {
  puntosVenta: PuntoVenta[];
}

const today = () => new Date().toISOString().split("T")[0];

export default function MetricasClient({ puntosVenta }: Props) {
  return (
    <div className="h-screen w-full overflow-hidden flex flex-col">
      <Tabs defaultValue="resumen" className="flex-grow flex flex-col overflow-hidden h-full w-full">
        <div className="bg-white border-b border-slate-100 px-8 py-1">
          <TabsList className="bg-slate-100/50 p-1 flex justify-start">
            <TabsTrigger value="resumen" className="gap-2 px-6 bg-blue-50 text-blue-700 hover:bg-blue-100 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900 border border-transparent data-[state=active]:border-blue-200">
              <BarChart2 className="h-4 w-4" /> Resumen Detallado
            </TabsTrigger>
            <TabsTrigger value="rendimiento" className="gap-2 px-6 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-900 border border-transparent data-[state=active]:border-emerald-200">
              <TrendingUp className="h-4 w-4" /> Rendimiento de Ventas
            </TabsTrigger>
            <TabsTrigger value="puntos-venta" className="gap-2 px-6 bg-blue-50 text-blue-700 hover:bg-blue-100 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900 border border-transparent data-[state=active]:border-blue-200">
              <Store className="h-4 w-4" /> Detalles por Artículos
            </TabsTrigger>
            <TabsTrigger value="conciliacion" className="gap-2 px-6 bg-violet-50 text-violet-700 hover:bg-violet-100 data-[state=active]:bg-violet-100 data-[state=active]:text-violet-900 border border-transparent data-[state=active]:border-violet-200">
              <ArrowRightLeft className="h-4 w-4" /> Conciliación ARCA
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="resumen" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <ResumenVentasTab />
        </TabsContent>
        <TabsContent value="rendimiento" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <RendimientoVentasTab
            puntosVenta={puntosVenta}
            fechaDesdeInicial={today()}
            fechaHastaInicial={today()}
          />
        </TabsContent>
        <TabsContent value="puntos-venta" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <RendimientoPuntosVentaTab puntosVenta={puntosVenta} />
        </TabsContent>
        <TabsContent value="conciliacion" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <ConciliacionArcaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
