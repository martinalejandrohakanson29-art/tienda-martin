"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search, ShoppingCart, Package, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface Articulo {
  id: string
  nombre: string
  precio: number
  stock: number
}

export default function VentasMostradorClient({ articulosIniciales }: { articulosIniciales: Articulo[] }) {
  const [query, setQuery] = useState("")

  const resultadosFiltrados = useMemo(() => {
    if (query.trim().length < 2) return [];
    const palabras = query.toLowerCase().trim().split(/\s+/).filter(p => p.length > 0);

    return articulosIniciales.filter(articulo => {
      const nombreArt = articulo.nombre.toLowerCase();
      const idArt = articulo.id.toLowerCase();
      return palabras.every(palabra => nombreArt.includes(palabra) || idArt.includes(palabra));
    }).slice(0, 10); 
  }, [query, articulosIniciales]);

  return (
    <div className="space-y-6">
      {/* Buscador Estilizado */}
      <Card className="border-2 border-primary/10 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Buscador de Artículos
          </CardTitle>
          <CardDescription>
            Busca por nombre o código. Los resultados son instantáneos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder="Ej: leva varillero, cubiertas, 110cc..."
              className="pl-11 h-14 text-lg shadow-inner bg-slate-50/50 focus:bg-white transition-all"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Resultados con estética de Tienda Martin */}
      <Card className="shadow-md overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Resultados ({resultadosFiltrados.length})
          </h3>
        </div>
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-[120px]">Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Stock</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultadosFiltrados.length > 0 ? (
              resultadosFiltrados.map((art) => (
                <TableRow key={art.id} className="hover:bg-blue-50/30 transition-colors group">
                  <TableCell className="font-mono text-xs text-muted-foreground uppercase">
                    {art.id}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {art.nombre}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={art.stock > 0 ? "outline" : "destructive"} className="font-bold">
                      {art.stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    ${art.precio.toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="group-hover:bg-primary group-hover:text-white transition-all">
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Agregar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {query.length < 2 ? (
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 opacity-20" />
                      <p>Escribe al menos 2 letras para buscar...</p>
                    </div>
                  ) : (
                    "No se encontraron productos que coincidan."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Resumen rápido (Estética de Dashboard) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50/50 border-green-100">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 font-medium">Artículos Cargados</p>
              <p className="text-2xl font-bold text-green-900">{articulosIniciales.length}</p>
            </div>
            <Package className="w-8 h-8 text-green-200" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
