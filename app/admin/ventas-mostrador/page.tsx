"use client";

import React, { useState } from "react";
import { 
  Plus, 
  Search, 
  User, 
  Trash2, 
  Package2, 
  CheckCircle2, 
  X,
  ShoppingCart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function VentasMostradorPage() {
  // Estado para controlar el modal de búsqueda (la segunda pantalla)
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Estado para los artículos de la venta actual (por ahora vacío)
  const [items, setItems] = useState([]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/30">
      {/* HEADER DE LA SECCIÓN */}
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

        <div className="flex items-center gap-4">
            <div className="text-right border-l pl-4 border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Vendedor</p>
                <p className="text-sm font-medium">Martin Jakson</p>
            </div>
        </div>
      </header>

      <main className="flex-grow p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* SECCIÓN DATOS DEL CLIENTE */}
        <section className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="bg-slate-50/50 px-6 py-2.5 border-b border-slate-100">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Datos del Comprobante</h2>
          </div>
          <div className="p-6 flex flex-col md:flex-row gap-8 items-end">
            <div className="flex-grow space-y-2 max-w-md">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cliente / Razón Social</label>
              <div className="relative">
                <Input 
                  placeholder="Consumidor Final" 
                  className="pl-10 bg-slate-50/50 border-slate-200 focus:bg-white transition-all"
                />
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>
            
            <div className="flex-shrink-0 ml-auto text-right">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Total a Cobrar</span>
              <span className="text-4xl font-light text-slate-900 tracking-tight">$ 0,00</span>
            </div>
          </div>
        </section>

        {/* TABLA DE ARTÍCULOS */}
        <section className="space-y-4">
          <div className="flex items-center">
            <Button 
              onClick={() => setIsModalOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl shadow-md transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Añadir Artículo</span>
            </Button>
          </div>

          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Artículo</TableHead>
                  <TableHead className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cantidad</TableHead>
                  <TableHead className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Precio Unit.</TableHead>
                  <TableHead className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-32 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                          <Package2 className="h-8 w-8 text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-light">No hay artículos cargados en la venta</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  // Aquí irán los items mapeados en el Paso 2
                  null
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>

      {/* FOOTER DE ACCIONES ACCIONABLE */}
      <footer className="bg-white border-t border-slate-100 p-6 sticky bottom-0">
        <div className="max-w-7xl mx-auto flex justify-end gap-4">
          <Button variant="ghost" className="text-slate-500 hover:text-red-600 transition-colors">
            Descartar Venta
          </Button>
          <Button disabled className="px-10 bg-slate-100 text-slate-400 cursor-not-allowed rounded-xl font-semibold">
            Finalizar Venta
          </Button>
        </div>
      </footer>

      {/* --- SEGUNDA PANTALLA: MODAL DE BÚSQUEDA --- */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 gap-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <DialogHeader className="p-8 border-b border-slate-50 bg-white">
            <div className="flex items-center justify-between mb-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">Seleccionar Producto</DialogTitle>
            </div>
            <div className="relative group">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <Input 
                autoFocus
                placeholder="Buscar por nombre, código o SKU..." 
                className="pl-12 py-6 bg-slate-50 border-none rounded-2xl text-base focus:ring-2 focus:ring-blue-500/10 transition-all"
              />
            </div>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto p-4 bg-white">
            {/* El listado real de productos lo conectaremos en el Paso 3 */}
            <div className="flex flex-col items-center justify-center py-20 gap-3">
               <div className="p-3 bg-blue-50 rounded-full">
                  <Search className="h-6 w-6 text-blue-400" />
               </div>
               <p className="text-sm text-slate-400 font-medium italic">Escribe para empezar a buscar repuestos...</p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center px-8">
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <kbd className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-500 shadow-sm">ESC</kbd>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Cerrar</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Tienda Martin v1.0</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
