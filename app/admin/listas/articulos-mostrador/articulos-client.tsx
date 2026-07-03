"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, ArrowLeft, Edit, Save, Loader2, Database, Plus, EyeOff, Eye, History, User } from "lucide-react";
import Link from "next/link";
import { actualizarArticuloDesdeLista, crearArticuloMostrador, toggleOcultarArticulo, obtenerHistorialArticulo } from "@/app/actions/listas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  costo?: number;
  margenGanancia?: number;
  oculto?: boolean;
}

export default function ArticulosClient({ 
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
  
  // Estados para edición inline del Costo en la tabla
  const [editandoCostoId, setEditandoCostoId] = useState<string | null>(null);
  const [costoTemp, setCostoTemp] = useState<string>("");
  const [guardandoCostoId, setGuardandoCostoId] = useState<string | null>(null);
  const cancelarSaveRef = useRef(false);

  // Estado para ocultar/mostrar artículos
  const [togglingOcultoId, setTogglingOcultoId] = useState<string | null>(null);
  const [soloOcultos, setSoloOcultos] = useState(false);

  // Estados para el Modal de Historial
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<{ id: string; usuario: string; accion: string; detalle: string | null; createdAt: Date }[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Estados para el Modal de Creación
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newData, setNewData] = useState<Articulo>({
    id: "",
    nombre: "",
    precio: 0,
    stock: 0,
    costo: 0,
    margenGanancia: 0
  });

  // --- NUEVO BUSCADOR INTELIGENTE Y FLEXIBLE ---
  const articulosFiltrados = useMemo(() => {
    const quitarAcentos = (texto: string) =>
      texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let lista = soloOcultos ? articulos.filter(art => art.oculto) : articulos;

    if (!searchTerm.trim()) return lista;

    const busquedaLimpia = quitarAcentos(searchTerm.toLowerCase().trim());
    const palabrasBuscadas = busquedaLimpia.split(/\s+/);

    return lista.filter(art => {
      const nombreLimpio = quitarAcentos(art.nombre.toLowerCase());
      const idLimpio = quitarAcentos(art.id.toLowerCase());
      return palabrasBuscadas.every(p => nombreLimpio.includes(p) || idLimpio.includes(p));
    });
  }, [searchTerm, articulos, soloOcultos]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, soloOcultos]);

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
      editData.stock,
      editData.costo,
      editData.margenGanancia
    );
    
    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === editData.id ? editData : a));
      setIsEditModalOpen(false);
    } else {
      alert("Error: " + res.error);
    }
    
    setIsSubmitting(false);
  };

  const handleCrearArticulo = async () => {
    if (!newData.id || !newData.nombre) {
      alert("ID y Nombre son obligatorios");
      return;
    }
    setIsSubmitting(true);

    const res = await crearArticuloMostrador(newData);
    
    if (res.success) {
      setArticulos(prev => [...prev, newData]);
      setIsCreateModalOpen(false);
      setNewData({ id: "", nombre: "", precio: 0, stock: 0, costo: 0, margenGanancia: 0 });
    } else {
      alert("Error: " + res.error);
    }
    
    setIsSubmitting(false);
  };

  // --- Edición inline del Costo desde la tabla ---
  const iniciarEdicionCosto = (art: Articulo) => {
    setEditandoCostoId(art.id);
    setCostoTemp(art.costo && art.costo > 0 ? String(art.costo) : "");
  };

  const cancelarEdicionCosto = () => {
    setEditandoCostoId(null);
    setCostoTemp("");
  };

  const guardarCosto = async (art: Articulo) => {
    const nuevoCosto = Number(costoTemp);
    // Sin cambios o valor inválido: cancelar sin tocar el servidor
    if (costoTemp.trim() === "" || isNaN(nuevoCosto) || nuevoCosto < 0 || nuevoCosto === (art.costo ?? 0)) {
      cancelarEdicionCosto();
      return;
    }
    setEditandoCostoId(null);
    setGuardandoCostoId(art.id);

    // Reutilizamos la acción existente; el precio de venta NO se recalcula al editar el costo inline.
    const res = await actualizarArticuloDesdeLista(
      art.id, art.nombre, art.precio, art.stock, nuevoCosto, art.margenGanancia
    );

    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === art.id ? { ...a, costo: nuevoCosto } : a));
    } else {
      alert("Error: " + res.error);
    }
    setGuardandoCostoId(null);
    setCostoTemp("");
  };

  const abrirHistorial = async (art: Articulo) => {
    setIsHistorialModalOpen(true);
    setCargandoHistorial(true);
    const res = await obtenerHistorialArticulo(art.id);
    setHistorialActual(res.success ? (res.data ?? []) : []);
    setCargandoHistorial(false);
  };

  const handleToggleOcultar = async (art: Articulo) => {
    setTogglingOcultoId(art.id);
    const nuevoEstado = !art.oculto;
    const res = await toggleOcultarArticulo(art.id, nuevoEstado);
    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === art.id ? { ...a, oculto: nuevoEstado } : a));
    } else {
      alert("Error: " + res.error);
    }
    setTogglingOcultoId(null);
  };

  // Marcación real sobre el costo: (precio - costo) / costo * 100
  const calcularMarcacion = (costo?: number, precio?: number): number | null => {
    if (!costo || costo <= 0 || precio == null) return null;
    return ((precio - costo) / costo) * 100;
  };

  const calcularPrecio = (costo: number, margen: number) => {
    return Number((costo * (1 + margen / 100)).toFixed(2));
  };

  const handleCostoChange = (val: number, isEdit: boolean) => {
    if (isEdit && editData) {
      const nuevoPrecio = calcularPrecio(val, editData.margenGanancia || 0);
      setEditData({ ...editData, costo: val, precio: nuevoPrecio });
    } else if (!isEdit) {
      const nuevoPrecio = calcularPrecio(val, newData.margenGanancia || 0);
      setNewData({ ...newData, costo: val, precio: nuevoPrecio });
    }
  };

  const handleMargenChange = (val: number, isEdit: boolean) => {
    if (isEdit && editData) {
      const nuevoPrecio = calcularPrecio(editData.costo || 0, val);
      setEditData({ ...editData, margenGanancia: val, precio: nuevoPrecio });
    } else if (!isEdit) {
      const nuevoPrecio = calcularPrecio(newData.costo || 0, val);
      setNewData({ ...newData, margenGanancia: val, precio: nuevoPrecio });
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/listas" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md shadow-indigo-200">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none mb-1">Artículos Mostrador</h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Gestión de productos de venta</p>
          </div>
        </div>
        <Button 
          onClick={() => {
            const nuevoId = "ART-" + Math.random().toString(36).substring(2, 9).toUpperCase();
            setNewData({ ...newData, id: nuevoId });
            setIsCreateModalOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md gap-2"
        >
          <Plus className="h-5 w-5" />
          Crear nuevo artículo
        </Button>
      </header>

      {/* Contenido principal */}
      <main className="flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden">
        
        {/* Barra de Búsqueda */}
        <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-3">
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
          <button
            onClick={() => setSoloOcultos(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all flex-shrink-0 ${soloOcultos ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Solo ocultos
          </button>
          <div className="ml-auto px-4 text-right flex-shrink-0">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Total Registros</p>
            <p className="text-lg font-black text-slate-800">{articulosFiltrados.length}</p>
          </div>
        </div>

        {/* Tabla de Datos */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-sm">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase py-4">ID Artículo</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Nombre / Descripción</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4">Costo ($)</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4">Precio Base ($)</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4">Marcación</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4">Stock Físico</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4 w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedArticulos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-20 text-center text-slate-400 italic">
                      No se encontraron artículos con esa búsqueda.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedArticulos.map((art) => (
                    <TableRow key={art.id} className={`hover:bg-indigo-50/30 transition-colors ${art.oculto ? 'bg-slate-50/60' : ''}`}>
                      <TableCell className={`text-xs font-mono py-3 ${art.oculto ? 'text-slate-300' : 'text-slate-400'}`}>{art.id}</TableCell>
                      <TableCell className={`font-bold py-3 ${art.oculto ? 'text-slate-400' : 'text-slate-800'}`}>
                        <div className="flex items-center gap-2">
                          {art.nombre}
                          {art.oculto && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 border border-slate-300">
                              <EyeOff className="h-2.5 w-2.5" /> Oculto
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        {editandoCostoId === art.id ? (
                          <Input
                            autoFocus
                            type="number"
                            value={costoTemp}
                            onChange={(e) => setCostoTemp(e.target.value)}
                            onBlur={() => {
                              if (cancelarSaveRef.current) {
                                cancelarSaveRef.current = false;
                                cancelarEdicionCosto();
                              } else {
                                guardarCosto(art);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              } else if (e.key === "Escape") {
                                cancelarSaveRef.current = true;
                                e.currentTarget.blur();
                              }
                            }}
                            className="h-8 w-28 ml-auto text-right font-bold bg-white border-indigo-300 focus-visible:ring-indigo-500"
                          />
                        ) : guardandoCostoId === art.id ? (
                          <div className="flex justify-end">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => iniciarEdicionCosto(art)}
                            title="Clic para editar el costo"
                            className="ml-auto block text-right rounded-lg px-2 py-1 hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-all"
                          >
                            {art.costo && art.costo > 0 ? (
                              <span className="font-bold text-slate-700">$ {art.costo.toLocaleString('es-AR')}</span>
                            ) : (
                              <span className="text-red-500 font-black" title="Sin costo cargado">✗</span>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900 py-3">
                        $ {art.precio.toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {(() => {
                          const marc = calcularMarcacion(art.costo, art.precio);
                          if (marc === null) return <span className="text-slate-300">—</span>;
                          return (
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${marc < 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {marc.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <span className={`text-xs font-black px-3 py-1 rounded-lg border ${art.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : art.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                          {art.stock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirModalEdicion(art)}
                            className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-lg h-8 px-2"
                          >
                            <Edit className="h-4 w-4 mr-1.5" /> Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleOcultar(art)}
                            disabled={togglingOcultoId === art.id}
                            title={art.oculto ? "Mostrar en ventas" : "Ocultar de ventas"}
                            className={`rounded-lg h-8 px-2 ${art.oculto ? 'text-orange-500 hover:text-orange-700 hover:bg-orange-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                          >
                            {togglingOcultoId === art.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : art.oculto
                                ? <><Eye className="h-4 w-4 mr-1" />Mostrar</>
                                : <><EyeOff className="h-4 w-4 mr-1" />Ocultar</>
                            }
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirHistorial(art)}
                            title="Ver historial de cambios"
                            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg h-8 px-2"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
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
                  <ArrowLeft className="h-4 w-4 mr-1" /> Anterior
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
                  Siguiente <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

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
                  <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
                  <Input 
                    type="number" 
                    value={editData.costo} 
                    onChange={(e) => handleCostoChange(Number(e.target.value), true)} 
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
                  <Input 
                    type="number" 
                    value={editData.margenGanancia} 
                    onChange={(e) => handleMargenChange(Number(e.target.value), true)} 
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Precio Final ($)</Label>
                  <Input 
                    type="number" 
                    value={editData.precio} 
                    onChange={(e) => setEditData({...editData, precio: Number(e.target.value)})} 
                    className="font-black text-lg bg-indigo-50 border-indigo-200 text-indigo-700 focus-visible:ring-indigo-500"
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
      {/* MODAL DE CREACIÓN */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-2 border-indigo-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
              <Plus className="h-5 w-5 text-indigo-600" /> Nuevo Artículo
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Ingresa los datos del nuevo artículo para el mostrador.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">ID Artículo (SKU)</Label>
                <Input 
                  value={newData.id} 
                  readOnly
                  className="font-mono bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Stock Inicial</Label>
                <Input 
                  type="number" 
                  value={newData.stock} 
                  onChange={(e) => setNewData({...newData, stock: Number(e.target.value)})} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción</Label>
              <Input 
                value={newData.nombre} 
                onChange={(e) => setNewData({...newData, nombre: e.target.value})} 
                className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
                <Input 
                  type="number" 
                  value={newData.costo} 
                  onChange={(e) => handleCostoChange(Number(e.target.value), false)} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
                <Input 
                  type="number" 
                  value={newData.margenGanancia} 
                  onChange={(e) => handleMargenChange(Number(e.target.value), false)} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
              <Label className="text-xs font-bold text-indigo-600 uppercase mb-2 block">Precio Final de Venta</Label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-indigo-900">$</span>
                <Input 
                  type="number" 
                  value={newData.precio} 
                  onChange={(e) => setNewData({...newData, precio: Number(e.target.value)})} 
                  className="font-black text-2xl bg-white border-indigo-200 text-indigo-700 focus-visible:ring-indigo-500 h-12"
                />
              </div>
              <p className="text-[10px] text-indigo-400 mt-2 font-medium italic">* Puedes ajustar el precio manualmente si lo deseas.</p>
            </div>
          </div>

          <DialogFooter className="gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            <Button 
              onClick={handleCrearArticulo} 
              disabled={isSubmitting} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Crear Artículo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* MODAL DE HISTORIAL */}
      <Dialog open={isHistorialModalOpen} onOpenChange={setIsHistorialModalOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <History className="h-5 w-5 text-slate-500" /> Historial de Cambios
            </DialogTitle>
            <DialogDescription>Aquí verás todas las modificaciones realizadas sobre este artículo.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[500px] overflow-y-auto">
            {cargandoHistorial ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : historialActual.length === 0 ? (
              <div className="text-center text-slate-400 italic py-10">No hay modificaciones registradas para este artículo.</div>
            ) : (
              historialActual.map((auditoria) => (
                <div key={auditoria.id} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-4 items-start">
                  <div className="bg-white p-2 border border-slate-200 rounded-lg"><User className="h-4 w-4 text-slate-400" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{auditoria.usuario}</p>
                    <p className="text-xs text-slate-500 mb-2">{new Date(auditoria.createdAt).toLocaleString('es-AR')}</p>
                    <div className="text-xs text-slate-700 bg-white p-2 rounded border border-slate-100">
                      <span className="font-bold text-amber-600 block mb-1">{auditoria.accion}</span>
                      {auditoria.detalle}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter><Button onClick={() => setIsHistorialModalOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}