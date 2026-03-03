"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Plus, Search, User, Trash2, ShoppingBag, Loader2, CreditCard, 
  Calendar as CalendarIcon, ClipboardList, CheckCircle2, AlertTriangle,
  RefreshCcw, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  crearCompra, obtenerComprasPorFecha 
} from "@/app/actions/compras";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

interface ItemCompra {
  id: string;
  nombre: string;
  cantidad: number;
  costo_unit: number; // En compras usamos costo
  subtotal: number;
}

export default function ComprasClient({ 
  articulosIniciales,
  compradorNombre 
}: { 
  articulosIniciales: Articulo[],
  compradorNombre: string 
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); 
  const [successMessage, setSuccessMessage] = useState("");
  const [comprasRealizadas, setComprasRealizadas] = useState<any[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [isLoadingCompras, setIsLoadingCompras] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // ESTADOS NUEVA COMPRA
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [items, setItems] = useState<ItemCompra[]>([]); 
  const [proveedor, setProveedor] = useState("Proveedor General");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [info, setInfo] = useState("");
  const [comprobante, setComprobante] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "+" && !isModalOpen) {
        e.preventDefault();
        setIsModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    cargarCompras(fechaFiltro);
  }, [fechaFiltro]);

  const cargarCompras = async (fecha: string) => {
    setIsLoadingCompras(true);
    const res = await obtenerComprasPorFecha(fecha);
    if (res.success) {
      setComprasRealizadas(res.data || []);
    }
    setIsLoadingCompras(false);
  };

  const mostrarMensajeExito = (mensaje: string) => {
    setSuccessMessage(mensaje);
    setShowSuccess(true);
  }

  const searchResults = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    const queryWords = searchTerm.toLowerCase().trim().split(/\s+/);
    return articulosIniciales.filter(art => {
      const nombreLower = art.nombre.toLowerCase();
      const idLower = art.id.toLowerCase();
      return queryWords.every(word => {
        if (/^\d+$/.test(word)) {
          const regexNumerico = new RegExp(`(?:^|[^0-9])${word}(?:[^0-9]|$)`);
          return regexNumerico.test(nombreLower) || regexNumerico.test(idLower);
        }
        return nombreLower.includes(word) || idLower.includes(word);
      });
    }).slice(0, 15);
  }, [searchTerm, articulosIniciales]);

  const agregarProductoACompra = (prod: Articulo) => {
    const existe = items.find(item => item.id === prod.id);
    if (existe) {
      setItems(items.map(item => 
        item.id === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.costo_unit } : item
      ));
    } else {
      // Usamos el precio actual como costo referencial, pero el usuario lo puede cambiar
      setItems([...items, { id: prod.id, nombre: prod.nombre, cantidad: 1, costo_unit: Number(prod.precio), subtotal: Number(prod.precio) }]);
    }
    setIsModalOpen(false);
    setSearchTerm("");
  };

  const totalBase = items.reduce((acc, item) => acc + item.subtotal, 0);

  const handleFinalizarCompra = async () => {
    try {
      setIsSubmitting(true);
      const resultado = await crearCompra({
        proveedor, 
        comprador: compradorNombre, 
        total: totalBase,
        items, 
        metodo_pago: metodoPago, 
        info, 
        comprobante
      });
      if (resultado.success) {
        mostrarMensajeExito("¡Compra registrada y stock actualizado!");
        resetForm();
        cargarCompras(fechaFiltro);
      } else { 
        alert("Error al guardar: " + resultado.error); 
      }
    } catch (error) { 
        alert("Ocurrió un error inesperado."); 
    } finally { 
        setIsSubmitting(false); 
    }
  };

  const resetForm = () => {
    setItems([]); 
    setProveedor("Proveedor General"); 
    setMetodoPago("Efectivo"); 
    setInfo(""); 
    setComprobante(""); 
    setIsFinalizarModalOpen(false); 
    setIsConfirmDiscardOpen(false);
  };

  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden select-none relative">
      
      {showSuccess && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-bold">{successMessage}</span>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-100 px-8 py-3 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg text-white">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Ingreso de Mercadería (Compras)</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Revolución Motos</p>
          </div>
        </div>
        <div className="text-right border-l pl-4 border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Comprador</p>
          <p className="text-sm font-semibold text-emerald-600">{compradorNombre}</p>
        </div>
      </header>

      <Tabs defaultValue="registrar" className="flex-grow flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-100 px-8 py-1">
          <TabsList className="bg-slate-100/50 p-1 w-full flex justify-start relative">
            <TabsTrigger value="registrar" className="gap-2 px-6"><Plus className="h-4 w-4" /> Nueva Compra</TabsTrigger>
            <TabsTrigger value="listado" className="gap-2 px-6"><ClipboardList className="h-4 w-4" /> Historial de Compras</TabsTrigger>
          </TabsList>
        </div>

        {/* --- PESTAÑA: REGISTRAR COMPRA --- */}
        <TabsContent value="registrar" className="flex-grow flex flex-col overflow-hidden m-0">
          <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden">
            <section className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col md:flex-row gap-6 items-end shadow-sm flex-shrink-0">
              <div className="flex-grow space-y-1.5 max-w-md">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proveedor</Label>
                <div className="relative">
                  <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="pl-9 h-10 bg-slate-50/50 border-slate-200" />
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div className="flex-shrink-0 ml-auto text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total a Pagar</span>
                <span className="text-3xl font-black text-slate-900 tracking-tighter">$ {totalBase.toLocaleString('es-AR')}</span>
              </div>
            </section>

            <section className="flex-grow flex flex-col min-h-0 gap-4">
              <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl w-fit">
                <Plus className="h-4 w-4" /> Añadir Artículo
              </Button>

              <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-grow">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Artículo</TableHead>
                        <TableHead className="text-center text-[10px] font-bold uppercase py-3">Cant. a Ingresar</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Costo Unitario</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="py-20 text-center text-slate-400 italic">No hay artículos cargados a la compra</TableCell></TableRow>
                      ) : (
                        items.map((item) => (
                          <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <TableCell className="font-medium text-slate-700 py-3">
                              <div className="flex flex-col">
                                <span className="text-base">{item.nombre}</span>
                                <span className="text-[9px] text-slate-400 font-mono uppercase">{item.id}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center py-3">
                              <Input type="number" value={item.cantidad} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.costo_unit} : i))} className={`w-16 mx-auto h-8 border-emerald-200 text-emerald-700 font-bold ${inputSinFlechas}`} />
                            </TableCell>
                            <TableCell className="text-right py-3">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-slate-400 text-xs">$</span>
                                <Input type="number" value={item.costo_unit} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, costo_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value)} : i))} className={`w-28 h-8 ${inputSinFlechas}`} />
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></Button>
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
          <footer className="bg-white border-t border-slate-100 p-4 flex-shrink-0 shadow-lg">
            <div className="max-w-[1800px] mx-auto flex justify-end gap-4">
              <Button variant="ghost" onClick={() => setIsConfirmDiscardOpen(true)} className="text-slate-500 hover:text-red-500">Descartar Compra</Button>
              <Button onClick={() => setIsFinalizarModalOpen(true)} disabled={items.length === 0 || isSubmitting} className="px-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold">Confirmar Compra</Button>
            </div>
          </footer>
        </TabsContent>

        {/* --- PESTAÑA: LISTADO DE COMPRAS --- */}
        <TabsContent value="listado" className="flex-grow flex flex-col overflow-hidden m-0 select-text">
          <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtrar por Fecha</Label>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="pl-9 h-10 w-48 bg-slate-50 border-slate-200 cursor-pointer" />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => cargarCompras(fechaFiltro)} disabled={isLoadingCompras} className="rounded-xl border-slate-200 h-10 w-10 text-slate-400 hover:text-emerald-600 transition-all">
                      <RefreshCcw className={`h-4 w-4 ${isLoadingCompras ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Comprado</p>
                <p className="text-xl font-black text-slate-900">$ {comprasRealizadas.reduce((acc, c) => acc + Number(c.total), 0).toLocaleString('es-AR')}</p>
              </div>
            </div>

            <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-y-auto h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Hora</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Proveedor</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Artículos Ingresados</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Invertido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprasRealizadas.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-20 text-center text-slate-400 italic">No se encontraron compras en esta fecha</TableCell></TableRow>
                    ) : (
                      comprasRealizadas.map((c) => (
                        <TableRow key={c.id} className="hover:bg-slate-50/50 align-top">
                          <TableCell className="text-xs font-mono text-slate-500 py-4">{new Date(c.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                          
                          <TableCell className="font-medium text-slate-700 py-4">{c.proveedor}</TableCell>
                          
                          <TableCell className="py-4">
                            <div className="flex flex-col gap-1.5 min-w-[250px]">
                              {c.items?.map((item: any) => (
                                <div key={item.id} className="text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 flex flex-col">
                                  <div className="flex justify-between items-center gap-3">
                                    <span className="font-bold text-slate-800 uppercase flex-grow pr-2">{item.nombre}</span>
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                      <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black text-[10px]">+{item.cantidad} al stock</span>
                                      <span className="text-slate-700 font-bold whitespace-nowrap">$ {Number(item.subtotal || 0).toLocaleString('es-AR')}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{c.metodo_pago}</span>
                          </TableCell>
                          <TableCell className="text-right font-black text-slate-900 py-4">$ {c.total.toLocaleString('es-AR')}</TableCell>
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
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="p-6 bg-white border-b relative">
            <DialogTitle className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-emerald-600" /> Buscar Artículo para Ingresar</DialogTitle>
            <div className="relative"><Search className="absolute left-4 top-3 h-5 w-5 text-slate-400" /><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Escribe el nombre o ID..." className="flex h-12 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-12 py-6 text-base outline-none focus:border-emerald-500 transition-all" /></div>
          </div>
          <div className="h-[500px] overflow-y-auto p-4 bg-white">
            {searchResults.map((prod) => (
              <button key={prod.id} onClick={() => agregarProductoACompra(prod)} className="w-full flex items-center justify-between p-3.5 hover:bg-emerald-50/50 rounded-xl group transition-all mb-2 border border-transparent hover:border-emerald-100">
                <div className="flex items-center gap-4"><Plus className="h-4 w-4 text-slate-400 group-hover:text-emerald-600" /><div className="text-left"><p className="font-bold text-slate-900 leading-tight">{prod.nombre} <span className="ml-2 font-normal text-slate-400 text-[11px]">(Stock Actual: {prod.stock})</span></p><p className="text-[10px] text-slate-400 font-mono uppercase">ID: {prod.id}</p></div></div>
                <p className="font-medium text-slate-400 text-xs">Precio ref: $ {prod.precio.toLocaleString('es-AR')}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFinalizarModalOpen} onOpenChange={setIsFinalizarModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
          <DialogHeader><DialogTitle className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" /> Detalles del Pago y Stock</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-sm border border-emerald-100">
              Se sumarán automáticamente las cantidades al stock de la base de datos tras confirmar.
            </div>

             <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Forma de Pago</Label>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:outline-none">
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Cheque">Cheque</option>
                <option value="Cuenta Corriente">Cuenta Corriente</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Nº Comprobante / Factura (Opcional)</Label>
              <Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="0001-00001234..." />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Información Extra</Label>
              <Input value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Notas..." />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="ghost" onClick={() => setIsFinalizarModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleFinalizarCompra} disabled={isSubmitting} className="bg-emerald-600 text-white px-8 rounded-xl">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Compra y Sumar Stock"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmDiscardOpen} onOpenChange={setIsConfirmDiscardOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-6">
          <DialogHeader><div className="mx-auto bg-red-100 text-red-600 p-3 rounded-full w-fit mb-4"><AlertTriangle className="h-6 w-6" /></div><DialogTitle className="text-center text-xl font-bold">¿Descartar Compra?</DialogTitle></DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-3 mt-4"><Button variant="outline" onClick={() => setIsConfirmDiscardOpen(false)} className="w-full">Mantener</Button><Button onClick={resetForm} className="w-full bg-red-600 text-white">Sí, Descartar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
