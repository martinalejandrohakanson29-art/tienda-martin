"use client";

import React, { useState, useMemo } from "react";
import { 
  Plus, Search, User, Trash2, ShoppingCart, Loader2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

export default function VentasMostradorClient({ articulosIniciales }: { articulosIniciales: Articulo[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]); // Artículos en la venta actual
  const [searchTerm, setSearchTerm] = useState("");

  // Búsqueda instantánea en memoria
  const searchResults = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];

    const palabras = searchTerm.toLowerCase().trim().split(/\s+/);

    return articulosIniciales.filter(art => {
      const nombreLower = art.nombre.toLowerCase();
      const idLower = art.id.toLowerCase();
      // Todas las palabras deben estar en el nombre o en el ID
      return palabras.every(p => nombreLower.includes(p) || idLower.includes(p));
    }).slice(0, 15); // Limitamos a 15 para mantener el modal limpio
  }, [searchTerm, articulosIniciales]);

  const agregarProductoAVenta = (prod: Articulo) => {
    const existe = items.find(item => item.id === prod.id);
    if (existe) {
      setItems(items.map(item => 
        item.id === prod.id 
          ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * Number(item.precio) } 
          : item
      ));
    } else {
      setItems([...items, {
        id: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        precio_unit: Number(prod.precio),
        subtotal: Number(prod.precio)
      }]);
    }
    setIsModalOpen(false);
    setSearchTerm("");
  };

  const eliminarItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
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
          <p className="text-sm font-medium"></p>
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
          <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl shadow-lg transition-all active:scale-95">
            <Plus className="h-4 w-4" />
            <span>Añadir Artículo</span>
          </Button>

          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
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
                  <TableRow>
                    <TableCell colSpan={5} className="py-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-300">
                        <Plus className="h-12 w-12 opacity-20" />
                        <p className="text-slate-400 italic">No hay artículos cargados en esta venta</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, idx) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium text-slate-700">
                        <div className="flex flex-col">
                          <span>{item.nombre}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">{item.id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{item.cantidad}</TableCell>
                      <TableCell className="text-right text-slate-500">$ {item.precio_unit.toLocaleString('es-AR')}</TableCell>
                      <TableCell className="text-right font-bold text-slate-900">$ {item.subtotal.toLocaleString('es-AR')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => eliminarItem(item.id)} className="hover:bg-red-50 group">
                          <Trash2 className="h-4 w-4 text-slate-300 group-hover:text-red-500 transition-colors" />
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
      <footer className="bg-white border-t border-slate-100 p-6 sticky bottom-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto flex justify-end gap-4">
          <Button variant="ghost" onClick={() => setItems([])} className="text-slate-500 hover:text-red-500">
            Descartar Venta
          </Button>
          <Button disabled={items.length === 0} className="px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md shadow-blue-200 transition-all disabled:opacity-50">
            Finalizar Venta
          </Button>
        </div>
      </footer>

      {/* MODAL DE BÚSQUEDA INSTANTÁNEA */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="p-8 bg-white border-b relative">
            <DialogTitle className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              Buscador Instantáneo
            </DialogTitle>
            <div className="relative">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
              <Input 
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Escribe el nombre o ID del repuesto..." 
                className="pl-12 py-7 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl text-lg transition-all outline-none"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[450px] overflow-y-auto p-4 bg-white">
            {searchResults.length > 0 ? (
              <div className="grid gap-2">
                {searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    onClick={() => agregarProductoAVenta(prod)}
                    className="flex items-center justify-between p-4 hover:bg-blue-50/50 rounded-2xl transition-all text-left group border border-transparent hover:border-blue-100"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-100 p-2 rounded-lg group-hover:bg-white transition-colors">
                        <Plus className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{prod.nombre}</p>
                        <p className="text-[11px] text-slate-400 font-mono uppercase">ID: {prod.id} • Stock: {prod.stock}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900 text-lg">$ {Number(prod.precio).toLocaleString('es-AR')}</p>
                      <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 inline-block font-bold">
                        AÑADIR
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center">
                <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="h-8 w-8 text-slate-200" />
                </div>
                <p className="text-slate-400 italic font-medium">
                  {searchTerm.length < 2 
                    ? "Empieza a escribir el nombre del repuesto..." 
                    : "No encontramos nada con ese nombre."}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
