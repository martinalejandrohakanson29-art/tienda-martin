"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

// Definimos qué forma tiene un artículo para que el código no se pierda
interface Articulo {
  id: string
  nombre: string
  precio: number
  stock: number
}

export default function VentasMostradorClient({ articulosIniciales }: { articulosIniciales: Articulo[] }) {
  const [query, setQuery] = useState("")

  // Esta es la búsqueda en memoria. ¡Es casi instantánea!
  const resultadosFiltrados = useMemo(() => {
    if (query.trim().length < 2) return [];

    // Separamos lo que escribís en palabras (ej: "leva varillero")
    const palabras = query.toLowerCase().trim().split(/\s+/).filter(p => p.length > 0);

    return articulosIniciales.filter(articulo => {
      const nombreArt = articulo.nombre.toLowerCase();
      const idArt = articulo.id.toLowerCase();

      // Verificamos que TODAS las palabras estén en el nombre o en el ID
      return palabras.every(palabra => 
        nombreArt.includes(palabra) || idArt.includes(palabra)
      );
    }).slice(0, 15); // Mostramos solo los primeros 15 para que sea limpio
  }, [query, articulosIniciales]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Buscar por nombre o código (ej: leva varillero)..."
          className="pl-10 h-12 text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Lista de resultados */}
      <div className="grid gap-2">
        {resultadosFiltrados.length > 0 ? (
          resultadosFiltrados.map((art) => (
            <div 
              key={art.id} 
              className="p-4 border rounded-lg hover:bg-accent cursor-pointer flex justify-between items-center transition-colors"
              onClick={() => alert(`Seleccionaste: ${art.nombre}`)} // Aquí luego pondremos la lógica de agregar al carrito
            >
              <div>
                <p className="font-bold">{art.nombre}</p>
                <p className="text-sm text-muted-foreground uppercase">{art.id}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">${art.precio.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Stock: {art.stock}</p>
              </div>
            </div>
          ))
        ) : query.length >= 2 ? (
          <p className="text-center text-muted-foreground py-10">No se encontraron productos.</p>
        ) : (
          <p className="text-center text-muted-foreground py-10 italic">Empieza a escribir para buscar...</p>
        )}
      </div>
    </div>
  )
}
