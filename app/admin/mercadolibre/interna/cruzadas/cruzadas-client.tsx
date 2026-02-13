"use client";

import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Transferencia {
  id: string;
  monto: number;
  emisorImagen: string | null;
  receptorImagen: string | null;
  deTexto: string | null;
  paraTexto: string | null;
  procesada: boolean;
  createdAt: string;
}

export default function CruzadasClient({ initialData }: { initialData: Transferencia[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const filteredData = initialData.filter((item) => {
    // Buscador por receptor (imagen o texto)
    const matchesSearch = 
      (item.receptorImagen?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (item.paraTexto?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    
    // Filtro por fecha (formato YYYY-MM-DD)
    const itemDate = format(new Date(item.createdAt), "yyyy-MM-dd");
    const matchesDate = selectedDate ? itemDate === selectedDate : true;

    return matchesSearch && matchesDate;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Búsqueda</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Buscar Receptor</label>
            <Input 
              placeholder="Ej: Martin, Pablo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <label className="text-sm font-medium mb-1 block">Filtrar por Fecha</label>
            <Input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Receptor (IA / Texto)</TableHead>
              <TableHead>Emisor (IA / Texto)</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-blue-600">{item.receptorImagen || "-"}</div>
                    <div className="text-xs text-muted-foreground">{item.paraTexto || "-"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.emisorImagen || "-"}</div>
                    <div className="text-xs text-muted-foreground">{item.deTexto || "-"}</div>
                  </TableCell>
                  <TableCell className="font-bold text-green-600">
                    ${Number(item.monto).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell>
                    {item.procesada ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800">Procesada</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pendiente</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No se encontraron transferencias con esos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
