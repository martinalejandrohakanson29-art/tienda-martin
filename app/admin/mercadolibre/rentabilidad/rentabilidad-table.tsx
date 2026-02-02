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

  // Lógica de búsqueda mejorada
  const filteredData = data.filter(item => {
    // 1. Limpiamos el término de búsqueda de espacios innecesarios
    const searchTerm = search.toLowerCase().trim();
    
    // Si no hay nada escrito, mostramos todo
    if (!searchTerm) return true;

    // 2. Preparamos los campos para comparar (evitamos errores si vienen null)
    const nombre = (item.nombre || "").toLowerCase();
    const mla = (item.item_id || "").toLowerCase();

    // 3. Buscamos coincidencia en cualquiera de los dos campos
    return nombre.includes(searchTerm) || mla.includes(searchTerm);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por nombre o MLA (ej: MLA123...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm border-amber-200 focus:border-amber-500 focus:ring-amber-500"
        />
        {search && (
          <span className="text-xs text-gray-400">
            Encontrados: {filteredData.length}
          </span>
        )}
      </div>
      
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
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <TableRow key={item.item_id} className="hover:bg-amber-50/30 transition-colors">
                  <TableCell className="font-mono text-[10px] text-blue-600 font-medium">
                    {item.item_id}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {item.nombre}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    ${Number(item.precio_venta).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    -${Number(item.cargo_venta_ars).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-red-500">
                    {item.cargo_venta_porc}%
                  </TableCell>
                  <TableCell className="text-right text-orange-600">
                    -${Number(item.cuotas_ars).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-orange-500">
                    {item.cuotas_porc}%
                  </TableCell>
                  <TableCell className="text-right text-blue-600">
                    -${Number(item.envio).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-gray-500">
                    -${Number(item.costo_fijo_ml).toLocaleString('es-AR')}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-gray-500">
                  No se encontraron productos que coincidan con "{search}"
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
