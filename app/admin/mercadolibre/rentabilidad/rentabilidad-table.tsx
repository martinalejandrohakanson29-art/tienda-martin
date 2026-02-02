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
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useState, useMemo } from "react";

// Definimos la interfaz para tener autocompletado y evitar errores
interface ProductoRentabilidad {
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

export default function RentabilidadTable({ data }: { data: ProductoRentabilidad[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20; // Filas por página

  // Al escribir, actualizamos búsqueda y volvemos a la página 1
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  // 1. LÓGICA DE FILTRADO (Genera 'resultadosFiltrados')
  const resultadosFiltrados = useMemo(() => {
    const query = search.toLowerCase().trim();
    
    // Si no hay búsqueda, usamos toda la data original
    if (!query) return data;

    // Buscador multi-término (ej: "bujia honda")
    const terms = query.split(" ").filter(t => t.length > 0);

    return data.filter((item) => {
      const texto = `${item.nombre || ""} ${item.item_id || ""}`.toLowerCase();
      // El item debe tener TODAS las palabras buscadas
      return terms.every(term => texto.includes(term));
    });
  }, [data, search]);

  // 2. LÓGICA DE PAGINACIÓN (Genera 'filasVisibles')
  // Cortamos 'resultadosFiltrados' para mostrar solo la página actual
  const totalItems = resultadosFiltrados.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // ESTA es la variable que la tabla DEBE renderizar
  const filasVisibles = resultadosFiltrados.slice(startIndex, endIndex);

  return (
    <div className="space-y-4 bg-white p-4 rounded-lg border shadow-sm">
      {/* --- BARRA DE BUSQUEDA --- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por título o MLA..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-8 border-amber-200 focus:border-amber-500"
          />
          {search && (
            <button 
              onClick={() => handleSearch("")}
              className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        <div className="text-sm text-gray-500 font-medium">
          {search ? (
            <span>
              Encontrados: <span className="text-amber-700 font-bold">{totalItems}</span>
              <span className="text-gray-400 mx-1">/</span>
              {data.length}
            </span>
          ) : (
            <span>Total: {totalItems} publicaciones</span>
          )}
        </div>
      </div>
      
      {/* --- TABLA DE DATOS --- */}
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
            {/* CORRECCIÓN CRÍTICA: Iteramos sobre 'filasVisibles' (el slice), NUNCA sobre 'data' */}
            {filasVisibles.length > 0 ? (
              filasVisibles.map((item) => (
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
                  <div className="flex flex-col items-center justify-center text-gray-500 py-4">
                    <Search className="h-8 w-8 text-gray-300 mb-2" />
                    <p>No se encontraron resultados para "{search}"</p>
                    <Button variant="link" onClick={() => handleSearch("")} className="text-amber-600 mt-1">
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
        <div className="flex items-center justify-between py-2 px-2">
          <div className="text-xs text-gray-400">
            Página {page} de {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
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
