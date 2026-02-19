"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getVisitasComparativas } from "@/app/actions/visitas";

export default function VisitasClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMla, setSelectedMla] = useState<string>("");

  const rangos = {
    r1: { from: "2026-01-01", to: "2026-01-17" },
    r2: { from: "2026-02-01", to: "2026-02-17" }
  };

  useEffect(() => {
    getVisitasComparativas(rangos.r1, rangos.r2).then(res => {
      setData(res);
      if (res.comparativa.length > 0) {
        setSelectedMla(res.comparativa[0].mla);
      }
      setLoading(false);
    });
  }, []);

  // Lógica para preparar los datos de la gráfica del MLA seleccionado
  const chartData = useMemo(() => {
    if (!data || !selectedMla) return [];

    const vR1 = data.visitasRaw
      .filter((v: any) => v.mla === selectedMla && v.fecha >= new Date(rangos.r1.from) && v.fecha <= new Date(rangos.r1.to))
      .sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    const vR2 = data.visitasRaw
      .filter((v: any) => v.mla === selectedMla && v.fecha >= new Date(rangos.r2.from) && v.fecha <= new Date(rangos.r2.to))
      .sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    // Creamos una lista basada en el rango más largo para graficar día por día
    const maxDays = Math.max(vR1.length, vR2.length);
    return Array.from({ length: maxDays }, (_, i) => ({
      dia: `Día ${i + 1}`,
      periodo1: vR1[i]?.visitas || 0,
      periodo2: vR2[i]?.visitas || 0,
    }));
  }, [data, selectedMla]);

  if (loading) return <div className="p-8 text-center text-muted-foreground italic">Sincronizando datos de visitas...</div>;

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
        <CardTitle className="text-2xl font-bold">Análisis de Visitas por Publicación</CardTitle>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">Seleccionar Producto:</span>
          <Select value={selectedMla} onValueChange={setSelectedMla}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Busca un producto..." />
            </SelectTrigger>
            <SelectContent>
              {data.comparativa.map((item: any) => (
                <SelectItem key={item.mla} value={item.mla}>
                  {item.nombre} ({item.mla})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="graficas" className="space-y-6">
          <TabsList className="grid w-full max-w-[400px] grid-cols-2">
            <TabsTrigger value="graficas">Gráfica Detallada</TabsTrigger>
            <TabsTrigger value="tabla">Resumen Comparativo</TabsTrigger>
          </TabsList>

          <TabsContent value="graficas" className="space-y-4">
            <div className="h-[450px] w-full bg-slate-50/50 p-4 rounded-xl border border-dashed border-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Line 
                    type="monotone" 
                    dataKey="periodo1" 
                    stroke="#94a3b8" 
                    name="Periodo Anterior" 
                    strokeWidth={3} 
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="periodo2" 
                    stroke="#2563eb" 
                    name="Periodo Actual" 
                    strokeWidth={3} 
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-600 font-semibold uppercase tracking-wider">Total Periodo Actual</p>
                <p className="text-3xl font-bold text-blue-900">
                  {data.comparativa.find((p:any) => p.mla === selectedMla)?.totalR2}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">Crecimiento</p>
                <p className={`text-3xl font-bold ${Number(data.comparativa.find((p:any) => p.mla === selectedMla)?.growth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.comparativa.find((p:any) => p.mla === selectedMla)?.growth}%
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tabla" className="border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[400px]">Producto</TableHead>
                  <TableHead className="text-right">Periodo 1</TableHead>
                  <TableHead className="text-right">Periodo 2</TableHead>
                  <TableHead className="text-right">Dif.</TableHead>
                  <TableHead className="text-right">% Crecimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.comparativa.map((item: any) => (
                  <TableRow 
                    key={item.mla} 
                    className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${selectedMla === item.mla ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedMla(item.mla)}
                  >
                    <TableCell className="font-medium">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.mla}</div>
                      <div className="truncate max-w-[350px]">{item.nombre}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-500">{item.totalR1}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{item.totalR2}</TableCell>
                    <TableCell className={`text-right font-bold ${item.diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.diff > 0 ? `+${item.diff}` : item.diff}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.diff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.growth}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
