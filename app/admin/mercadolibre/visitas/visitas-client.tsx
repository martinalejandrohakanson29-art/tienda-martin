"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getVisitasComparativas } from "@/app/actions/visitas";
import { format } from "date-fns";

export default function VisitasClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fechas de ejemplo (n8n debería mandar estas mismas)
  const rangos = {
    r1: { from: "2026-01-01", to: "2026-01-17" },
    r2: { from: "2026-02-01", to: "2026-02-17" }
  };

  useEffect(() => {
    getVisitasComparativas(rangos.r1, rangos.r2).then(res => {
      setData(res);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-center">Cargando métricas de visitas...</div>;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Visitas de Publicaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="tabla" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tabla">Tabla Comparativa</TabsTrigger>
            <TabsTrigger value="graficas">Gráficas</TabsTrigger>
          </TabsList>

          <TabsContent value="tabla" className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Periodo 1</TableHead>
                  <TableHead className="text-right">Periodo 2</TableHead>
                  <TableHead className="text-right">Dif.</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.comparativa.map((item: any) => (
                  <TableRow key={item.mla}>
                    <TableCell className="font-medium">
                      <div className="text-xs text-muted-foreground">{item.mla}</div>
                      {item.nombre}
                    </TableCell>
                    <TableCell className="text-right">{item.totalR1}</TableCell>
                    <TableCell className="text-right">{item.totalR2}</TableCell>
                    <TableCell className={`text-right font-bold ${item.diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.diff > 0 ? `+${item.diff}` : item.diff}
                    </TableCell>
                    <TableCell className={`text-right ${item.diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.growth}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="graficas" className="h-[400px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.comparativa}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mla" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="totalR1" stroke="#8884d8" name="Periodo Anterior" strokeWidth={2} />
                <Line type="monotone" dataKey="totalR2" stroke="#82ca9d" name="Periodo Actual" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground text-center mt-4 italic">
              * El gráfico muestra el total acumulado por producto para comparar rendimiento entre periodos.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
