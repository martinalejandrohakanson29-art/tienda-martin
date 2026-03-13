// app/admin/mercadolibre/ventas-rango/ventas-rango-client.tsx
"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, TrendingUp, DollarSign, Percent } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Interface para los datos de n8n
interface VentaRango {
  mla: string;
  costo_total: string;
  envio: number;
  neto_recibido: number;
  Impuestos: string;
  comision: number;
  external_reference: string;
  titulo: string;
  "monto bruto": string;
}

export default function VentasRangoClient() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<VentaRango[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formateadores auxiliares
  const formatMoney = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return "$0,00";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(num);
  };

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 100);
  };

  // CÁLCULOS DEL RESUMEN (Memoized para rendimiento)
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const count = data.length;
    const totals = data.reduce((acc, v) => {
      const bruto = parseFloat(v["monto bruto"]) || 0;
      const comision = v.comision || 0;
      const envio = v.envio || 0;
      const impuestos = parseFloat(v.Impuestos) || 0;
      const costo = parseFloat(v.costo_total) || 0;
      const neto = v.neto_recibido || 0;

      return {
        bruto: acc.bruto + bruto,
        comision: acc.comision + comision,
        envio: acc.envio + envio,
        impuestos: acc.impuestos + impuestos,
        costo: acc.costo + costo,
        neto: acc.neto + neto,
      };
    }, { bruto: 0, comision: 0, envio: 0, impuestos: 0, costo: 0, neto: 0 });

    const getMetrics = (totalValue: number) => ({
      total: totalValue,
      promedio: totalValue / count,
      porcentaje: (totalValue / totals.bruto) * 100
    });

    return {
      count,
      bruto: { total: totals.bruto, promedio: totals.bruto / count, porcentaje: 100 },
      comision: getMetrics(totals.comision),
      envio: getMetrics(totals.envio),
      impuestos: getMetrics(totals.impuestos),
      costo: getMetrics(totals.costo),
      neto: getMetrics(totals.neto),
    };
  }, [data]);

  const handleConsultar = async () => {
    if (!startDate || !endDate) {
      setError("Por favor, selecciona la fecha de inicio y de fin.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/webhooks/n8n/ventas-rango", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!res.ok) throw new Error("Error al consultar los datos");
      const jsonData = await res.json();
      setData(jsonData);
    } catch (err) {
      console.error(err);
      setError("Hubo un problema al traer las ventas. Revisa tu conexión con n8n.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* TARJETA DE FILTROS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Filtros de Búsqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6 items-end">
            <div className="space-y-2 w-full md:w-1/3">
              <Label htmlFor="startDate">Fecha de Inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 w-full md:w-1/3">
              <Label htmlFor="endDate">Fecha de Fin</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleConsultar} 
              disabled={isLoading}
              className="w-full md:w-auto bg-teal-600 hover:bg-teal-700 text-white gap-2"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isLoading ? "Consultando..." : "Consultar Ventas"}
            </Button>
          </div>
          {error && <p className="text-red-500 mt-4 text-sm font-medium">{error}</p>}
        </CardContent>
      </Card>

      {/* BLOQUE DE RESUMEN FINANCIERO */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Ventas Totales</p>
                  <h3 className="text-3xl font-bold text-slate-900">{stats.count}</h3>
                  <p className="text-xs text-slate-400 mt-1">Operaciones realizadas</p>
                </div>
                <TrendingUp className="text-slate-400 h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-100">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-blue-600 uppercase tracking-wider">Bruto Total</p>
              <h3 className="text-2xl font-bold text-blue-900">{formatMoney(stats.bruto.total)}</h3>
              <p className="text-xs text-blue-500 mt-1">Prom: {formatMoney(stats.bruto.promedio)} /venta</p>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-100">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-green-600 uppercase tracking-wider">Neto Recibido</p>
              <h3 className="text-2xl font-bold text-green-900">{formatMoney(stats.neto.total)}</h3>
              <div className="flex gap-2 text-xs text-green-600 mt-1 font-medium">
                <span>{formatPercent(stats.neto.porcentaje)} del bruto</span>
                <span>•</span>
                <span>Prom: {formatMoney(stats.neto.promedio)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-orange-50 border-orange-100">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-orange-600 uppercase tracking-wider">Costo Mercadería</p>
              <h3 className="text-2xl font-bold text-orange-900">{formatMoney(stats.costo.total)}</h3>
              <div className="flex gap-2 text-xs text-orange-600 mt-1 font-medium">
                <span>{formatPercent(stats.costo.porcentaje)} del bruto</span>
                <span>•</span>
                <span>Prom: {formatMoney(stats.costo.promedio)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Segunda fila de costos detallados */}
          <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex flex-col">
              <span className="text-xs font-bold text-red-600 uppercase">Comisiones ML</span>
              <span className="text-lg font-bold">{formatMoney(stats.comision.total)}</span>
              <span className="text-xs text-red-500">{formatPercent(stats.comision.porcentaje)} del total • Prom: {formatMoney(stats.comision.promedio)}</span>
            </div>
            <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex flex-col">
              <span className="text-xs font-bold text-red-600 uppercase">Gastos Envío</span>
              <span className="text-lg font-bold">{formatMoney(stats.envio.total)}</span>
              <span className="text-xs text-red-500">{formatPercent(stats.envio.porcentaje)} del total • Prom: {formatMoney(stats.envio.promedio)}</span>
            </div>
            <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex flex-col">
              <span className="text-xs font-bold text-red-600 uppercase">Impuestos (Ret/Per)</span>
              <span className="text-lg font-bold">{formatMoney(stats.impuestos.total)}</span>
              <span className="text-xs text-red-500">{formatPercent(stats.impuestos.porcentaje)} del total • Prom: {formatMoney(stats.impuestos.promedio)}</span>
            </div>
          </div>
        </div>
      )}

      {/* TARJETA DE RESULTADOS (LA TABLA) */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Detalle de Ventas ({data.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MLA / Ref</TableHead>
                  <TableHead className="min-w-[200px]">Título</TableHead>
                  <TableHead className="text-right">Monto Bruto</TableHead>
                  <TableHead className="text-right text-red-600">Comisión</TableHead>
                  <TableHead className="text-right text-red-600">Envío</TableHead>
                  <TableHead className="text-right text-red-600">Impuestos</TableHead>
                  <TableHead className="text-right text-orange-600">Costo</TableHead>
                  <TableHead className="text-right text-orange-600 font-bold">% Costo/Púb</TableHead>
                  <TableHead className="text-right text-green-600 font-bold">Neto Recibido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((venta, index) => {
                  const bruto = parseFloat(venta["monto bruto"]) || 0;
                  const costo = parseFloat(venta.costo_total) || 0;
                  const pctCostoPublico = bruto > 0 ? (costo / bruto) * 100 : 0;

                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="font-medium text-blue-600">{venta.mla}</div>
                        <div className="text-xs text-gray-400">{venta.external_reference}</div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{venta.titulo}</TableCell>
                      <TableCell className="text-right">{formatMoney(venta["monto bruto"])}</TableCell>
                      <TableCell className="text-right text-red-600">{formatMoney(venta.comision)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatMoney(venta.envio)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatMoney(venta.Impuestos)}</TableCell>
                      <TableCell className="text-right text-orange-600">{formatMoney(venta.costo_total)}</TableCell>
                      <TableCell className="text-right text-orange-700 font-semibold bg-orange-50/50">
                        {formatPercent(pctCostoPublico)}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-bold">{formatMoney(venta.neto_recibido)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
