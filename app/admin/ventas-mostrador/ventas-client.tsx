"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Plus, Search, User, Trash2, ShoppingCart, Loader2, CreditCard, Phone, FileText, 
  Calendar as CalendarIcon, ClipboardList, CheckCircle2, ArrowRightLeft, AlertTriangle,
  RefreshCcw, Copy, Square, CheckSquare
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
import { crearVentaMostrador, obtenerVentasPorFecha, marcarVentaComoRegistrada } from "@/app/actions/ventas-mostrador";

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
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); 
  const [items, setItems] = useState<ItemVenta[]>([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [cliente, setCliente] = useState("Consumidor Final");

  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [info, setInfo] = useState("");
  const [cupon, setCupon] = useState("");
  const [transaccionId, setTransaccionId] = useState("");
  const [deCruzada, setDeCruzada] = useState("");
  const [paraCruzada, setParaCruzada] = useState("");

  const [ventasRealizadas, setVentasRealizadas] = useState<any[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [isLoadingVentas, setIsLoadingVentas] = useState(false);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);

  // Atajo de teclado "+" para añadir artículos
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

  const cargarVentas = async (fecha: string) => {
    setIsLoadingVentas(true);
    const res = await obtenerVentasPorFecha(fecha);
    if (res.success) {
      setVentasRealizadas(res.data || []);
    }
    setIsLoadingVentas(false);
  };

  useEffect(() => {
    cargarVentas(fechaFiltro);
  }, [fechaFiltro]);

  const copiarAlPortapapeles = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
  };

  const handleMarcarRegistrada = async (id: string) => {
    setVentasRealizadas(prev => prev.map(v => v.id === id ? { ...v, registrada: true } : v));
    const res = await marcarVentaComoRegistrada(id);
    if (!res.success) {
      alert("No se pudo actualizar en la base de datos");
      cargarVentas(fechaFiltro);
    }
  };

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

  const totalVenta = items.reduce((acc, item) => acc + item.subtotal, 0);

  const handleFinalizarVenta = async () => {
    if ((metodoPago.includes("Tarjeta")) && (!dni || !telefono)) {
      alert("Para pagos con tarjeta, el DNI y el Teléfono son obligatorios.");
      return;
    }
    if (metodoPago === "Cruzada" && (!deCruzada || !paraCruzada)) {
      alert("Para ventas cruzadas, los campos 'De' y 'Para' son obligatorios.");
      return;
    }
    const clienteFinal = (metodoPago !== "Efectivo" && metodoPago !== "Transferencia") ? dni : cliente;
    try {
      setIsSubmitting(true);
      const resultado = await crearVentaMostrador({
        cliente: clienteFinal, 
        vendedor: vendedorNombre, 
        total: totalVenta, 
        items, 
        metodo_pago: metodoPago,
        dni, telefono, info, cupon, transaccionId, de: deCruzada, para: paraCruzada
      });
      if (resultado.success) {
        setShowSuccess(true);
        resetForm();
        cargarVentas(fechaFiltro);
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
    setItems([]); setCliente("Consumidor Final"); setMetodoPago("Efectivo"); setDni(""); setTelefono("");
    setInfo(""); setCupon(""); setTransaccionId(""); setDeCruzada(""); setParaCruzada("");
    setIsFinalizarModalOpen(false);
    setIsConfirmDiscardOpen(false);
  };

  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden select-none relative">
      
      {showCopyFeedback && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-slate-800 text-white text-[10px] px-3 py-1 rounded-full shadow-lg border border-slate-700 flex items-center gap-2">
            <Copy className="h-3 w-3 text-blue-400" /> ¡Copiado!
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-bold">¡Venta registrada con éxito!</span>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-100 px-8 py-3 flex items-center justify-between flex-shrink-0 z-20">
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

      <Tabs defaultValue="registrar" className="flex-grow flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-100 px-8 py-1">
          <TabsList className="bg-slate-100/50 p-1">
            <TabsTrigger value="registrar" className="gap-2 px-6"><ShoppingCart className="h-4 w-4" /> Registrar Venta</TabsTrigger>
            <TabsTrigger value="listado" className="gap-2 px-6"><ClipboardList className="h-4 w-4" /> Listado de Ventas</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="registrar" className="flex-grow flex flex-col overflow-hidden m-0">
          <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full gap-4 overflow-hidden">
            <section className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col md:flex-row gap-6 items-end shadow-sm flex-shrink-0">
              <div className="flex-grow space-y-1.5 max-w-md">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente / Razón Social</Label>
                <div className="relative">
                  <Input value={cliente} onChange={(e) => setCliente(e.target.value)} className="pl-9 h-10 bg-slate-50/50 border-slate-200" />
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                </div>
              </div>
              <div className="flex-shrink-0 ml-auto text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total a Cobrar</span>
                <span className="text-3xl font-black text-slate-900 tracking-tighter">$ {totalVenta.toLocaleString('es-AR')}</span>
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
                        <TableHead className="text-center text-[10px] font-bold uppercase py-3">Cant.</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Precio Unit.</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="py-20 text-center text-slate-400 italic">No hay artículos cargados</TableCell></TableRow>
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
                              <Input type="number" value={item.cantidad} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.precio_unit} : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                            </TableCell>
                            <TableCell className="text-right py-3">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-slate-400 text-xs">$</span>
                                <Input type="number" value={item.precio_unit} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, precio_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value)} : i))} className={`w-28 h-8 ${inputSinFlechas}`} />
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
            <div className="max-w-7xl mx-auto flex justify-end gap-4">
              <Button variant="ghost" onClick={() => setIsConfirmDiscardOpen(true)} className="text-slate-500 hover:text-red-500">Descartar Venta</Button>
              <Button onClick={() => setIsFinalizarModalOpen(true)} disabled={items.length === 0 || isSubmitting} className="px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">Finalizar Venta</Button>
            </div>
          </footer>
        </TabsContent>

        <TabsContent value="listado" className="flex-grow flex flex-col overflow-hidden m-0">
          <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full gap-4 overflow-hidden">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtrar por Fecha</Label>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input 
                        type="date" 
                        value={fechaFiltro} 
                        onChange={(e) => setFechaFiltro(e.target.value)}
                        className="pl-9 h-10 w-48 bg-slate-50 border-slate-200 cursor-pointer" 
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => cargarVentas(fechaFiltro)}
                      className={`rounded-xl border-slate-200 h-10 w-10 text-slate-400 hover:text-blue-600 transition-all ${isLoadingVentas ? 'bg-slate-50' : ''}`}
                      disabled={isLoadingVentas}
                    >
                      <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total del Día</p>
                <p className="text-xl font-black text-slate-900">
                  $ {ventasRealizadas.reduce((acc, v) => acc + Number(v.total), 0).toLocaleString('es-AR')}
                </p>
              </div>
            </div>

            <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-y-auto h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Hora</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Cliente</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Artículos Vendidos</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Vendedor</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3 w-32">Registrada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ventasRealizadas.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-20 text-center text-slate-400 italic">No se encontraron ventas</TableCell></TableRow>
                    ) : (
                      ventasRealizadas.map((v) => (
                        <TableRow key={v.id} className="hover:bg-slate-50/50 align-top">
                          <TableCell className="text-xs font-mono text-slate-500 py-4">
                            {new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-medium text-slate-700 py-4">{v.cliente}</TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col gap-1.5 min-w-[250px]">
                              {v.items?.map((item: any) => (
                                <div key={item.id} className="text-[11px] bg-slate-50 p-1.5 rounded border border-slate-100 flex flex-col group relative">
                                  <div className="flex justify-between items-start gap-2">
                                    <span 
                                      onClick={() => copiarAlPortapapeles(item.nombre)}
                                      className="font-bold text-slate-800 uppercase cursor-pointer hover:text-blue-600 transition-colors"
                                    >
                                      {item.nombre}
                                    </span>
                                    <span className="bg-blue-100 text-blue-700 px-1.5 rounded font-black">x{item.cantidad}</span>
                                  </div>
                                  <span 
                                    onClick={() => copiarAlPortapapeles(item.productoId || 'N/A')}
                                    className="text-[9px] text-slate-400 font-mono tracking-tighter cursor-pointer hover:text-blue-500 transition-colors"
                                  >
                                    ID: {item.productoId || 'N/A'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm py-4">{v.vendedor}</TableCell>
                          <TableCell className="py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                              v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {v.metodo_pago}
                            </span>
                            {v.metodo_pago === 'Cruzada' && v.de && (
                              <div className="text-[13px] mt-2 text-slate-600 font-black italic bg-amber-50 p-1 px-2 rounded-lg border border-amber-100">
                                {v.de} → {v.para}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-900 py-4">
                            $ {v.total.toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <button
                              disabled={v.registrada}
                              onClick={() => handleMarcarRegistrada(v.id)}
                              className={`p-2 rounded-xl transition-all ${
                                v.registrada 
                                  ? 'text-green-600 bg-green-50 cursor-default border border-green-100' 
                                  : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50 border border-transparent'
                              }`}
                            >
                              {v.registrada ? <CheckSquare className="h-6 w-6" /> : <Square className="h-6 w-6" />}
                            </button>
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
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="p-6 bg-white border-b relative">
            <DialogTitle className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-600" /> Buscador Instantáneo
            </DialogTitle>
            <div className="relative">
              <Search className="absolute left-4 top-3 h-5 w-5 text-slate-400" />
              <input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Escribe el nombre o ID..." className="flex h-12 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-12 py-6 text-base outline-none focus:border-blue-500 transition-all" />
            </div>
          </div>
          <div className="h-[500px] overflow-y-auto p-4 bg-white">
            {searchResults.map((prod) => (
              <button key={prod.id} onClick={() => agregarProductoAVenta(prod)} className="w-full flex items-center justify-between p-3.5 hover:bg-blue-50/50 rounded-xl group transition-all mb-2 border border-transparent hover:border-blue-100">
                <div className="flex items-center gap-4">
                  <Plus className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                  <div className="text-left">
                    {/* Stock con la misma fuente, más chico y sin negrita */}
                    <p className="font-bold text-slate-900 leading-tight">
                      {prod.nombre} 
                      <span className="ml-2 font-normal text-slate-400 text-[11px]">
                        (Stock: {prod.stock})
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono uppercase">ID: {prod.id}</p>
                  </div>
                </div>
                <p className="font-medium text-slate-900">$ {prod.precio.toLocaleString('es-AR')}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFinalizarModalOpen} onOpenChange={setIsFinalizarModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
          <DialogHeader><DialogTitle className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-600" /> Detalles del Cobro</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Forma de Pago</Label>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:outline-none">
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                <option value="Cruzada">Cruzada</option>
              </select>
            </div>

            {(metodoPago.includes("Tarjeta")) && (
              <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">DNI <span className="text-red-500">*</span></Label>
                  <div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={dni} onChange={(e) => setDni(e.target.value)} className="pl-9" placeholder="DNI cliente" /></div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Teléfono <span className="text-red-500">*</span></Label>
                  <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="pl-9" placeholder="Celular" /></div>
                </div>
              </div>
            )}

            {metodoPago === "Cruzada" && (
              <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-300 bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-amber-700 uppercase">De <span className="text-red-500">*</span></Label>
                  <div className="relative"><ArrowRightLeft className="absolute left-3 top-3 h-4 w-4 text-amber-400" /><Input value={deCruzada} onChange={(e) => setDeCruzada(e.target.value)} className="pl-9 bg-white border-amber-200" placeholder="Origen" /></div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-amber-700 uppercase">Para <span className="text-red-500">*</span></Label>
                  <div className="relative"><ArrowRightLeft className="absolute left-3 top-3 h-4 w-4 text-amber-400" /><Input value={paraCruzada} onChange={(e) => setParaCruzada(e.target.value)} className="pl-9 bg-white border-amber-200" placeholder="Destino" /></div>
                </div>
              </div>
            )}

            {(metodoPago.includes("Tarjeta")) && (
              <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-blue-600 uppercase">N° Cupón</Label>
                  <Input value={cupon} onChange={(e) => setCupon(e.target.value)} className="bg-white" placeholder="0000" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-blue-600 uppercase">ID Transacción</Label>
                  <Input value={transaccionId} onChange={(e) => setTransaccionId(e.target.value)} className="bg-white" placeholder="ID Cobro" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Información Extra</Label>
              <div className="relative"><FileText className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={info} onChange={(e) => setInfo(e.target.value)} className="pl-9" placeholder="Notas adicionales..." /></div>
            </div>

            <div className="mt-2 p-4 bg-slate-900 rounded-2xl text-white flex justify-between items-center">
              <span className="text-sm font-medium opacity-70">Total Final</span>
              <span className="text-xl font-bold">$ {totalVenta.toLocaleString('es-AR')}</span>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="ghost" onClick={() => setIsFinalizarModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleFinalizarVenta} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl font-bold">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar y Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmDiscardOpen} onOpenChange={setIsConfirmDiscardOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-6">
          <DialogHeader>
            <div className="mx-auto bg-red-100 text-red-600 p-3 rounded-full w-fit mb-4"><AlertTriangle className="h-6 w-6" /></div>
            <DialogTitle className="text-center text-xl font-bold">¿Descartar Venta?</DialogTitle>
            <DialogDescription className="text-center text-slate-500">Esta acción borrará todos los artículos cargados actualmente.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-3 mt-4">
            <Button variant="outline" onClick={() => setIsConfirmDiscardOpen(false)} className="w-full sm:w-1/2 rounded-xl">Mantener Venta</Button>
            <Button onClick={resetForm} className="w-full sm:w-1/2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold">Sí, Descartar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
