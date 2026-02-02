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
import { useState, useMemo } from "react";

export default function RentabilidadTable({ data }: { data: any[] }) {
  const [search, setSearch] = useState("");

  // Usamos useMemo para que el filtro sea ultra rápido y solo se ejecute cuando cambie la búsqueda o los datos
  const filteredData = useMemo(() => {
    const query = search.toLowerCase().trim();
    
    // Si no hay nada escrito, mostramos toda la lista
    if (!query) return data;

    return data.filter((item) => {
      // Preparamos los campos de forma segura (manejando posibles nulos)
      const nombre = (item.nombre || "").toLowerCase();
      const mla = (item.item_id || "").toLowerCase();
      
      // La búsqueda debe coincidir en el nombre O en el MLA
      return nombre.includes(query) || mla.includes(query);
    });
  }, [search, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Buscar por MLA o Nombre (ej: MLA123...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm border-amber-200 focus:border-amber-500"
        />
        {search && (
          <span className="text-xs text-gray-400">
            Resultados encontrados: {filteredData.length}
          </span>
        )}
      </div>
      
      <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="font-bold min-w-[120px]">MLA</TableHead>
              <TableHead className="font-bold min-w-[250px]">Nombre de Publicación</TableHead>
              <TableHead className="font-bold text-right">Precio Venta</TableHead>
              {/* Columnas de Cargos (Fees) solicitadas anteriormente */}
              <TableHead className="font-bold text-right text-red-600">Cargo ($)</TableHead>
              <TableHead className="font-bold text-right text-orange-600">Cuotas ($)</TableHead>
              <TableHead className="font-bold text-right text-blue-600">Envío</TableHead>
              <TableHead className="font-bold text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <TableRow key={item.item_id} className="hover:bg-amber-50/50 transition-colors">
                  <TableCell className="font-mono text-xs text-blue-600 font-medium">
                    {item.item_id}
                  </TableCell>
                  <TableCell className="text-xs font-medium max-w-md truncate">
                    {item.nombre}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    ${Number(item.precio_venta || item.precio_original || 0).toLocaleString('es-AR')}
                  </TableCell>
                  {/* Estos datos vienen de la tabla MLFees que creamos */}
                  <TableCell className="text-right text-red-600 text-xs font-medium">
                    -${Number(item.cargo_venta_ars || 0).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-orange-600 text-xs font-medium">
                    -${Number(item.cuotas_ars || 0).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-blue-600 text-xs font-medium">
                    -${Number(item.envio || 0).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.estado === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {item.estado === 'active' ? 'Activo' : item.estado}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                  No se encontraron resultados para "{search}".
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
