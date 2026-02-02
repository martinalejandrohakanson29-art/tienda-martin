"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface RentabilidadRow {
  item_id: string;
  nombre: string;
  precio_original: number;
  estado: string;
}

export default function RentabilidadTable({ data }: { data: RentabilidadRow[] }) {
  const [search, setSearch] = useState("");

  const filteredData = data.filter(item => 
    item.nombre.toLowerCase().includes(search.toLowerCase()) ||
    item.item_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por nombre o MLA..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      
      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="font-bold">Item ID (MLA)</TableHead>
              <TableHead className="font-bold">Nombre de Publicación</TableHead>
              <TableHead className="font-bold text-right">Precio en ML</TableHead>
              <TableHead className="font-bold text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <TableRow key={item.item_id}>
                  <TableCell className="font-mono text-blue-600 font-medium">{item.item_id}</TableCell>
                  <TableCell className="max-w-md truncate">{item.nombre}</TableCell>
                  <TableCell className="text-right font-semibold">
                    ${item.precio_original.toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.estado === 'active' ? 'default' : 'secondary'}>
                      {item.estado === 'active' ? 'Activo' : item.estado}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-gray-500">
                  No se encontraron resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
