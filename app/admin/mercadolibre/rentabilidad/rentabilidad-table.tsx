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
import { useState } from "react";

export default function RentabilidadTable({ data }: { data: any[] }) {
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
      
      <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="font-bold min-w-[120px]">MLA</TableHead>
              <TableHead className="font-bold min-w-[250px]">Producto</TableHead>
              <TableHead className="font-bold text-right">Precio Venta</TableHead>
              <TableHead className="font-bold text-right text-red-600">Cargo ($)</TableHead>
              <TableHead className="font-bold text-right text-red-600">Cargo (%)</TableHead>
              <TableHead className="font-bold text-right text-orange-600">Cuotas ($)</TableHead>
              <TableHead className="font-bold text-right text-orange-600">Cuotas (%)</TableHead>
              <TableHead className="font-bold text-right text-blue-600">Envío</TableHead>
              <TableHead className="font-bold text-right">C. Fijo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => (
              <TableRow key={item.item_id}>
                <TableCell className="font-mono text-xs">{item.item_id}</TableCell>
                <TableCell className="text-xs font-medium">{item.nombre}</TableCell>
                <TableCell className="text-right font-bold">${item.precio_venta.toLocaleString()}</TableCell>
                <TableCell className="text-right text-red-600">-${item.cargo_venta_ars.toLocaleString()}</TableCell>
                <TableCell className="text-right text-red-500">{item.cargo_venta_porc}%</TableCell>
                <TableCell className="text-right text-orange-600">-${item.cuotas_ars.toLocaleString()}</TableCell>
                <TableCell className="text-right text-orange-500">{item.cuotas_porc}%</TableCell>
                <TableCell className="text-right text-blue-600">-${item.envio.toLocaleString()}</TableCell>
                <TableCell className="text-right text-gray-500">-${item.costo_fijo_ml.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
