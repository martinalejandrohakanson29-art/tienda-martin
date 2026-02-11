"use client";

import React, { useState, useMemo } from "react";
import { 
  Plus, Search, User, Trash2, ShoppingCart, X, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { crearVentaMostrador } from "@/app/actions/ventas-mostrador";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

interface ItemVenta {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
}

export default function VentasMostradorClient({ 
  articulosIniciales,
  vendedorNombre 
}: { 
  articulosIniciales: Articulo[],
  vendedorNombre: string 
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<ItemVenta[]>([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [cliente, setCliente] = useState("Consumidor Final");

  const searchResults = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    const palabras = searchTerm.toLowerCase().trim().split(/\s+/);
    return articulosIniciales.filter(art => {
      const nombreLower = art.nombre.toLowerCase();
      const idLower = art.id.toLowerCase();
      return palabras.every(p => nombreLower.includes(p) || idLower.includes(p));
    }).slice(0, 15);
  }, [searchTerm, articulosIniciales]);

  const agregarProductoAVenta = (prod: Articulo) => {
    const existe = items.find(item => item.id === prod.id);
    if (existe) {
      setItems(items.map(item => 
        item.id === prod.id 
          ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unit } 
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

  const actualizarPrecioItem = (id: string, nuevoPrecio: number) => {
    setItems(items.map(item => 
      item.id === id 
        ? { ...item, precio_unit: nuevoPrecio, subtotal: item.cantidad * nuevoPrecio } 
        : item
    ));
  };

  // Nueva función para actualizar cantidad con teclado
  const actualizarCantidadItem = (id: string, nuevaCantidad: number) => {
    setItems(items.map(item => 
      item.id === id 
        ? { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.precio_unit } 
        : item
    ));
  };

  const eliminarItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const totalVenta = items.reduce((acc, item) => acc + item.subtotal, 0);

  const handleFinalizarVenta = async () => {
    try {
      setIsSubmitting(true);
      const resultado = await crearVentaMostrador({
        cliente,
        vendedor: vendedorNombre,
        total: totalVenta,
        items: items
      });

      if (resultado.success) {
        alert("¡Venta realizada con éxito!");
        setItems([]);
        setCliente("Consumidor Final");
      } else {
        alert("Error al guardar la venta: " + resultado.error);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Estilo común para inputs numéricos sin flechas
  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all font-bold text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden">
      {/* HEADER FIJO */}
      <header className="bg-white border-b border-slate-100 px-8 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Venta Mostrador</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Revolución Motos</p>
          </div>
        </div>
        <div className="text-right border-l pl-4 border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Vendedor</p>
          <p className="text-sm font-semibold text-blue-600">{vendedorNombre}</p>
        </div>
      </header>

      {/* CUERPO PRINCIPAL */}
      <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full gap-4 overflow-hidden">
        
        {/* TOTAL Y CLIENTE */}
        <section className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col md:flex-row gap-6 items-end shadow-sm flex-shrink-0">
          <div className="flex-grow space-y-1.5 max-w-md">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente / Razón Social</label>
            <div className="relative">
              <Input 
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Consumidor Final" 
                className="pl-9 h-10 bg-slate-50/50 border-slate-200" 
              />
              <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="flex-shrink-0 ml-auto text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total a Cobrar</span>
            <span className="text-3xl font-black text-slate-900 tracking-tighter">
              $ {totalVenta.toLocaleString('es-AR')}
            </span>
          </div>
        </section>

        {/* CONTENEDOR DE TABLA CON SCROLL INTERNO */}
        <section className="flex-grow flex flex-col min-h-0 gap-4">
          <div className="flex-shrink-0">
            <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl shadow-md transition-all active:scale-95">
              <Plus className="h-4 w-4" />
              <span>Añadir Artículo</span>
            </Button>
          </div>

          <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-grow">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest py-3">Artículo</TableHead>
                    <TableHead className="text-center text-[10px] font-bold uppercase tracking-widest py-3">Cant.</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest py-3">Precio Unit.</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-300">
                          <Plus className="h-10 w-10 opacity-20" />
                          <p className="text-sm text-slate-400 italic font-medium">No hay artículos cargados</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium text-slate-700 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm">{item.nombre}</span>
                            <span className="text-[9px] text-slate-400 uppercase font-mono">{item.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-3">
                          <div className="flex justify-center">
                            <Input 
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => actualizarCantidadItem(item.id, Number(e.target.value))}
                              className={`w-16 text-center h-8 ${inputSinFlechas}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <div className="flex items-center justify-end gap-2">
                             <span className="text-slate-400 text-xs font-bold">$</span>
                             <Input 
                              type="number"
                              value={item.precio_unit}
                              onChange={(e) => actualizarPrecioItem(item.id, Number(e.target.value))}
                              className={`w-28 h-8 ${inputSinFlechas}`}
                             />
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Button variant="ghost" size="icon" onClick={() => eliminarItem(item.id)} className="h-8 w-8 hover:bg-red-50 group">
                            <Trash2 className="h-4 w-4 text-slate-300 group-hover:text-red-500 transition-colors" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER ACCIONES FIJO */}
      <footer className="bg-white border-t border-slate-100 p-4 flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto flex justify-end gap-4">
          <Button variant="ghost" onClick={() => setItems([])} disabled={isSubmitting} className="text-slate-500 hover:text-red-500 h-10">
            Descartar Venta
          </Button>
          <Button 
            onClick={handleFinalizarVenta}
            disabled={items.length === 0 || isSubmitting} 
            className="px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-200 h-10 transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : "Finalizar Venta"}
          </Button>
        </div>
      </footer>

      {/* MODAL DE BÚSQUEDA */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="p-6 bg-white border-b relative">
            <DialogTitle className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-600" />
              Buscador Instantáneo
            </DialogTitle>
            <div className="relative">
              <Search className="absolute left-4 top-3 h-5 w-5 text-slate-400" />
              <Input 
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Escribe el nombre o ID del repuesto..." 
                className="pl-12 py-6 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-xl text-base transition-all outline-none"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          <div className="h-[500px] overflow-y-auto p-4 bg-white">
            {searchResults.length > 0 ? (
              <div className="grid gap-2">
                {searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    onClick={() => agregarProductoAVenta(prod)}
                    className="flex items-center justify-between p-3.5 hover:bg-blue-50/50 rounded-xl transition-all text-left group border border-transparent hover:border-blue-100"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-100 p-2 rounded-lg group-hover:bg-white transition-colors">
                        <Plus className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-[13px] group-hover:text-blue-700 transition-colors leading-tight">{prod.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-mono uppercase mt-0.5">ID: {prod.id} • Stock: {prod.stock}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900 text-sm">$ {Number(prod.precio).toLocaleString('es-AR')}</p>
                      <span className="text-[9px] bg-blue-600 text-white px-2.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-all font-bold">
                        AÑADIR
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <Search className="h-10 w-10 text-slate-100 mb-2" />
                <p className="text-slate-400 text-xs italic">
                  {searchTerm.length < 2 
                    ? "Empieza a escribir el nombre del repuesto..." 
                    : "No se encontraron resultados."}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
