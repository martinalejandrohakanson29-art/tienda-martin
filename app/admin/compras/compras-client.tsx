"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Plus, Search, User, Trash2, ShoppingBag, Loader2, CreditCard, Phone, FileText,
  Calendar as CalendarIcon, ClipboardList, CheckCircle2, AlertTriangle, Clock,
  RefreshCcw, Copy, Square, CheckSquare, Percent, Edit, History, Save, Database, Printer, CheckCircle,
  ChevronDown, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  crearCompra, obtenerComprasPorRango, actualizarCompra, eliminarCompra, obtenerHistorialCompra 
} from "@/app/actions/compras";
import { obtenerProveedores, crearProveedor } from "@/app/actions/listas";
import { actualizarPrecioArticuloDB, sincronizarArticulosMostrador } from "@/app/actions/ventas-mostrador";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
}

interface ItemCompra {
  id: string;
  productoId?: string;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
  stock: number;
  ultimaModificacion?: string | null;
}

export default function ComprasClient({
  articulosIniciales,
  compradorNombre
}: {
  articulosIniciales: Articulo[],
  compradorNombre: string
}) {
  // --- ESTADOS GENERALES ---
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [comprasRealizadas, setComprasRealizadas] = useState<any[]>([]);
  const [fechaDesde, setFechaDesde] = useState(new Date().toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);
  const [isLoadingCompras, setIsLoadingCompras] = useState(false);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // --- ESTADOS PARA NUEVA COMPRA ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [items, setItems] = useState<ItemCompra[]>([]);
  const [proveedor, setProveedor] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [interes, setInteres] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [comprobante, setComprobante] = useState("");
  const [info, setInfo] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [transaccionId, setTransaccionId] = useState("");

  // --- ESTADOS PARA EDICIÓN ---
  const [isEditMainModalOpen, setIsEditMainModalOpen] = useState(false);
  const [isSearchEditModalOpen, setIsSearchEditModalOpen] = useState(false);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [isEliminarModalOpen, setIsEliminarModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<any[]>([]);
  const [editCompraId, setEditCompraId] = useState("");
  const [editItems, setEditItems] = useState<ItemCompra[]>([]);
  const [editProveedor, setEditProveedor] = useState("");
  const [editProveedorId, setEditProveedorId] = useState("");
  const [editInteres, setEditInteres] = useState<number>(0);
  const [editDescuento, setEditDescuento] = useState<number>(0);
  const [editMetodoPago, setEditMetodoPago] = useState("Efectivo");
  const [editComprobante, setEditComprobante] = useState("");
  const [editInfo, setEditInfo] = useState("");
  const [editDni, setEditDni] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editTransaccionId, setEditTransaccionId] = useState("");
  const [compraOriginalParaComparar, setCompraOriginalParaComparar] = useState<any>(null);
  const [compraAEliminar, setCompraAEliminar] = useState<any>(null);

  // --- ESTADOS PARA PROVEEDORES ---
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showProvList, setShowProvList] = useState(false);
  const [showProvListEdit, setShowProvListEdit] = useState(false);

  // --- EFECTOS ---
  useEffect(() => {
    setArticulos(articulosIniciales);
  }, [articulosIniciales]);

  useEffect(() => {
    cargarCompras(fechaDesde, fechaHasta);
  }, [fechaDesde, fechaHasta]);

  useEffect(() => {
    const fetchProveedores = async () => {
      const res = await obtenerProveedores();
      if (res.success && res.data) setProveedores(res.data);
    };
    fetchProveedores();
  }, []);

  // --- ESCUCHA DE TECLAS (ATAJOS) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si estamos en un input o textarea, no activar el atajo
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "+" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const cargarCompras = async (d: string, h: string) => {
    setIsLoadingCompras(true);
    const res = await obtenerComprasPorRango(d, h);
    if (res.success) setComprasRealizadas(res.data || []);
    setIsLoadingCompras(false);
  };

  const copiarAlPortapapeles = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
  };

  const mostrarMensajeExito = (mensaje: string) => {
    setSuccessMessage(mensaje);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const searchResults = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    const queryWords = searchTerm.toLowerCase().trim().split(/\s+/);
    return articulos.filter(art => {
      const nombreLower = art.nombre.toLowerCase();
      const idLower = art.id.toLowerCase();
      return queryWords.every(word => {
        return nombreLower.includes(word) || idLower.includes(word);
      });
    }).slice(0, 15);
  }, [searchTerm, articulos]);

  // --- CÁLCULOS NUEVA COMPRA ---
  const totalBase = items.reduce((acc, item) => acc + item.subtotal, 0);
  const totalConInteres = totalBase * (1 + interes / 100);
  const totalFinalCalculado = totalConInteres - descuento;

  // --- FUNCIONES NUEVA COMPRA ---
  const agregarProductoACompra = (prod: Articulo) => {
    const existe = items.find(item => item.productoId === prod.id);
    if (existe) {
      setItems(items.map(item =>
        item.productoId === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.costo_unit } : item
      ));
    } else {
      setItems([...items, {
        id: crypto.randomUUID(),
        productoId: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        costo_unit: Number(prod.precio),
        subtotal: Number(prod.precio),
        stock: prod.stock,
        ultimaModificacion: prod.ultimaModificacion
      }]);
    }
    setIsModalOpen(false);
    setSearchTerm("");
  };

  const handleFinalizarCompra = async () => {
    if (metodoPago === "A Cuenta Corriente" && !proveedorId) {
      alert("Debe seleccionar un proveedor de la lista para compras a Cuenta Corriente.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await crearCompra({
        proveedor,
        comprador: compradorNombre,
        total: totalBase,
        interes,
        descuento,
        totalFinal: totalFinalCalculado,
        items,
        metodo_pago: metodoPago,
        dni,
        telefono,
        info,
        comprobante,
        transaccionId,
        proveedorId
      });

      if (res.success) {
        mostrarMensajeExito("¡Compra registrada con éxito!");
        resetForm();
        cargarCompras(fechaDesde, fechaHasta);
        // Actualizar stock local
        setArticulos(prev => prev.map(art => {
            const itemComprado = items.find(i => i.productoId === art.id);
            if (itemComprado) return { ...art, stock: art.stock + itemComprado.cantidad };
            return art;
        }));
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      alert("Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setItems([]); setProveedor(""); setProveedorId(""); setInteres(0); setDescuento(0);
    setMetodoPago("Efectivo"); setComprobante(""); setInfo(""); setDni(""); setTelefono(""); setTransaccionId("");
    setIsFinalizarModalOpen(false); setIsConfirmDiscardOpen(false);
  };

  // --- FUNCIONES EDICIÓN ---
  const abrirModalEdicion = async (compra: any) => {
    const sync = await sincronizarArticulosMostrador();
    if (sync.success && sync.data) setArticulos(sync.data);

    setCompraOriginalParaComparar(compra);
    setEditCompraId(compra.id);
    setEditProveedor(compra.proveedor || "");
    setEditProveedorId(compra.proveedorId || "");
    setEditInteres(Number(compra.interes) || 0);
    setEditDescuento(Number(compra.descuento) || 0);
    setEditMetodoPago(compra.metodo_pago || "Efectivo");
    setEditComprobante(compra.comprobante || "");
    setEditInfo(compra.info || "");
    setEditDni(compra.dni || "");
    setEditTelefono(compra.telefono || "");
    setEditTransaccionId(compra.transaccionId || "");
    setEditItems(compra.items.map((i: any) => ({
      id: i.id || crypto.randomUUID(),
      productoId: i.productoId,
      nombre: i.nombre,
      cantidad: i.cantidad,
      costo_unit: Number(i.costo_unit),
      subtotal: Number(i.subtotal),
      stock: articulos.find(a => a.id === i.productoId)?.stock || 0
    })));
    setIsEditMainModalOpen(true);
  };

  const handleGuardarEdicion = async () => {
    const totalBaseEdit = editItems.reduce((acc, item) => acc + item.subtotal, 0);
    const totalFinalEdit = (totalBaseEdit * (1 + editInteres / 100)) - editDescuento;

    try {
      setIsSubmitting(true);
      const res = await actualizarCompra(editCompraId, {
        proveedor: editProveedor,
        proveedorId: editProveedorId,
        total: totalBaseEdit,
        interes: editInteres,
        descuento: editDescuento,
        totalFinal: totalFinalEdit,
        metodo_pago: editMetodoPago,
        dni: editDni,
        telefono: editTelefono,
        info: editInfo,
        comprobante: editComprobante,
        transaccionId: editTransaccionId,
        items: editItems
      }, compradorNombre, "Edición manual de compra");

      if (res.success) {
        mostrarMensajeExito("¡Compra modificada con éxito!");
        setIsEditMainModalOpen(false);
        cargarCompras(fechaDesde, fechaHasta);
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      alert("Error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEliminarCompra = async () => {
    if (!compraAEliminar) return;
    const res = await eliminarCompra(compraAEliminar.id, compradorNombre);
    if (res.success) {
      mostrarMensajeExito("Compra eliminada");
      setIsEliminarModalOpen(false);
      cargarCompras(fechaDesde, fechaHasta);
    } else {
      alert("Error: " + res.error);
    }
  };

  const abrirModalHistorial = async (id: string) => {
    setHistorialActual([]);
    setIsHistorialModalOpen(true);
    const res = await obtenerHistorialCompra(id);
    if (res.success && res.data) setHistorialActual(res.data);
  };

  // --- UI RENDER ---
  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden relative">
      {showSuccess && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
          <div className="bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-bold">{successMessage}</span>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-100 px-8 py-3 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white"><ShoppingBag className="h-5 w-5" /></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Compras (Entrada de Stock)</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Gestión de Proveedores</p>
            </div>
          </div>
        </div>
        <div className="text-right border-l pl-4 border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Responsable</p>
          <p className="text-sm font-semibold text-emerald-600">{compradorNombre}</p>
        </div>
      </header>

      <Tabs defaultValue="registrar" className="flex-grow flex flex-col overflow-hidden h-full w-full">
        <div className="bg-white border-b border-slate-100 px-8 py-1">
          <TabsList className="bg-slate-100/50 p-1 w-full flex justify-start">
            <TabsTrigger value="registrar" className="gap-2 px-6"><Plus className="h-4 w-4" /> Nueva Compra</TabsTrigger>
            <TabsTrigger value="listado" className="gap-2 px-6"><ClipboardList className="h-4 w-4" /> Historial de Compras</TabsTrigger>
            <TabsTrigger value="gestion" className="gap-2 px-6 ml-auto bg-amber-50 text-amber-700 hover:bg-amber-100 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 border border-transparent data-[state=active]:border-amber-200">
              <Edit className="h-4 w-4" /> Gestión y Edición
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="registrar" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <main className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden h-full">
            <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl w-fit shadow-md">
              <Plus className="h-4 w-4" /> Buscar Artículo ( + )
            </Button>

            <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-y-auto flex-grow h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Artículo</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Cant.</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Costo Unit.</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Subtotal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-20 text-center text-slate-400 italic">No hay artículos cargados</TableCell></TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-medium text-slate-700 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-base font-bold">{item.nombre}</span>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">{item.productoId}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <Input type="number" value={item.cantidad} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.costo_unit } : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400 text-xs">$</span>
                              <Input type="number" value={item.costo_unit} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, costo_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value) } : i))} className={`w-28 h-8 ${inputSinFlechas}`} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right py-3 font-bold text-slate-700">
                            $ {item.subtotal.toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="py-3 text-center">
                            <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </main>

          <footer className="bg-white border-t border-slate-200 p-5 flex-shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-20">
            <div className="max-w-[1600px] mx-auto flex justify-between items-end">
              <div className="flex gap-8">
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-700 block mb-0.5">Total Base</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">$ {totalBase.toLocaleString('es-AR')}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={() => setIsConfirmDiscardOpen(true)} className="text-red-500 border-red-200 hover:bg-red-50 h-12 rounded-xl">Descartar</Button>
                <Button onClick={() => setIsFinalizarModalOpen(true)} disabled={items.length === 0 || isSubmitting} className="h-12 px-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md">
                  Finalizar Compra
                </Button>
              </div>
            </div>
          </footer>
        </TabsContent>

        <TabsContent value="listado" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden h-full">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha Desde</Label>
                        <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-10 rounded-xl" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha Hasta</Label>
                        <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-10 rounded-xl" />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => cargarCompras(fechaDesde, fechaHasta)} className="mt-5 h-10 w-10"><RefreshCcw className="h-4 w-4" /></Button>
                    <div className="ml-auto text-right">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Total del Período</p>
                        <p className="text-2xl font-black text-slate-900">$ {comprasRealizadas.reduce((acc, c) => acc + Number(c.totalFinal), 0).toLocaleString('es-AR')}</p>
                    </div>
                </div>

                <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-y-auto h-full">
                        <Table>
                            <TableHeader className="sticky top-0 bg-slate-50 z-10">
                                <TableRow>
                                    <TableHead>N° Compra</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Proveedor</TableHead>
                                    <TableHead>Metodo</TableHead>
                                    <TableHead className="text-right">Total Final</TableHead>
                                    <TableHead className="text-center">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comprasRealizadas.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-mono text-xs">#{c.numeroCompra}</TableCell>
                                        <TableCell className="text-xs">{new Date(c.createdAt).toLocaleString('es-AR')}</TableCell>
                                        <TableCell className="font-bold">{c.proveedor}</TableCell>
                                        <TableCell><span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase">{c.metodo_pago}</span></TableCell>
                                        <TableCell className="text-right font-bold">$ {c.totalFinal.toLocaleString('es-AR')}</TableCell>
                                        <TableCell className="text-center space-x-2">
                                            <Button size="sm" variant="ghost" onClick={() => abrirModalEdicion(c)}><Edit className="h-4 w-4" /></Button>
                                            <Button size="sm" variant="ghost" onClick={() => abrirModalHistorial(c.id)}><History className="h-4 w-4" /></Button>
                                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { setCompraAEliminar(c); setIsEliminarModalOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </main>
        </TabsContent>

        {/* --- PESTAÑA: GESTIÓN Y EDICIÓN --- */}
        <TabsContent value="gestion" className="flex-grow overflow-hidden m-0 select-text data-[state=active]:flex data-[state=active]:flex-col h-full">
          <main className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden h-full">
            <div className="flex flex-col gap-4 bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm flex-shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Fecha Desde</Label>
                    <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-10 bg-white border-amber-200" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Fecha Hasta</Label>
                    <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-10 bg-white border-amber-200" />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => cargarCompras(fechaDesde, fechaHasta)} className="h-10 w-10 border-amber-200 text-amber-600 hover:bg-white"><RefreshCcw className="h-4 w-4" /></Button>
                </div>
                <div className="text-right ml-auto">
                  <p className="text-xs text-amber-700 font-bold flex items-center gap-2 justify-end"><AlertTriangle className="h-4 w-4" /> Área de Modificaciones</p>
                  <p className="text-[10px] text-amber-600">Las ediciones recalcularán el stock automáticamente.</p>
                </div>
              </div>
            </div>

            <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-y-auto flex-grow h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-3">ID Compra</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Fecha / Hora</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Proveedor</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Comprobante</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Acciones Administrativas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprasRealizadas.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-20 text-center text-slate-400 italic">No se encontraron compras</TableCell></TableRow>
                    ) : (
                      comprasRealizadas.map((v) => (
                        <TableRow key={v.id} className="hover:bg-slate-50/50">
                          <TableCell className="py-4">
                            <span 
                              className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer hover:text-blue-600 transition-colors" 
                              onClick={() => copiarAlPortapapeles(v.id)}
                            >
                              {v.numeroCompra || v.id.slice(0, 8)}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 text-xs">
                            {new Date(v.createdAt).toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="font-bold text-slate-700 py-4">
                            {v.proveedor}
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">
                              {v.metodo_pago}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 text-xs font-mono text-slate-600">
                            {v.comprobante || "-"}
                          </TableCell>
                          <TableCell className="font-black text-slate-900 py-4 text-right">$ {Number(v.totalFinal).toLocaleString('es-AR')}</TableCell>
                          <TableCell className="py-4 text-right space-x-2 whitespace-nowrap">
                            <Button size="sm" variant="outline" onClick={() => abrirModalEdicion(v)} className="border-amber-200 text-amber-700 hover:bg-amber-50">
                              <Edit className="h-4 w-4 mr-2" /> Editar
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => abrirModalHistorial(v.id)} className="bg-slate-100 text-slate-600 hover:bg-slate-200">
                              <History className="h-4 w-4 mr-2" /> Historial
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setCompraAEliminar(v); setIsEliminarModalOpen(true); }} className="bg-red-100 text-red-600 hover:bg-red-200 border border-red-300">
                              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </main>
        </TabsContent>
      </Tabs>

      {/* --- MODALES --- */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden rounded-3xl">
          <div className="p-6 bg-white border-b">
            <DialogTitle className="text-lg font-bold mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-emerald-600" /> Buscador de Artículos</DialogTitle>
            <div className="relative">
                <Search className="absolute left-4 top-3 h-5 w-5 text-slate-400" />
                <input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Escribe el nombre o ID..." className="flex h-12 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-12 text-base outline-none focus:border-emerald-500" />
            </div>
          </div>
          <div className="h-[400px] overflow-y-auto p-4">
            {searchResults.map((prod) => (
              <button key={prod.id} onClick={() => agregarProductoACompra(prod)} className="w-full flex items-center justify-between p-3 hover:bg-emerald-50 rounded-xl mb-2 transition-all border border-transparent hover:border-emerald-100">
                <div className="text-left flex flex-col">
                  <span className="font-bold text-slate-900">{prod.nombre}</span>
                  <span className="text-[10px] text-slate-400 font-mono">Stock actual: {prod.stock}</span>
                </div>
                <p className="font-medium">$ {Number(prod.precio).toLocaleString('es-AR')}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFinalizarModalOpen} onOpenChange={setIsFinalizarModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" /> Detalles de la Compra</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2 relative">
                <Label className="text-xs font-bold text-slate-500 uppercase">Proveedor</Label>
                <Input value={proveedor} onChange={(e) => { setProveedor(e.target.value); setShowProvList(true); }} onFocus={() => setShowProvList(true)} className="pl-9" />
                <User className="absolute left-3 top-9 h-4 w-4 text-slate-400" />
                {showProvList && (
                    <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto mt-1 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2 border-b bg-slate-50 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Resultados de búsqueda</span>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowProvList(false)}>Cerrar</Button>
                        </div>
                        {proveedores.filter(p => 
                            p.razonSocial.toLowerCase().includes(proveedor.toLowerCase()) || 
                            (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(proveedor.toLowerCase())) ||
                            p.cuit?.includes(proveedor)
                        ).length > 0 ? (
                            proveedores.filter(p => 
                                p.razonSocial.toLowerCase().includes(proveedor.toLowerCase()) || 
                                (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(proveedor.toLowerCase())) ||
                                p.cuit?.includes(proveedor)
                            ).map(p => (
                                <div 
                                    key={p.id} 
                                    className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group" 
                                    onClick={() => { 
                                        setProveedor(p.razonSocial); 
                                        setProveedorId(p.id); 
                                        setShowProvList(false); 
                                    }}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-700">{p.razonSocial}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{p.cuit || "SIN CUIT"} {p.nombreFantasia ? `| ${p.nombreFantasia}` : ""}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Saldo</span>
                                            <span className={`text-xs font-black ${p.total > 0 ? 'text-red-600' : 'text-green-600'}`}>$ {Number(p.total).toLocaleString('es-AR')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center">
                                <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                                <p className="text-sm font-bold text-slate-900">No se encontró el proveedor</p>
                                <p className="text-xs text-slate-500">Prueba con otro nombre o CUIT</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Método Pago</Label>
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm">
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                        <option value="Cheque">Cheque</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Comprobante N°</Label>
                    <Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Ej: 0001-00001234" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Interés (%)</Label>
                    <Input type="number" value={interes} onChange={(e) => setInteres(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Descuento ($)</Label>
                    <Input type="number" value={descuento} onChange={(e) => setDescuento(Number(e.target.value))} />
                </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-2">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-500">TOTAL FINAL A PAGAR:</span>
                    <span className="text-2xl font-black text-slate-900">$ {totalFinalCalculado.toLocaleString('es-AR')}</span>
                </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFinalizarModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleFinalizarCompra} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-8">Confirmar Registro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Historial */}
      <Dialog open={isHistorialModalOpen} onOpenChange={setIsHistorialModalOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-blue-600" /> Historial de Movimientos</DialogTitle></DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-3 p-2">
            {historialActual.map((h, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-blue-600 uppercase">{h.accion}</span>
                  <span className="text-[10px] text-slate-400">{new Date(h.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm font-bold text-slate-800">{h.usuario}</p>
                <p className="text-xs text-slate-500 mt-1">{h.detalle}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Eliminación */}
      <Dialog open={isEliminarModalOpen} onOpenChange={setIsEliminarModalOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl">
          <DialogHeader><DialogTitle className="text-red-600">¿Eliminar Compra?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Esta acción revertirá el stock sumado y anulará los movimientos en cuenta corriente asociados. Esta acción no se puede deshacer.</p>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsEliminarModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEliminarCompra}>Eliminar Definitivamente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Edición (Simplificado para el ejemplo) */}
      <Dialog open={isEditMainModalOpen} onOpenChange={setIsEditMainModalOpen}>
        <DialogContent className="sm:max-w-[90vw] h-[90vh] flex flex-col rounded-3xl p-0 overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2"><Edit className="h-5 w-5 text-amber-500" /> Editando Compra #{compraOriginalParaComparar?.numeroCompra}</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsEditMainModalOpen(false)}><Plus className="h-5 w-5 rotate-45" /></Button>
            </div>
            <div className="flex-grow overflow-hidden flex flex-col p-6 gap-6">
                <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2 relative">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Proveedor</Label>
                        <Input value={editProveedor} onChange={(e) => { setEditProveedor(e.target.value); setShowProvListEdit(true); }} className="h-12 bg-slate-50" />
                        {showProvListEdit && (
                            <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto mt-1 animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 border-b bg-slate-50 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Resultados de búsqueda</span>
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowProvListEdit(false)}>Cerrar</Button>
                                </div>
                                {proveedores.filter(p => 
                                    p.razonSocial.toLowerCase().includes(editProveedor.toLowerCase()) || 
                                    (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(editProveedor.toLowerCase())) ||
                                    p.cuit?.includes(editProveedor)
                                ).length > 0 ? (
                                    proveedores.filter(p => 
                                        p.razonSocial.toLowerCase().includes(editProveedor.toLowerCase()) || 
                                        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(editProveedor.toLowerCase())) ||
                                        p.cuit?.includes(editProveedor)
                                    ).map(p => (
                                        <div 
                                            key={p.id} 
                                            className="p-3 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group" 
                                            onClick={() => { 
                                                setEditProveedor(p.razonSocial); 
                                                setEditProveedorId(p.id); 
                                                setShowProvListEdit(false); 
                                            }}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-900 group-hover:text-amber-700">{p.razonSocial}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">{p.cuit || "SIN CUIT"}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`text-xs font-black ${p.total > 0 ? 'text-red-600' : 'text-green-600'}`}>$ {Number(p.total).toLocaleString('es-AR')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-xs text-slate-400 italic">No se encontraron resultados</div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Método Pago</Label>
                        <select value={editMetodoPago} onChange={(e) => setEditMetodoPago(e.target.value)} className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4">
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comprobante N°</Label>
                        <Input value={editComprobante} onChange={(e) => setEditComprobante(e.target.value)} className="h-12 bg-slate-50" />
                    </div>
                </div>

                <div className="flex-grow border rounded-2xl overflow-hidden flex flex-col bg-white">
                    <div className="overflow-y-auto flex-grow h-full">
                        <Table>
                            <TableHeader className="sticky top-0 bg-slate-50 z-10">
                                <TableRow>
                                    <TableHead>Artículo</TableHead>
                                    <TableHead className="text-center">Cant.</TableHead>
                                    <TableHead className="text-center">Costo Unit.</TableHead>
                                    <TableHead className="text-right">Subtotal</TableHead>
                                    <TableHead className="w-16"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {editItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-bold">{item.nombre}</TableCell>
                                        <TableCell className="text-center"><Input type="number" value={item.cantidad} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? { ...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.costo_unit } : i))} className="w-16 mx-auto h-8 text-center" /></TableCell>
                                        <TableCell className="text-center"><Input type="number" value={item.costo_unit} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? { ...i, costo_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value) } : i))} className="w-28 mx-auto h-8 text-center" /></TableCell>
                                        <TableCell className="text-right font-bold">$ {item.subtotal.toLocaleString('es-AR')}</TableCell>
                                        <TableCell><Button variant="ghost" size="icon" onClick={() => setEditItems(editItems.filter(i => i.id !== item.id))} className="text-red-500"><Trash2 className="h-4 w-4" /></Button></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div className="flex gap-10">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Base</Label>
                            <p className="text-xl font-bold text-slate-900">$ {editItems.reduce((acc, i) => acc + i.subtotal, 0).toLocaleString('es-AR')}</p>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Final</Label>
                            <p className="text-3xl font-black text-amber-600">$ {((editItems.reduce((acc, i) => acc + i.subtotal, 0) * (1 + editInteres / 100)) - editDescuento).toLocaleString('es-AR')}</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={() => setIsEditMainModalOpen(false)} className="h-12 px-6 rounded-xl">Cancelar</Button>
                        <Button onClick={handleGuardarEdicion} disabled={isSubmitting} className="h-12 px-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md shadow-amber-500/20">Guardar Cambios</Button>
                    </div>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
