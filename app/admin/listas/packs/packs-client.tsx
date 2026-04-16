"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Trash2, PackageSearch, Save, Edit, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { obtenerPacks, crearPackMostrador, eliminarPack, actualizarPack, obtenerArticulosParaListas } from "@/app/actions/listas";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

interface PackItem {
  id: string;
  componenteId: string;
  componente: {
    id: string;
    nombre: string;
    precio: number;
    stock: number;
  };
  cantidad: number;
}

interface Pack {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  esPack: boolean;
  packItems: PackItem[];
}

export default function PacksClient() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packSearchTerm, setPackSearchTerm] = useState("");
  const [isCrearPackModalOpen, setIsCrearPackModalOpen] = useState(false);
  const [isEditarPackModalOpen, setIsEditarPackModalOpen] = useState(false);
  const [packParaEditar, setPackParaEditar] = useState<Pack | null>(null);
  const [packNombre, setPackNombre] = useState("");
  const [packPrecio, setPackPrecio] = useState("");
  const [packComponentes, setPackComponentes] = useState<{id: string, nombre: string, cantidad: number, stock: number}[]>([]);
  const [packSearchResults, setPackSearchResults] = useState<Articulo[]>([]);
  const [isSubmittingPack, setIsSubmittingPack] = useState(false);
  const [articulos, setArticulos] = useState<Articulo[]>([]);

  // Cargar artículos para búsqueda de componentes
  useEffect(() => {
    const cargarArticulos = async () => {
      const res = await obtenerArticulosParaListas();
      if (res.success && res.data) {
        setArticulos(res.data);
      }
    };
    cargarArticulos();
  }, []);

  // Cargar packs al montar el componente
  useEffect(() => {
    const cargarPacks = async () => {
      const res = await obtenerPacks();
      if (res.success && res.data) {
        setPacks(res.data);
      }
    };
    cargarPacks();
  }, []);

  // Efecto para buscar componentes (artículos del mostrador)
  useEffect(() => {
    if (packSearchTerm.trim().length < 2) {
      setPackSearchResults([]);
      return;
    }
    const queryWords = packSearchTerm.toLowerCase().trim().split(/\s+/);
    const resultados = articulos.filter(articulo => {
      const nombreLower = articulo.nombre.toLowerCase();
      const idLower = articulo.id.toLowerCase();
      return queryWords.every(word => {
        if (/^\d+$/.test(word)) {
          const regexNumerico = new RegExp(`(?:^|[^0-9])${word}(?:[^0-9]|$)`);
          return regexNumerico.test(nombreLower) || regexNumerico.test(idLower);
        }
        return nombreLower.includes(word) || idLower.includes(word);
      });
    }).slice(0, 15);
    setPackSearchResults(resultados);
  }, [packSearchTerm, articulos]);

  // Funciones de gestión de packs
  const resetPackForm = () => {
    setPackNombre("");
    setPackPrecio("");
    setPackComponentes([]);
    setPackSearchTerm("");
  };

  const agregarComponenteAPack = (articulo: Articulo) => {
    const existe = packComponentes.find(c => c.id === articulo.id);
    if(existe) setPackComponentes(prev => prev.map(c => c.id === articulo.id ? {...c, cantidad: c.cantidad + 1} : c));
    else setPackComponentes(prev => [...prev, {id: articulo.id, nombre: articulo.nombre, cantidad: 1, stock: articulo.stock}]);
    setPackSearchTerm("");
  };

  const eliminarComponenteDePack = (id: string) => {
    setPackComponentes(prev => prev.filter(c => c.id !== id));
  };

  const handleCrearPack = async () => {
    if (!packNombre.trim() || !packPrecio || packComponentes.length < 2) {
      alert("Debes indicar nombre, precio y al menos 2 componentes.");
      return;
    }
    setIsSubmittingPack(true);
    const id = `PACK-${Date.now()}`;
    const res = await crearPackMostrador({
      id,
      nombre: packNombre,
      precio: Number(packPrecio),
      componentes: packComponentes.map(c => ({ id: c.id, nombre: c.nombre, cantidad: c.cantidad }))
    });
    if (res.success) {
      alert("¡Pack creado exitosamente!");
      setIsCrearPackModalOpen(false);
      resetPackForm();
      const resPacks = await obtenerPacks();
      if (resPacks.success && resPacks.data) {
        setPacks(resPacks.data);
      }
    } else {
      alert("Error al crear el pack: " + res.error);
    }
    setIsSubmittingPack(false);
  };

  const handleEditarPack = async () => {
    if (!packParaEditar || !packNombre.trim() || !packPrecio || packComponentes.length < 2) {
      alert("Debes indicar nombre, precio y al menos 2 componentes.");
      return;
    }
    setIsSubmittingPack(true);
    const res = await actualizarPack(packParaEditar.id, packNombre, Number(packPrecio), packComponentes.map(c => ({ id: c.id, nombre: c.nombre, cantidad: c.cantidad })));
    if (res.success) {
      alert("¡Pack actualizado exitosamente!");
      setIsEditarPackModalOpen(false);
      resetPackForm();
      const resPacks = await obtenerPacks();
      if (resPacks.success && resPacks.data) {
        setPacks(resPacks.data);
      }
    } else {
      alert("Error al actualizar el pack: " + res.error);
    }
    setIsSubmittingPack(false);
  };

  const eliminarPackConfirmado = async (id: string) => {
    const res = await eliminarPack(id);
    if (res.success) {
      alert("¡Pack eliminado exitosamente!");
      const resPacks = await obtenerPacks();
      if (resPacks.success && resPacks.data) {
        setPacks(resPacks.data);
      }
    } else {
      alert("Error al eliminar el pack: " + res.error);
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
          <div className="bg-purple-600 p-2.5 rounded-xl text-white shadow-md shadow-purple-200">
            <PackageSearch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none mb-1">Gestión de Packs</h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Creación y administración de combinaciones</p>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4">
        
        {/* Barra de Búsqueda de Packs */}
        <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar packs por nombre o ID..." 
              value={packSearchTerm}
              onChange={(e) => setPackSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
            />
          </div>
          <div className="ml-auto px-4 text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Total Packs</p>
            <p className="text-lg font-black text-slate-800">{packs.length}</p>
          </div>
        </div>

        {/* Botón para crear nuevo pack */}
        <div className="flex justify-end mb-2">
          <Button 
            onClick={() => setIsCrearPackModalOpen(true)} 
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl font-bold shadow-md shadow-purple-200 flex items-center gap-2"
          >
            <PackageSearch className="h-4 w-4" /> Crear Nuevo Pack
          </Button>
        </div>
        
        {/* Tabla de Packs */}
        <div className="flex-grow bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-grow">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-sm">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase py-4">ID Pack</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Nombre del Pack</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4">Precio Final ($)</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4">Componentes</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4 w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-20 text-center text-slate-400 italic">
                      No se encontraron packs.
                    </TableCell>
                  </TableRow>
                ) : (
                  packs.map((pack) => (
                    <TableRow key={pack.id} className="hover:bg-purple-50/30 transition-colors">
                      <TableCell className="text-xs font-mono text-slate-400 py-3">{pack.id}</TableCell>
                      <TableCell className="font-bold text-slate-800 py-3">
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-1 rounded border border-purple-200 mr-2 uppercase">Pack</span>
                        {pack.nombre}
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900 py-3">
                        $ {pack.precio.toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                          {pack.packItems?.length || 0} componentes
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setPackParaEditar(pack);
                              setPackNombre(pack.nombre);
                              setPackPrecio(pack.precio.toString());
                              setPackComponentes(pack.packItems?.map(pi => ({
                                id: pi.componente.id,
                                nombre: pi.componente.nombre,
                                cantidad: pi.cantidad,
                                stock: pi.componente.stock
                              })) || []);
                              setIsEditarPackModalOpen(true);
                            }}
                            className="text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-lg h-8 px-2"
                          >
                            <Edit className="h-4 w-4 mr-1.5" /> Editar
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setPackParaEditar(pack);
                              setPackNombre(pack.nombre);
                              setPackPrecio(pack.precio.toString());
                              setPackComponentes(pack.packItems?.map(pi => ({
                                id: pi.componente.id,
                                nombre: pi.componente.nombre,
                                cantidad: pi.cantidad,
                                stock: pi.componente.stock
                              })) || []);
                              setIsCrearPackModalOpen(true);
                            }}
                            className="text-green-600 hover:text-green-800 hover:bg-green-100 rounded-lg h-8 px-2"
                          >
                            <Save className="h-4 w-4 mr-1.5" /> Duplicar
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setPackParaEditar(pack);
                              setIsCrearPackModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg h-8 px-2"
                          >
                            <PackageSearch className="h-4 w-4 mr-1.5" /> Ver
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => eliminarPackConfirmado(pack.id)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-100 rounded-lg h-8 px-2"
                          >
                            <ArrowLeft className="h-4 w-4 mr-1.5 rotate-180" /> Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {/* MODAL PARA CREAR PACK */}
      <Dialog open={isCrearPackModalOpen} onOpenChange={(open) => {
        if (!open) resetPackForm();
      }}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-2 border-purple-200 shadow-2xl">
          <div className="p-6 bg-purple-50 border-b border-purple-200">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-purple-900">
              <PackageSearch className="h-5 w-5 text-purple-600" /> Crear Nuevo Pack
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Define el nombre, precio y selecciona los componentes para este pack.
            </DialogDescription>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nombre del Pack <span className="text-red-500">*</span></Label>
                <Input 
                  value={packNombre} 
                  onChange={(e) => setPackNombre(e.target.value)} 
                  placeholder="Ej: Kit Limpieza Full"
                  className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-purple-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Precio de Venta Final ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-bold">$</span>
                  <Input 
                    type="number" 
                    value={packPrecio} 
                    onChange={(e) => setPackPrecio(e.target.value)} 
                    className="pl-6 font-bold bg-slate-50 border-slate-200 focus-visible:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase">Buscar Componentes</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  value={packSearchTerm} 
                  onChange={(e) => setPackSearchTerm(e.target.value)} 
                  placeholder="Escribe para buscar (no packs)..." 
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm focus:border-purple-500 transition-all outline-none"
                />
              </div>
              
              {packSearchResults.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl max-h-40 overflow-y-auto bg-slate-50 p-2 shadow-inner">
                  {packSearchResults.map(pack => (
                    <div 
                      key={pack.id} 
                      className="flex justify-between items-center py-2 border-b border-white last:border-0 hover:bg-white px-2 rounded-lg cursor-pointer" 
                      onClick={() => agregarComponenteAPack(pack)}
                    >
                      <div className="font-semibold text-sm">{pack.nombre}</div>
                      <div className="text-xs text-slate-500 font-bold bg-white border px-2 py-1 rounded">Stock: {pack.stock}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <Label className="text-xs font-bold text-slate-600 uppercase mb-2 block">Componentes Añadidos ({packComponentes.length})</Label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl min-h-[100px] p-2 space-y-2">
                {packComponentes.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm mt-4 italic">Aún no has añadido elementos al pack.</div>
                ) : (
                  packComponentes.map(comp => (
                    <div key={comp.id} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg">
                      <div className="font-medium text-sm w-1/2 line-clamp-1" title={comp.nombre}>{comp.nombre}</div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-slate-500">Cant:</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={comp.cantidad} 
                          onChange={(e) => setPackComponentes(prev => prev.map(c => c.id === comp.id ? {...c, cantidad: Number(e.target.value)} : c))} 
                          className="w-16 h-8 text-center font-bold" 
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => eliminarComponenteDePack(comp.id)} 
                          className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3 border-t pt-4">
            <Button variant="ghost" onClick={() => setIsCrearPackModalOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleCrearPack} 
              disabled={isSubmittingPack || packComponentes.length < 2 || !packNombre.trim() || !packPrecio} 
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 rounded-xl"
            >
              {isSubmittingPack ? <span className="animate-spin">⏳</span> : "Guardar Pack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PARA EDITAR PACK */}
      <Dialog open={isEditarPackModalOpen} onOpenChange={(open) => {
        if (!open) resetPackForm();
      }}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-2 border-purple-200 shadow-2xl">
          <div className="p-6 bg-purple-50 border-b border-purple-200">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-purple-900">
              <Edit className="h-5 w-5 text-purple-600" /> Editar Pack
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Modifica el nombre, precio y componentes del pack.
            </DialogDescription>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nombre del Pack <span className="text-red-500">*</span></Label>
                <Input 
                  value={packNombre} 
                  onChange={(e) => setPackNombre(e.target.value)} 
                  className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-purple-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Precio de Venta Final ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-bold">$</span>
                  <Input 
                    type="number" 
                    value={packPrecio} 
                    onChange={(e) => setPackPrecio(e.target.value)} 
                    className="pl-6 font-bold bg-slate-50 border-slate-200 focus-visible:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase">Buscar Componentes</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  value={packSearchTerm} 
                  onChange={(e) => setPackSearchTerm(e.target.value)} 
                  placeholder="Escribe para buscar (no packs)..." 
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm focus:border-purple-500 transition-all outline-none"
                />
              </div>
              
              {packSearchResults.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl max-h-40 overflow-y-auto bg-slate-50 p-2 shadow-inner">
                  {packSearchResults.map(pack => (
                    <div 
                      key={pack.id} 
                      className="flex justify-between items-center py-2 border-b border-white last:border-0 hover:bg-white px-2 rounded-lg cursor-pointer" 
                      onClick={() => agregarComponenteAPack(pack)}
                    >
                      <div className="font-semibold text-sm">{pack.nombre}</div>
                      <div className="text-xs text-slate-500 font-bold bg-white border px-2 py-1 rounded">Stock: {pack.stock}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <Label className="text-xs font-bold text-slate-600 uppercase mb-2 block">Componentes Añadidos ({packComponentes.length})</Label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl min-h-[100px] p-2 space-y-2">
                {packComponentes.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm mt-4 italic">Aún no has añadido elementos al pack.</div>
                ) : (
                  packComponentes.map(comp => (
                    <div key={comp.id} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg">
                      <div className="font-medium text-sm w-1/2 line-clamp-1" title={comp.nombre}>{comp.nombre}</div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-slate-500">Cant:</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={comp.cantidad} 
                          onChange={(e) => setPackComponentes(prev => prev.map(c => c.id === comp.id ? {...c, cantidad: Number(e.target.value)} : c))} 
                          className="w-16 h-8 text-center font-bold" 
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => eliminarComponenteDePack(comp.id)} 
                          className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3 border-t pt-4">
            <Button variant="ghost" onClick={() => setIsEditarPackModalOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleEditarPack} 
              disabled={isSubmittingPack || packComponentes.length < 2 || !packNombre.trim() || !packPrecio} 
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 rounded-xl"
            >
              {isSubmittingPack ? <span className="animate-spin">⏳</span> : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}