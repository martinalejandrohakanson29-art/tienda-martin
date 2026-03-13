// app/admin/mercadolibre/ventas-rango/ventas-rango-client.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Esta "Interface" le enseña a tu código qué forma tienen los datos que manda n8n
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

  // Función para darle formato de moneda (Pesos) a los números
  const formatMoney = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return "$0.00";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(num);
  };

  const handleConsultar = async () => {
    if (!startDate || !endDate) {
      setError("Por favor, selecciona la fecha de inicio y de fin.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Hacemos el llamado a nuestra API interna (la que hicimos en el Paso 2)
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

      {/* TARJETA DE RESULTADOS (LA TABLA) */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Resultados ({data.length} ventas)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MLA / Ref</TableHead>
                  <TableHead className="min-w-[250px]">Título</TableHead>
                  <TableHead className="text-right">Monto Bruto</TableHead>
                  <TableHead className="text-right text-red-600">Comisión</TableHead>
                  <TableHead className="text-right text-red-600">Envío</TableHead>
                  <TableHead className="text-right text-red-600">Impuestos</TableHead>
                  <TableHead className="text-right text-orange-600">Costo Producto</TableHead>
                  <TableHead className="text-right text-green-600 font-bold">Neto Recibido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((venta, index) => (
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
                    <TableCell className="text-right text-green-600 font-bold">{formatMoney(venta.neto_recibido)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
