// app/admin/mercadolibre/calculo-precio/page.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calculator, DollarSign, Percent, Info } from "lucide-react";
import Link from "next/link";

export default function CalculoPrecioPage() {
  // Estados para los valores ingresados (con tus valores por defecto)
  const [costo, setCosto] = useState<number>(0);
  const [ganancia, setGanancia] = useState<number>(50); // 50%
  const [cargoML, setCargoML] = useState<number>(14.54); // 14.54%
  const [cargoCuotas, setCargoCuotas] = useState<number>(4); // 4%
  const [impuesto, setImpuesto] = useState<number>(2); // 2%
  const [envio, setEnvio] = useState<number>(8000); // $8.000
  const [descuento, setDescuento] = useState<number>(5); // 5%

  // --- LÓGICA DE CÁLCULO ---
  
  // 1. ¿Cuánto dinero limpio queremos que nos quede en el bolsillo? (Costo + % de Ganancia)
  const gananciaNetaTeorica = costo * (1 + ganancia / 100);
  const gananciaEnPesos = gananciaNetaTeorica - costo;

  // 2. Sumamos todos los porcentajes de retención que nos aplicará Mercado Libre
  const retencionesPorcentaje = (cargoML + cargoCuotas + impuesto) / 100;

  // 3. Calculamos el Precio Final (el que paga el comprador) para que, tras restar comisiones y envío fijo, nos quede la Ganancia Neta Teórica.
  // Fórmula: Precio = (NetoEsperado + GastoFijo) / (1 - %Retenciones)
  // Evitamos dividir por cero o números negativos si los porcentajes suman más de 100%
  const divisor = 1 - retencionesPorcentaje;
  const precioFinalSinDescuento = divisor > 0 ? (gananciaNetaTeorica + envio) / divisor : 0;

  // 4. Si queremos publicar con un descuento visible (Ej: "Tachado 5% OFF"), 
  // tenemos que inflar el precio de lista para que al restarle el descuento lleguemos al Precio Final
  const precioListaConDescuento = descuento < 100 
    ? precioFinalSinDescuento / (1 - descuento / 100) 
    : 0;

  // Formateador de moneda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a Mercado Libre
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Cálculo de Precio ML</h1>
      </div>

      <p className="text-gray-500 text-lg">
        Ingresa tus costos y márgenes para obtener el precio de publicación ideal.
      </p>

      <div className="grid gap-6 md:grid-cols-12">
        {/* PANEL DE VARIABLES (Formulario) */}
        <Card className="md:col-span-7 shadow-sm">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Calculator className="h-5 w-5 text-slate-600" />
              Variables del Artículo
            </CardTitle>
            <CardDescription>Modifica los valores según corresponda</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            
            {/* Fila 1: Costo y Ganancia */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costo" className="text-slate-700 font-semibold">Costo del Artículo ($)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="costo"
                    type="number"
                    min="0"
                    className="pl-9"
                    value={costo || ""}
                    onChange={(e) => setCosto(Number(e.target.value))}
                    placeholder="Ej: 22000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ganancia" className="text-slate-700 font-semibold">Ganancia Esperada (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="ganancia"
                    type="number"
                    min="0"
                    className="pl-9"
                    value={ganancia || ""}
                    onChange={(e) => setGanancia(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <hr className="border-dashed" />

            {/* Fila 2: Comisiones ML */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargoML" className="text-xs font-semibold text-slate-600">Cargo por Vender (%)</Label>
                <Input
                  id="cargoML"
                  type="number"
                  step="0.01"
                  value={cargoML || ""}
                  onChange={(e) => setCargoML(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargoCuotas" className="text-xs font-semibold text-slate-600">Ofrecer Cuotas (%)</Label>
                <Input
                  id="cargoCuotas"
                  type="number"
                  step="0.01"
                  value={cargoCuotas || ""}
                  onChange={(e) => setCargoCuotas(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="impuesto" className="text-xs font-semibold text-slate-600">Impuestos (%)</Label>
                <Input
                  id="impuesto"
                  type="number"
                  step="0.01"
                  value={impuesto || ""}
                  onChange={(e) => setImpuesto(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Fila 3: Fijos y Descuentos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="envio" className="text-slate-700 font-semibold">Costo de Envío ($ Fijo)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="envio"
                    type="number"
                    min="0"
                    className="pl-9"
                    value={envio || ""}
                    onChange={(e) => setEnvio(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="descuento" className="text-slate-700 font-semibold">Descuento a Ofrecer (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="descuento"
                    type="number"
                    min="0"
                    className="pl-9"
                    value={descuento || ""}
                    onChange={(e) => setDescuento(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* PANEL DE RESULTADOS */}
        <div className="md:col-span-5 space-y-6">
          
          {/* Tarjeta de Resumen Neto */}
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-1">
                Ganancia Neta Teórica
              </h3>
              <p className="text-4xl font-extrabold text-emerald-600">
                {formatCurrency(gananciaNetaTeorica)}
              </p>
              <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                <Info className="h-4 w-4" />
                Tu costo recuperado + {formatCurrency(gananciaEnPesos)} de ganancia pura.
              </p>
            </CardContent>
          </Card>

          {/* Tarjeta de Precios de Publicación */}
          <Card className="border-blue-200 shadow-md">
            <CardHeader className="bg-blue-600 text-white rounded-t-lg pb-4">
              <CardTitle className="text-xl">Precios a Publicar</CardTitle>
              <CardDescription className="text-blue-100">
                Usa estos valores en Mercado Libre
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              
              {/* Bloque SIN descuento */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-gray-700">Sin Descuento (Normal)</h4>
                </div>
                <p className="text-3xl font-bold text-slate-800">
                  {formatCurrency(precioFinalSinDescuento)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Publica a este precio si NO vas a ofrecer el {descuento}% de descuento.
                </p>
              </div>

              {/* Bloque CON descuento */}
              <div className="p-6 bg-slate-50 rounded-b-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-blue-700 flex items-center gap-2">
                    Con Descuento del {descuento}%
                  </h4>
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                    RECOMENDADO
                  </span>
                </div>
                <p className="text-3xl font-bold text-blue-700 mb-1">
                  {formatCurrency(precioListaConDescuento)}
                </p>
                <p className="text-sm text-gray-600">
                  Precio final pagado por el cliente: <span className="font-bold">{formatCurrency(precioFinalSinDescuento)}</span>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Publica al precio grande y aplícale la campaña de descuento del {descuento}%. Te quedará exactamente la ganancia neta teórica.
                </p>
              </div>

            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
