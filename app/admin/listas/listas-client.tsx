"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { 
  Search, Database, ArrowLeft, Edit, Save, Loader2, PackageSearch,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actualizarArticuloDesdeLista } from "@/app/actions/listas";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

// Función auxiliar que quita los acentos (ej: "cigüeñal" -> "ciguenal", "árbol" -> "arbol")
const quitarAcentos = (texto: string) => {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export default function ListasClient({ 
  articulosIniciales 
}: { 
  articulosIniciales: Articulo[] 
}) {
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Estados para Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; 
  
  // Estados para el Modal de Edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editData, setEditData] = useState<Articulo | null>(null);

  // --- NUEVO BUSCADOR INTELIGENTE Y FLEXIBLE ---
  const articulosFiltrados = useMemo(() => {
    // Si no hay nada escrito, devolvemos toda la lista
    if (!searchTerm.trim()) return articulos;
    
    // 1. Limpiamos la búsqueda: minúsculas, sin acentos y quitamos espacios a los lados
    const busquedaLimpia = quitarAcentos(searchTerm.toLowerCase().trim());
    
    // 2. Dividimos la búsqueda en palabras sueltas. Ej: "leva 110" -> ["leva", "110"]
    const palabrasBuscadas = busquedaLimpia.split(/\s+/);
    
    return articulos.filter(art => {
      // Limpiamos también el nombre y el ID del artículo de la base de datos para compararlos justamente
      const nombreLimpio = quitarAcentos(art.nombre.toLowerCase());
      const idLimpio = quitarAcentos(art.id.toLowerCase());
      
      // 3. Verificamos que TODAS las palabras buscadas existan en el nombre o en el ID (sin importar el orden)
      // El método .every() se asegura de que todas las condiciones se cumplan
      return palabrasBuscadas.every(palabra => {
        return nombreLimpio.includes(palabra) || idLimpio.includes(palabra);
      });
    });
  }, [searchTerm, articulos]);

  // Si el usuario escribe algo, lo devolvemos a la página 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Lógica de Paginación
  const totalPages = Math.ceil(articulosFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedArticulos = articulosFiltrados.slice(startIndex, startIndex + itemsPerPage);

  // Funciones de Edición
  const abrirModalEdicion = (articulo: Articulo) => {
    setEditData({ ...articulo });
    setIsEditModalOpen(true);
  };

  const handleGuardarCambios = async () => {
    if (!editData) return;
    setIsSubmitting(true);

    const res = await actualizarArticuloDesdeLista(
      editData.id, 
      editData.nombre, 
      editData.precio, 
      editData.stock
    );

    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === editData.id ? editData : a));
      setIsEditModalOpen(false);
    } else {
      alert("Error: " + res.error);
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="h-full flex flex-col relative">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/erp" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md shadow-indigo-200">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none mb-1">Bases de Datos y Listas</h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Gestión centralizada de registros</p>
          </div>
        </div>
      </header>

      {/* SISTEMA DE PESTAÑAS (TABS) */}
      <Tabs defaultValue="mostrador" className="flex-grow flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-6 py-0 flex-shrink-0">
          <TabsList className="bg-transparent h-14 p-0 w-full flex justify-start gap-6 rounded-none">
            <TabsTrigger 
              value="mostrador" 
              className="gap-2 px-0 py-4 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none data-[state=active]:bg-transparent font-bold text-slate-500 hover:text-slate-700"
            >
              <PackageSearch className="h-4 w-4" /> Artículos Mostrador
            </TabsTrigger>
          </TabsList>
        </div>

        {/* CONTENIDO DE LA PESTAÑA: ARTÍCULOS MOSTRADOR */}
        <TabsContent value="mostrador" className="flex-grow flex flex-col overflow-hidden m-0">
          <main className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden">
            
            {/* Barra de Búsqueda */}
            <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
              <div className="relative w-full max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Ej: kit 170, etc..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
              <div className="ml-auto px-4 text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Registros</p>
                <p className="text-lg font-black text-slate-800">{articulosFiltrados.length}</p>
              </div>
            </div>

            {/* Tabla de Datos */}
            <div className="flex-grow bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-y-auto flex-grow">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-4">ID Artículo</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-4">Nombre / Descripción</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-4">Precio Base ($)</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-4">Stock Físico</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-4 w-24">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedArticulos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-20 text-center text-slate-400 italic">
                          No se encontraron artículos con esa búsqueda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedArticulos.map((art) => (
                        <TableRow key={art.id} className="hover:bg-indigo-50/30 transition-colors">
                          <TableCell className="text-xs font-mono text-slate-400 py-3">{art.id}</TableCell>
                          <TableCell className="font-bold text-slate-800 py-3">{art.nombre}</TableCell>
                          <TableCell className="text-right font-black text-slate-900 py-3">
                            $ {art.precio.toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <span className={`text-xs font-black px-3 py-1 rounded-lg border ${art.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : art.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                              {art.stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-right py-3">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => abrirModalEdicion(art)}
                              className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-lg h-8 px-2"
                            >
                              <Edit className="h-4 w-4 mr-1.5" /> Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* CONTROLES DE PAGINACIÓN */}
              {articulosFiltrados.length > 0 && (
                <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-between flex-shrink-0">
                  <div className="text-xs text-slate-500">
                    Mostrando <span className="font-bold text-slate-700">{startIndex + 1}</span> a <span className="font-bold text-slate-700">{Math.min(startIndex + itemsPerPage, articulosFiltrados.length)}</span> de <span className="font-bold text-slate-700">{articulosFiltrados.length}</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="h-8 border-slate-300 text-slate-600"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    
                    <span className="text-xs font-bold text-slate-600">
                      Página {currentPage} de {totalPages}
                    </span>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                      className="h-8 border-slate-300 text-slate-600"
                    >
                      Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </TabsContent>
      </Tabs>

      {/* MODAL DE EDICIÓN */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-2 border-indigo-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
              <Edit className="h-5 w-5 text-indigo-600" /> Editar Registro
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Modifica los valores del artículo. Los cambios afectarán al sistema de ventas inmediatamente.
            </DialogDescription>
          </DialogHeader>
          
          {editData && (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción</Label>
                <Input 
                  value={editData.nombre} 
                  onChange={(e) => setEditData({...editData, nombre: e.target.value})} 
                  className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Precio Base ($)</Label>
                  <Input 
                    type="number" 
                    value={editData.precio} 
                    onChange={(e) => setEditData({...editData, precio: Number(e.target.value)})} 
                    className="font-black text-lg bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Stock Físico</Label>
                  <Input 
                    type="number" 
                    value={editData.stock} 
                    onChange={(e) => setEditData({...editData, stock: Number(e.target.value)})} 
                    className="font-black text-lg bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
                 <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">ID Interno (No editable)</p>
                 <p className="text-xs font-mono text-slate-600">{editData.id}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            <Button 
              onClick={handleGuardarCambios} 
              disabled={isSubmitting} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
