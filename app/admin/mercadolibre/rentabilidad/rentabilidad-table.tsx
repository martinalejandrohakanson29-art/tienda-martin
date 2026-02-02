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
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState, useMemo } from "react";

// Definimos una interfaz simple para el item (opcional pero ayuda)
interface RentabilidadItem {
  item_id: string;
  nombre: string;
  precio_venta: number;
  cargo_venta_ars: number;
  cargo_venta_porc: number;
  cuotas_ars: number;
  cuotas_porc: number;
  envio: number;
  costo_fijo_ml: number;
  estado?: string;
}

export default function RentabilidadTable({ data }: { data: RentabilidadItem[] }) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15; // Ajustado a 15 para que se vea mejor en pantalla

  // Manejador del buscador
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1); // IMPORTANTE: Volver a la página 1 al buscar
  };

  // 1. FILTRADO: Se ejecuta automáticamente cuando cambia 'search' o 'data'
  const filteredData = useMemo(() => {
    const query = search.toLowerCase().trim();
    
    if (!query) return data;

    // Buscador "inteligente": busca cada palabra por separado
    const terms = query.split(" ").filter(t => t.length > 0);

    return data.filter((item) => {
      // Unimos los campos donde queremos buscar
      const textToSearch = `${item.nombre || ""} ${item.item_id || ""}`.toLowerCase();
      
      // Verificamos que el item contenga TODOS los términos de búsqueda
      return terms.every(term => textToSearch.includes(term));
    });
  }, [data, search]);

  // 2. PAGINACIÓN: Cortamos 'filteredData' (NO data) según la página actual
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  
  // Esta es la variable EXACTA que debemos recorrer en la tabla
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return (
    <div className="space-y-4 bg-white p-4 rounded-lg border shadow-sm">
      {/* --- ZONA DE BUSCADOR --- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Buscar por título o MLA..."
            value={search}
            onChange={handleSearchChange}
            className="pl-9 border-amber-200 focus:border-amber-500"
          />
        </div>
        
        <div className="text-sm text-gray-500 font-medium">
          {search ? (
            <span>Encontrados: <span className="text-amber-700 font-bold">{filteredData.length}</span></span>
          ) : (
            <span>Total: {data.length} publicaciones</span>
          )}
        </div>
      </div>
      
      {/* --- TABLA --- */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader className="bg-amber-50/50">
            <TableRow>
              <TableHead className="w-[120px] font-bold text-amber-900">MLA</TableHead>
              <TableHead className="font-bold text-amber-900">Producto</TableHead>
              <TableHead className="text-right font-bold text-amber-900">Precio</TableHead>
              <TableHead className="text-right font-bold text-red-600">Cargos</TableHead>
              <TableHead className="text-right font-bold text-blue-600">Envío</TableHead>
              <TableHead className="text-center font-bold text-amber-900">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length > 0 ? (
              paginatedData.map((item) => (
                <TableRow key={item.item_id} className="hover:bg-amber-50 transition-colors">
                  <TableCell className="font-mono text-xs font-medium text-gray-500">
                    {item.item_id}
                  </TableCell>
                  <TableCell className="font-medium text-sm text-gray-700 max-w-[300px] truncate" title={item.nombre}>
                    {item.nombre}
                  </TableCell>
                  <TableCell className="text-right font-bold text-gray-900">
                    ${item.precio_venta.toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-red-600 font-medium">
                        -${(item.cargo_venta_ars + item.cuotas_ars).toLocaleString('es-AR')}
                      </span>
                      {item.cargo_venta_porc > 0 && (
                        <span className="text-[10px] text-gray-400">({item.cargo_venta_porc}%)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-blue-600 text-sm font-medium">
                    {item.envio > 0 ? `-$${item.envio.toLocaleString('es-AR')}` : "Grátis/Cargo Comprador"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={item.estado === 'active' ? "bg-green-50 text-green-700 border-green-200" : ""}>
                      {item.estado === 'active' ? 'Activo' : 'Pausado'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <p>No se encontraron resultados para "{search}"</p>
                    <Button variant="link" onClick={() => setSearch("")} className="text-amber-600">
                      Limpiar filtros
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- PAGINACIÓN --- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2">
          <div className="text-xs text-gray-400">
            Página {currentPage} de {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8"
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
