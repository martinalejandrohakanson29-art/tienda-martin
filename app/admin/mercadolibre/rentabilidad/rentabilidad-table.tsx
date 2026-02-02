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
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";

export default function RentabilidadTable({ data }: { data: any[] }) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // Cantidad de filas por página

  // Función para actualizar búsqueda y resetear página
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1); // Volver a la primera página al buscar
  };

  // 1. Lógica de Filtrado (Calcula TODOS los resultados que coinciden)
  const filteredData = useMemo(() => {
    const query = search.toLowerCase().trim();
    
    // Si no hay búsqueda, devolvemos todo
    if (!query) return data;

    // Dividimos la búsqueda en palabras individuales
    const searchTerms = query.split(" ").filter(term => term.length > 0);

    return data.filter((item) => {
      const nombre = (item.nombre || "").toLowerCase();
      const mla = (item.item_id || "").toLowerCase();
      const searchableContent = `${nombre} ${mla}`;

      // Verificamos que TODAS las palabras estén presentes
      return searchTerms.every((term) => searchableContent.includes(term));
    });
  }, [search, data]);

  // 2. Lógica de Paginación (Corta solo el pedacito que vamos a mostrar)
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  
  // ¡AQUÍ ESTÁ LA CLAVE! Usamos 'paginatedData' para dibujar la tabla
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Input
            placeholder="Buscar por palabras clave (ej: bujia honda cg)..."
            value={search}
            onChange={handleSearchChange}
            className="max-w-sm border-amber-200 focus:border-amber-500"
          />
          {search && (
            <span className="text-xs text-gray-400">
              Encontrados: {filteredData.length}
            </span>
          )}
        </div>
        
        {/* Info de página */}
        <div className="text-xs text-gray-500">
          Página {currentPage} de {totalPages || 1}
        </div>
      </div>
      
      {/* Tabla */}
      <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="font-bold min-w-[120px]">MLA</TableHead>
              <TableHead className="font-bold min-w-[250px]">Nombre de Publicación</TableHead>
              <TableHead className="font-bold text-right">Precio Venta</TableHead>
              <TableHead className="font-bold text-right text-red-600">Cargo ($)</TableHead>
              <TableHead className="font-bold text-right text-orange-600">Cuotas ($)</TableHead>
              <TableHead className="font-bold text-right text-blue-600">Envío</TableHead>
              <TableHead className="font-bold text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* CORRECCIÓN PRINCIPAL: Usamos paginatedData.map, NO data.map */}
            {paginatedData.length > 0 ? (
              paginatedData.map((item) => (
                <TableRow key={item.item_id} className="hover:bg-amber-50/50 transition-colors">
                  <TableCell className="font-mono text-xs text-blue-600 font-medium">
                    {item.item_id}
                  </TableCell>
                  <TableCell className="text-xs font-medium max-w-md truncate">
                    {item.nombre}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    ${Number(item.precio_venta || 0).toLocaleString('es-AR')}
                  </TableCell>
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

      {/* Footer de Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Siguiente
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
