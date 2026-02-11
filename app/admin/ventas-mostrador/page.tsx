"use client";

import React, { useState, useEffect } from "react";
import { 
  Plus, Search, User, Trash2, Package2, ShoppingCart, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
// Importamos la acción que creamos recién
import { buscarArticulosMostrador } from "@/app/actions/ventas-mostrador";

export default function VentasMostradorPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]); // Artículos en la venta actual
  
  // Estados para la búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Lógica de búsqueda en tiempo real
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length >= 2) {
        setIsSearching(true);
        const results = await buscarArticulosMostrador(searchTerm);
        setSearchResults(results);
        setIsSearching(false);
      } else {
        setSearchResults([]);
      }
    }, 300); // Espera 300ms después de que dejas de escribir para no saturar

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Función para agregar el producto a la venta
  const agregarProductoAVenta = (prod: any) => {
    // Si ya está en la lista, le sumamos 1 a la cantidad
    const existe = items.find(item => item.id === prod.id);
    if (existe) {
      setItems(items.map(item => 
        item.id === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * Number(item.precio_unit) } : item
      ));
    } else {
      // Si es nuevo, lo agregamos
      setItems([...items, {
        id: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        precio_unit: Number(prod.precio),
        subtotal: Number(prod.precio)
      }]);
    }
    setIsModalOpen(false); // Cerramos el modal
    setSearchTerm(""); // Limpiamos búsqueda
  };

  const totalVenta = items.reduce((acc, item) => acc + item.subtotal, 0);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/30">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Carga de Ventas</h1>
            <p className="text-xs text-slate-500 font-normal">Terminal de Ventas Mostrador</p>
          </div>
        </div>
        <div className="text-right border-l pl-4 border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Vendedor</p>
          <p className="text-sm font-medium">Martin Jakson</p>
        </div>
      </header>

      <main className="flex-grow p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* TOTAL Y CLIENTE */}
        <section className="bg-white rounded-xl border border-slate-100 p-6 flex flex-col md:flex-row gap-8 items-end shadow-sm">
          <div className="flex-grow space-y-2 max-w-md">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cliente / Razón Social</label>
            <div className="relative">
              <Input placeholder="Consumidor Final" className="pl-10 bg-slate-50/50" />
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="flex-shrink-0 ml-auto text-right">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Total a Cobrar</span>
            <span className="text-4xl font-light text-slate-900 tracking-tight">
              $ {totalVenta.toLocaleString('es-AR')}
            </span>
          </div>
        </section>

        {/* TABLA DE ARTÍCULOS SELECCIONADOS */}
        <section className="space-y-4">
          <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl">
            <Plus className="h-4 w-4" />
            <span>Añadir Artículo</span>
          </Button>

          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden min-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-[11px] font-bold uppercase tracking-widest">Artículo</TableHead>
                  <TableHead className="text-center text-[11px] font-bold uppercase tracking-widest">Cant.</TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-widest">Precio Unit.</TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-widest">Subtotal</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-20 text-center text-slate-400">No hay artículos cargados</TableCell></TableRow>
                ) : (
                  items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell className="text-center">{item.cantidad}</TableCell>
                      <TableCell className="text-right">$ {item.precio_unit.toLocaleString('es-AR')}</TableCell>
                      <TableCell className="text-right font-bold">$ {item.subtotal.toLocaleString('es-AR')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>

      {/* FOOTER ACCIONES */}
      <footer className="bg-white border-t border-slate-100 p-6 sticky bottom-0">
        <div className="max-w-7xl mx-auto flex justify-end gap-4">
          <Button variant="ghost" onClick={() => setItems([])}>Descartar Venta</Button>
          <Button disabled={items.length === 0} className="px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all">
            Finalizar Venta
          </Button>
        </div>
      </footer>

      {/* MODAL DE BÚSQUEDA */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="p-8 bg-white border-b">
            <DialogTitle className="text-xl font-semibold mb-4">Buscar Repuesto</DialogTitle>
            <div className="relative">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
              <Input 
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Escribe el nombre o ID del repuesto..." 
                className="pl-12 py-6 bg-slate-50 border-none rounded-2xl text-base"
              />
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-4 bg-white">
            {isSearching ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
            ) : searchResults.length > 0 ? (
              <div className="grid gap-2">
                {searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    onClick={() => agregarProductoAVenta(prod)}
                    className="flex items-center justify-between p-4 hover:bg-blue-50 rounded-2xl transition-colors text-left group"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 group-hover:text-blue-700">{prod.nombre}</p>
                      <p className="text-xs text-slate-400">ID: {prod.id} • Stock: {prod.stock}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">$ {Number(prod.precio).toLocaleString('es-AR')}</p>
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        Agregar +
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 italic">
                {searchTerm.length < 2 ? "Escribe para buscar..." : "No se encontraron resultados"}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
