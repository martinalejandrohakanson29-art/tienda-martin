"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Plus, Search, User, Trash2, ShoppingCart, Loader2, CreditCard, Phone, FileText, 
  Calendar as CalendarIcon, ClipboardList, CheckCircle2, AlertTriangle,
  RefreshCcw, Copy, Square, CheckSquare, Percent, Edit, History, Save, Database, Printer
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
import { 
  crearVentaMostrador, obtenerVentasPorFecha, marcarVentaComoRegistrada,
  actualizarVentaMostrador, obtenerHistorialVenta, actualizarPrecioArticuloDB
} from "@/app/actions/ventas-mostrador";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  ultimaModificacion?: string | null;
}

interface ItemVenta {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  stock: number; 
  ultimaModificacion?: string | null;
}

export default function VentasMostradorClient({ 
  articulosIniciales,
  vendedorNombre 
}: { 
  articulosIniciales: Articulo[],
  vendedorNombre: string 
}) {
  // --- ESTADOS GENERALES ---
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); 
  const [successMessage, setSuccessMessage] = useState("");
  const [ventasRealizadas, setVentasRealizadas] = useState<any[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [isLoadingVentas, setIsLoadingVentas] = useState(false);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // --- ESTADOS PARA NUEVA VENTA ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [items, setItems] = useState<ItemVenta[]>([]); 
  const [cliente, setCliente] = useState("Consumidor Final");
  const [interesTarjeta, setInteresTarjeta] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [info, setInfo] = useState("");
  const [cupon, setCupon] = useState("");
  const [transaccionId, setTransaccionId] = useState("");
  const [deCruzada, setDeCruzada] = useState("");
  const [paraCruzada, setParaCruzada] = useState("");
  
  const [email, setEmail] = useState("");
  const [eventoOffline, setEventoOffline] = useState(false);

  // --- ESTADOS PARA EDICIÓN Y AUDITORÍA ---
  const [isEditMainModalOpen, setIsEditMainModalOpen] = useState(false);
  const [isSearchEditModalOpen, setIsSearchEditModalOpen] = useState(false);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<any[]>([]);
  
  const [editVentaId, setEditVentaId] = useState("");
  const [editCliente, setEditCliente] = useState("");
  const [editMetodoPago, setEditMetodoPago] = useState("");
  const [editInteresTarjeta, setEditInteresTarjeta] = useState<number>(0);
  const [editItems, setEditItems] = useState<ItemVenta[]>([]);
  const [editDni, setEditDni] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editInfo, setEditInfo] = useState("");
  const [editCupon, setEditCupon] = useState("");
  const [editTransaccionId, setEditTransaccionId] = useState("");
  const [editDeCruzada, setEditDeCruzada] = useState("");
  const [editParaCruzada, setEditParaCruzada] = useState("");
  
  const [editEmail, setEditEmail] = useState("");
  const [editEventoOffline, setEditEventoOffline] = useState(false);
  const [ventaOriginalParaComparar, setVentaOriginalParaComparar] = useState<any>(null);

  // --- ESTADO PARA FILTRO OFFLINE ---
  const [mostrarSoloOffline, setMostrarSoloOffline] = useState(false);

  // --- ESTADOS PARA EDICIÓN DE PRECIO EN BASE DE DATOS ---
  const [isPriceDbModalOpen, setIsPriceDbModalOpen] = useState(false);
  const [priceDbItem, setPriceDbItem] = useState<Articulo | null>(null);
  const [newDbPrice, setNewDbPrice] = useState<number>(0);
  const [isUpdatingDbPrice, setIsUpdatingDbPrice] = useState(false);

  // --- NUEVOS ESTADOS PARA ACTUALIZACIÓN RÁPIDA DE PRECIO ---
  const [isFastUpdateDbModalOpen, setIsFastUpdateDbModalOpen] = useState(false);
  const [fastUpdateData, setFastUpdateData] = useState<{id: string, nombre: string, oldPrice: number, newPrice: number} | null>(null);

  // --- EFECTOS ---
  useEffect(() => {
    setArticulos(articulosIniciales);
  }, [articulosIniciales]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "+" && !isModalOpen && !isEditMainModalOpen && !isSearchEditModalOpen && !isPriceDbModalOpen && !isFastUpdateDbModalOpen) {
        e.preventDefault();
        setIsModalOpen(true);
      }
      if (e.key === "+" && isEditMainModalOpen && !isSearchEditModalOpen && !isPriceDbModalOpen && !isFastUpdateDbModalOpen) {
        e.preventDefault();
        setIsSearchEditModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, isEditMainModalOpen, isSearchEditModalOpen, isPriceDbModalOpen, isFastUpdateDbModalOpen]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    cargarVentas(fechaFiltro);
  }, [fechaFiltro]);

  // --- FUNCIONES COMUNES ---
  const cargarVentas = async (fecha: string) => {
    setIsLoadingVentas(true);
    const res = await obtenerVentasPorFecha(fecha);
    if (res.success) {
      setVentasRealizadas(res.data || []);
    }
    setIsLoadingVentas(false);
  };

  const copiarAlPortapapeles = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
  };

  const mostrarMensajeExito = (mensaje: string) => {
    setSuccessMessage(mensaje);
    setShowSuccess(true);
  }

  const searchResults = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    const queryWords = searchTerm.toLowerCase().trim().split(/\s+/);
    return articulos.filter(art => {
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
  }, [searchTerm, articulos]);

  const ventasFiltradas = ventasRealizadas.filter(v => 
    mostrarSoloOffline ? v.eventoOffline === true : true
  );

  // --- FUNCIONES NUEVA VENTA ---
  const agregarProductoAVenta = (prod: Articulo) => {
    const existe = items.find(item => item.id === prod.id);
    if (existe) {
      setItems(items.map(item => 
        item.id === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unit } : item
      ));
    } else {
      setItems([...items, { 
        id: prod.id, 
        nombre: prod.nombre, 
        cantidad: 1, 
        precio_unit: Number(prod.precio), 
        subtotal: Number(prod.precio), 
        stock: prod.stock,
        ultimaModificacion: prod.ultimaModificacion 
      }]);
    }
    setIsModalOpen(false);
    setSearchTerm("");
  };

  const totalBase = items.reduce((acc, item) => acc + item.subtotal, 0);
  const totalConInteres = totalBase * (1 + (interesTarjeta / 100));

  const handleFinalizarVenta = async () => {
    if (metodoPago.includes("Tarjeta") && (!dni.trim() || !telefono.trim() || !cupon.trim() || !transaccionId.trim())) { 
      alert("DNI, Teléfono, N° Cupón y Transacción son OBLIGATORIOS para pagos con Tarjeta."); return; 
    }
    if (metodoPago === "Cruzada" && (!deCruzada.trim() || !paraCruzada.trim())) { alert("'De' y 'Para' obligatorios."); return; }

    const clienteFinal = metodoPago.includes("Tarjeta") ? dni : cliente;

    try {
      setIsSubmitting(true);
      const resultado = await crearVentaMostrador({
        cliente: clienteFinal, vendedor: vendedorNombre, total: totalBase,
        interes: metodoPago === "Tarjeta de Crédito" ? interesTarjeta : 0,
        totalFinal: metodoPago === "Tarjeta de Crédito" ? totalConInteres : totalBase,
        items, metodo_pago: metodoPago, dni, telefono, info, cupon, transaccionId, de: deCruzada, para: paraCruzada,
        email, eventoOffline
      });
      if (resultado.success) {
        mostrarMensajeExito("¡Venta registrada con éxito!");
        setArticulos(prev => prev.map(art => {
          const itemVendido = items.find(i => i.id === art.id);
          if (itemVendido) {
            return { ...art, stock: art.stock - itemVendido.cantidad };
          }
          return art;
        }));

        resetForm();
        cargarVentas(fechaFiltro);
      } else { alert("Error al guardar: " + resultado.error); }
    } catch (error) { alert("Ocurrió un error inesperado."); } finally { setIsSubmitting(false); }
  };

  const resetForm = () => {
    setItems([]); setCliente("Consumidor Final"); setMetodoPago("Efectivo"); setDni(""); setTelefono("");
    setInfo(""); setCupon(""); setTransaccionId(""); setDeCruzada(""); setParaCruzada(""); setInteresTarjeta(0);
    setEmail(""); setEventoOffline(false);
    setIsFinalizarModalOpen(false); setIsConfirmDiscardOpen(false);
  };

  const handleMarcarRegistrada = async (id: string) => {
    setVentasRealizadas(prev => prev.map(v => v.id === id ? { ...v, registrada: true } : v));
    const res = await marcarVentaComoRegistrada(id);
    if (!res.success) { alert("No se pudo actualizar"); cargarVentas(fechaFiltro); }
  };

  // --- FUNCIONES EDICIÓN DE VENTA ---
  const totalBaseEdit = editItems.reduce((acc, item) => acc + item.subtotal, 0);
  const totalConInteresEdit = totalBaseEdit * (1 + (editInteresTarjeta / 100));

  const abrirModalEdicion = (venta: any) => {
    setVentaOriginalParaComparar(venta);
    setEditVentaId(venta.id);
    setEditCliente(venta.cliente || "");
    setEditMetodoPago(venta.metodo_pago || "Efectivo");
    setEditInteresTarjeta(Number(venta.interes) || 0);
    setEditDni(venta.dni || "");
    setEditTelefono(venta.telefono || "");
    setEditInfo(venta.info || "");
    setEditCupon(venta.cupon || "");
    setEditTransaccionId(venta.transaccionId || "");
    setEditDeCruzada(venta.de || "");
    setEditParaCruzada(venta.para || "");
    setEditEmail(venta.email || "");
    setEditEventoOffline(venta.eventoOffline || false);
    
    setEditItems(venta.items.map((i: any) => {
      const articuloBase = articulos.find(a => a.id === i.productoId);
      return {
        id: i.productoId, nombre: i.nombre, cantidad: i.cantidad,
        precio_unit: Number(i.precio_unit), subtotal: Number(i.subtotal),
        stock: articuloBase ? articuloBase.stock : 0,
        ultimaModificacion: articuloBase?.ultimaModificacion || null
      };
    }));
    setIsEditMainModalOpen(true);
  };

  const agregarProductoEdicion = (prod: Articulo) => {
    const existe = editItems.find(item => item.id === prod.id);
    if (existe) {
      setEditItems(editItems.map(item => 
        item.id === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unit } : item
      ));
    } else {
      setEditItems([...editItems, { 
        id: prod.id, 
        nombre: prod.nombre, 
        cantidad: 1, 
        precio_unit: Number(prod.precio), 
        subtotal: Number(prod.precio), 
        stock: prod.stock,
        ultimaModificacion: prod.ultimaModificacion
      }]);
    }
    setIsSearchEditModalOpen(false);
    setSearchTerm("");
  };

  const handleGuardarEdicion = async () => {
    if (editMetodoPago.includes("Tarjeta") && (!editDni.trim() || !editTelefono.trim() || !editCupon.trim() || !editTransaccionId.trim())) { 
      alert("DNI, Teléfono, N° Cupón y Transacción son OBLIGATORIOS para pagos con Tarjeta."); return; 
    }
    if (editMetodoPago === "Cruzada" && (!editDeCruzada.trim() || !editParaCruzada.trim())) { alert("'De' y 'Para' son obligatorios para transferencias Cruzadas."); return; }

    let cambios = [];
    if (ventaOriginalParaComparar.cliente !== editCliente) cambios.push(`Cliente modificado`);
    if (ventaOriginalParaComparar.metodo_pago !== editMetodoPago) cambios.push(`Método modificado`);
    if (ventaOriginalParaComparar.email !== editEmail) cambios.push(`Email modificado`);
    if (ventaOriginalParaComparar.eventoOffline !== editEventoOffline) cambios.push(`Evento offline modificado`);
    if (Number(ventaOriginalParaComparar.totalFinal) !== (editMetodoPago === "Tarjeta de Crédito" ? totalConInteresEdit : totalBaseEdit)) {
        cambios.push(`Total alterado`);
    }
    if (cambios.length === 0) cambios.push("Se actualizaron artículos o datos menores.");
    const resumenCambios = cambios.join(" | ");

    try {
      setIsSubmitting(true);
      const resultado = await actualizarVentaMostrador(
        editVentaId,
        {
          cliente: editMetodoPago.includes("Tarjeta") ? editDni : editCliente,
          total: totalBaseEdit,
          interes: editMetodoPago === "Tarjeta de Crédito" ? editInteresTarjeta : 0,
          totalFinal: editMetodoPago === "Tarjeta de Crédito" ? totalConInteresEdit : totalBaseEdit,
          metodo_pago: editMetodoPago,
          dni: editDni, telefono: editTelefono, info: editInfo, cupon: editCupon, 
          transaccionId: editTransaccionId, de: editDeCruzada, para: editParaCruzada,
          email: editEmail,
          eventoOffline: editEventoOffline,
          items: editItems
        },
        vendedorNombre,
        resumenCambios
      );
      
      if (resultado.success) {
        mostrarMensajeExito("¡Venta modificada con éxito!");
        setArticulos(prev => prev.map(art => {
          let nuevoStock = art.stock;
          const oldItem = ventaOriginalParaComparar.items.find((i: any) => i.productoId === art.id);
          if (oldItem) nuevoStock += oldItem.cantidad;
          const newItem = editItems.find(i => i.id === art.id);
          if (newItem) nuevoStock -= newItem.cantidad;
          return { ...art, stock: nuevoStock };
        }));

        setIsEditMainModalOpen(false);
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

  const abrirModalHistorial = async (ventaId: string) => {
    setHistorialActual([]);
    setIsHistorialModalOpen(true);
    const res = await obtenerHistorialVenta(ventaId);
    if (res.success && res.data) {
      setHistorialActual(res.data);
    }
  };

  // --- FUNCIONES: MODIFICAR PRECIO EN BASE DE DATOS (MODAL CLÁSICO) ---

  const abrirModalPrecioDB = (idArticulo: string, precioInputActual: number) => {
    const articulo = articulos.find(a => a.id === idArticulo);
    if (articulo) {
      setPriceDbItem(articulo);
      setNewDbPrice(precioInputActual); 
      setIsPriceDbModalOpen(true);
    }
  };

  const handleUpdateDbPrice = async () => {
    if (!priceDbItem) return;
    setIsUpdatingDbPrice(true);
    
    const res = await actualizarPrecioArticuloDB(priceDbItem.id, newDbPrice, vendedorNombre);
    
    if (res.success) {
      const nowStr = new Date().toISOString(); 
      
      setArticulos(prev => prev.map(a => a.id === priceDbItem.id ? { ...a, precio: newDbPrice, ultimaModificacion: nowStr } : a));
      setItems(prev => prev.map(i => i.id === priceDbItem.id ? { ...i, precio_unit: newDbPrice, subtotal: i.cantidad * newDbPrice, ultimaModificacion: nowStr } : i));
      setEditItems(prev => prev.map(i => i.id === priceDbItem.id ? { ...i, precio_unit: newDbPrice, subtotal: i.cantidad * newDbPrice, ultimaModificacion: nowStr } : i));
      
      mostrarMensajeExito("¡Precio base guardado en la Base de Datos!");
      setIsPriceDbModalOpen(false);
    } else {
      alert("No se pudo guardar el precio: " + res.error);
    }
    
    setIsUpdatingDbPrice(false);
  };

  // --- FUNCIONES: ACTUALIZACIÓN RÁPIDA DE PRECIO (BOTÓN DERECHO) ---
  const abrirModalFastUpdate = (idArticulo: string, precioInputActual: number) => {
    const articulo = articulos.find(a => a.id === idArticulo);
    if (articulo) {
      setFastUpdateData({
        id: articulo.id,
        nombre: articulo.nombre,
        oldPrice: articulo.precio,
        newPrice: precioInputActual
      });
      setIsFastUpdateDbModalOpen(true);
    }
  };

  const handleFastUpdateDbPrice = async () => {
    if (!fastUpdateData) return;
    setIsUpdatingDbPrice(true);
    
    const res = await actualizarPrecioArticuloDB(fastUpdateData.id, fastUpdateData.newPrice, vendedorNombre);
    
    if (res.success) {
      const nowStr = new Date().toISOString(); 

      setArticulos(prev => prev.map(a => a.id === fastUpdateData.id ? { ...a, precio: fastUpdateData.newPrice, ultimaModificacion: nowStr } : a));
      setItems(prev => prev.map(i => i.id === fastUpdateData.id ? { ...i, precio_unit: fastUpdateData.newPrice, subtotal: i.cantidad * fastUpdateData.newPrice, ultimaModificacion: nowStr } : i));
      setEditItems(prev => prev.map(i => i.id === fastUpdateData.id ? { ...i, precio_unit: fastUpdateData.newPrice, subtotal: i.cantidad * fastUpdateData.newPrice, ultimaModificacion: nowStr } : i));
      
      mostrarMensajeExito("¡Precio actualizado en la Base de Datos con éxito!");
      setIsFastUpdateDbModalOpen(false);
    } else {
      alert("No se pudo guardar el precio: " + res.error);
    }
    
    setIsUpdatingDbPrice(false);
  };

  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <>
      {/* 1. EL TICKET (Solo visible al momento de imprimir con print:block) */}
      <TicketImpresion 
        items={items} 
        total={metodoPago === "Tarjeta de Crédito" ? totalConInteres : totalBase} 
      />

      {/* 2. TU INTERFAZ NORMAL (Se oculta al imprimir con print:hidden) */}
      <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden select-none relative print:hidden">
        
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
              <span className="font-bold">{successMessage}</span>
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
            <TabsList className="bg-slate-100/50 p-1 w-full flex justify-start relative">
              <TabsTrigger value="registrar" className="gap-2 px-6"><ShoppingCart className="h-4 w-4" /> Registrar Venta</TabsTrigger>
              <TabsTrigger value="listado" className="gap-2 px-6"><ClipboardList className="h-4 w-4" /> Listado de Ventas</TabsTrigger>
              <TabsTrigger value="gestion" className="gap-2 px-6 ml-auto bg-amber-50 text-amber-700 hover:bg-amber-100 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 border border-transparent data-[state=active]:border-amber-200">
                <Edit className="h-4 w-4" /> Gestión y Edición
              </TabsTrigger>
            </TabsList>
          </div>

          {/* --- PESTAÑA: REGISTRAR VENTA --- */}
          <TabsContent value="registrar" className="flex-grow flex flex-col overflow-hidden m-0">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden">
              <section className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col md:flex-row gap-6 items-end shadow-sm flex-shrink-0">
                <div className="flex-grow space-y-1.5 max-w-md">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente / Razón Social</Label>
                  <div className="relative">
                    <Input value={cliente} onChange={(e) => setCliente(e.target.value)} className="pl-9 h-10 bg-slate-50/50 border-slate-200" />
                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1.5 w-32">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">% Int. Tarjeta</Label>
                  <div className="relative">
                    <Input type="number" value={interesTarjeta} onChange={(e) => setInteresTarjeta(Number(e.target.value))} className="pl-8 h-10 bg-slate-50/50 border-slate-200 font-bold text-blue-600" />
                    <Percent className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </div>

                <div className="flex-shrink-0 ml-auto text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total a Cobrar</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">$ {totalConInteres.toLocaleString('es-AR')}</span>
                  {interesTarjeta > 0 && <p className="text-[10px] text-slate-400 font-bold">Base: $ {totalBase.toLocaleString('es-AR')}</p>}
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
                          <TableHead className="text-center text-[10px] font-bold uppercase py-3">Precio Unit.</TableHead>
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
                                  <div className="flex items-center gap-2">
                                    {/* APLICAMOS CLICK AL NOMBRE */}
                                    <span 
                                      onClick={() => copiarAlPortapapeles(item.nombre)} 
                                      className="text-base cursor-pointer hover:text-blue-600 transition-colors" 
                                      title="Copiar Nombre"
                                    >
                                      {item.nombre}
                                    </span>
                                    <span className={`text-xs font-black px-2 py-1 rounded-md border whitespace-nowrap ${item.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : item.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                                      Stock: {item.stock}
                                    </span>
                                  </div>
                                  {/* APLICAMOS CLICK AL ID */}
                                  <span 
                                    onClick={() => copiarAlPortapapeles(item.id)} 
                                    className="text-[9px] text-slate-400 font-mono uppercase cursor-pointer hover:text-blue-600 transition-colors w-fit block" 
                                    title="Copiar ID"
                                  >
                                    {item.id}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center py-3">
                                <Input type="number" value={item.cantidad} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.precio_unit} : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                              </TableCell>
                              <TableCell className="text-center py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" 
                                    title="Editar precio base en el sistema" 
                                    onClick={() => abrirModalPrecioDB(item.id, item.precio_unit)}
                                  >
                                    <Database className="h-4 w-4" />
                                  </Button>
                                  <span className="text-slate-400 text-xs ml-1">$</span>
                                  <Input type="number" value={item.precio_unit} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, precio_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value)} : i))} className={`w-28 h-8 ${inputSinFlechas}`} />
                                  
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 text-slate-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" 
                                    title="Guardar este precio en la Base de Datos" 
                                    onClick={() => abrirModalFastUpdate(item.id, item.precio_unit)}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>

                                  {/* NUEVO: FECHA DE ÚLTIMA MODIFICACIÓN */}
                                  {item.ultimaModificacion && (
                                    <div className="flex flex-col items-center ml-2 border-l border-slate-200 pl-2">
                                      <span className="text-[8px] text-slate-400 font-bold uppercase mb-0.5">Modificado</span>
                                      <span className="text-[10px] text-slate-600 font-mono bg-slate-100 px-1 rounded" title="Última actualización de precio en DB">
                                        {new Date(item.ultimaModificacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right py-3 font-bold text-slate-700">
                                $ {item.subtotal.toLocaleString('es-AR')}
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
                <Button variant="ghost" onClick={() => setIsConfirmDiscardOpen(true)} className="text-slate-500 hover:text-red-500">Descartar Venta</Button>
                
                {/* --- NUEVO BOTÓN PARA IMPRIMIR PRESUPUESTO --- */}
                <Button 
                  variant="outline" 
                  onClick={() => window.print()} 
                  disabled={items.length === 0} 
                  className="gap-2 text-slate-700 border-slate-300 hover:bg-slate-50 rounded-xl"
                >
                  <Printer className="h-4 w-4" /> Imprimir Presupuesto
                </Button>

                <Button onClick={() => setIsFinalizarModalOpen(true)} disabled={items.length === 0 || isSubmitting} className="px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">Finalizar Venta</Button>
              </div>
            </footer>
          </TabsContent>

          {/* --- PESTAÑA: LISTADO DE VENTAS --- */}
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
                      <Button variant="outline" size="icon" onClick={() => cargarVentas(fechaFiltro)} disabled={isLoadingVentas} className="rounded-xl border-slate-200 h-10 w-10 text-slate-400 hover:text-blue-600 transition-all">
                        <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? 'animate-spin' : ''}`} />
                      </Button>
                      
                      <div className="flex items-center space-x-2 border-l pl-4 border-slate-200 ml-2 h-10">
                        <input 
                          type="checkbox" 
                          id="filterOffline" 
                          checked={mostrarSoloOffline} 
                          onChange={(e) => setMostrarSoloOffline(e.target.checked)} 
                          className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-600"
                        />
                        <Label htmlFor="filterOffline" className="text-xs font-bold text-slate-600 cursor-pointer">
                          Solo Offline
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Total Filtrado (Final)</p>
                  <p className="text-xl font-black text-slate-900">$ {ventasFiltradas.reduce((acc, v) => acc + Number(v.totalFinal || v.total), 0).toLocaleString('es-AR')}</p>
                </div>
              </div>

              <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-y-auto h-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Hora</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Cliente</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Artículos</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Cupón / De</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Trans. / Para</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Info Extra</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                        <TableHead className="text-center text-[10px] font-bold uppercase py-3 w-20">Reg.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventasFiltradas.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="py-20 text-center text-slate-400 italic">No se encontraron ventas con estos filtros</TableCell></TableRow>
                      ) : (
                        ventasFiltradas.map((v) => (
                          <TableRow key={v.id} className="hover:bg-slate-50/50 align-top">
                            <TableCell className="text-xs font-mono text-slate-500 py-4">{new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                            
                            <TableCell className="font-medium text-slate-700 py-4">
                              {v.cliente}
                              {v.email && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{v.email}</div>}
                              {v.eventoOffline && <span className="mt-1 inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-bold rounded-full uppercase">Offline Event</span>}
                            </TableCell>
                            
                            <TableCell className="py-4">
                              <div className="flex flex-col gap-1.5 min-w-[250px]">
                                {v.items?.map((item: any) => (
                                  <div key={item.id} className="text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 flex flex-col group relative">
                                    <div className="flex justify-between items-start gap-3">
                                      <div className="flex flex-col flex-grow">
                                        {/* CLICK EN NOMBRE (LISTADO) */}
                                        <span 
                                          onClick={() => copiarAlPortapapeles(item.nombre)} 
                                          className="font-bold text-slate-800 uppercase cursor-pointer hover:text-blue-600 transition-colors block" 
                                          title="Copiar Nombre"
                                        >
                                          {item.nombre}
                                        </span>
                                        {/* CLICK EN ID (LISTADO) */}
                                        <span 
                                          onClick={() => copiarAlPortapapeles(item.productoId)} 
                                          className="text-[9px] text-slate-400 font-mono uppercase cursor-pointer hover:text-blue-600 mt-0.5 w-fit block transition-colors" 
                                          title="Copiar ID"
                                        >
                                          {item.productoId}
                                        </span>
                                      </div>
                                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black text-[10px]">x{item.cantidad}</span>
                                        <span className="text-slate-700 font-bold whitespace-nowrap">$ {Number(item.subtotal || 0).toLocaleString('es-AR')}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{v.metodo_pago}</span>
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono text-slate-600">
                               {v.metodo_pago === 'Cruzada' ? (v.de || "-") : (v.cupon || "-")}
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono text-slate-600">
                               {v.metodo_pago === 'Cruzada' ? (v.para || "-") : (v.transaccionId || "-")}
                            </TableCell>
                            <TableCell className="py-4 text-xs text-slate-500 max-w-[150px] truncate" title={v.info || ""}>
                               {v.info || "-"}
                            </TableCell>
                            <TableCell className="text-right font-black text-slate-900 py-4">$ {(v.totalFinal || v.total).toLocaleString('es-AR')}</TableCell>
                            <TableCell className="py-4 text-center">
                              <button disabled={v.registrada} onClick={() => handleMarcarRegistrada(v.id)} className={`p-2 rounded-xl transition-all ${v.registrada ? 'text-green-600 bg-green-50 cursor-default border border-green-100' : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50 border border-transparent'}`}>
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

          {/* --- PESTAÑA: GESTIÓN Y EDICIÓN --- */}
          <TabsContent value="gestion" className="flex-grow flex flex-col overflow-hidden m-0 select-text">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden">
              <div className="flex items-center justify-between bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Filtrar por Fecha</Label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-amber-500" />
                        <Input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="pl-9 h-10 w-48 bg-white border-amber-200 cursor-pointer text-amber-900" />
                      </div>
                      <Button variant="outline" size="icon" onClick={() => cargarVentas(fechaFiltro)} disabled={isLoadingVentas} className="rounded-xl border-amber-200 h-10 w-10 text-amber-500 hover:text-amber-700 hover:bg-white transition-all">
                        <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-xs text-amber-700 font-bold flex items-center gap-2 justify-end"><AlertTriangle className="h-4 w-4"/> Área de Modificaciones</p>
                   <p className="text-[10px] text-amber-600">Las ediciones quedarán registradas en el historial.</p>
                </div>
              </div>

              <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-y-auto h-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="text-[10px] font-bold uppercase py-3">ID / Hora</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Cliente</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Cupón / De</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Trans. / Para</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Info Extra</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Vendedor</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Acciones Administrativas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventasRealizadas.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="py-20 text-center text-slate-400 italic">No hay ventas para gestionar en esta fecha</TableCell></TableRow>
                      ) : (
                        ventasRealizadas.map((v) => (
                          <TableRow key={v.id} className="hover:bg-slate-50/50">
                            <TableCell className="py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-mono text-slate-500">{new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span className="text-[9px] text-slate-400 font-mono mt-1" title={v.id}>...{v.id.slice(-6)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-bold text-slate-700 py-4">{v.cliente}</TableCell>
                            <TableCell className="py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{v.metodo_pago}</span>
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono text-slate-600">
                               {v.metodo_pago === 'Cruzada' ? (v.de || "-") : (v.cupon || "-")}
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono text-slate-600">
                               {v.metodo_pago === 'Cruzada' ? (v.para || "-") : (v.transaccionId || "-")}
                            </TableCell>
                            <TableCell className="py-4 text-xs text-slate-500 max-w-[150px] truncate" title={v.info || ""}>
                               {v.info || "-"}
                            </TableCell>
                            <TableCell className="font-black text-slate-900 py-4">$ {(v.totalFinal || v.total).toLocaleString('es-AR')}</TableCell>
                            <TableCell className="text-xs text-slate-500 py-4">{v.vendedor}</TableCell>
                            <TableCell className="py-4 text-right space-x-2 whitespace-nowrap">
                               <Button size="sm" variant="outline" onClick={() => abrirModalEdicion(v)} className="border-amber-200 text-amber-700 hover:bg-amber-50">
                                 <Edit className="h-4 w-4 mr-2" /> Editar Venta
                               </Button>
                               <Button size="sm" variant="secondary" onClick={() => abrirModalHistorial(v.id)} className="bg-slate-100 text-slate-600 hover:bg-slate-200">
                                 <History className="h-4 w-4 mr-2" /> Historial
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

        {/* --- MODALES COMUNES --- */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
            <div className="p-6 bg-white border-b relative">
              <DialogTitle className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-blue-600" /> Buscador Instantáneo</DialogTitle>
              <div className="relative"><Search className="absolute left-4 top-3 h-5 w-5 text-slate-400" /><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Escribe el nombre o ID..." className="flex h-12 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-12 py-6 text-base outline-none focus:border-blue-500 transition-all" /></div>
            </div>
            <div className="h-[500px] overflow-y-auto p-4 bg-white">
              {searchResults.map((prod) => (
                <button key={prod.id} onClick={() => agregarProductoAVenta(prod)} className="w-full flex items-center justify-between p-3.5 hover:bg-blue-50/50 rounded-xl group transition-all mb-2 border border-transparent hover:border-blue-100">
                  <div className="flex items-center gap-4">
                    <Plus className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                    <div className="text-left flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-slate-900 leading-tight">{prod.nombre}</p>
                        <span className={`text-sm font-black px-2 py-0.5 rounded-md border ${prod.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : prod.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                          Stock: {prod.stock}
                        </span>
                      </div>
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
                  <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                  <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                  <option value="Cruzada">Cruzada</option>
                </select>
              </div>
              
              {(metodoPago.includes("Tarjeta")) && (
                <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 animate-in fade-in">
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">DNI <span className="text-red-500">*</span></Label><Input value={dni} onChange={(e) => setDni(e.target.value)} className="bg-white border-blue-200" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">Teléfono <span className="text-red-500">*</span></Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="bg-white border-blue-200" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">N° Cupón <span className="text-red-500">*</span></Label><Input value={cupon} onChange={(e) => setCupon(e.target.value)} className="bg-white border-blue-200" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">ID Transacción <span className="text-red-500">*</span></Label><Input value={transaccionId} onChange={(e) => setTransaccionId(e.target.value)} className="bg-white border-blue-200" /></div>
                </div>
              )}

              {metodoPago === "Cruzada" && (
                <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-100 animate-in fade-in">
                  <div className="space-y-2"><Label className="text-xs font-bold text-amber-700">De <span className="text-red-500">*</span></Label><Input value={deCruzada} onChange={(e) => setDeCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Origen" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-amber-700">Para <span className="text-red-500">*</span></Label><Input value={paraCruzada} onChange={(e) => setParaCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Destino" /></div>
                </div>
              )}
              
              <div className="grid grid-cols-1 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Email (Opcional)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@correo.com" className="bg-white border-slate-200" />
                </div>
                <div className="flex items-center space-x-3 pt-1">
                  <input 
                    type="checkbox" 
                    id="eventoOffline" 
                    checked={eventoOffline} 
                    onChange={(e) => setEventoOffline(e.target.checked)} 
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <Label htmlFor="eventoOffline" className="text-sm font-bold text-slate-700 cursor-pointer">
                    Marcar como Evento Offline (Meta Ads)
                  </Label>
                </div>
              </div>
              
              <div className="space-y-2"><Label className="text-xs font-bold text-slate-500 uppercase">Información Extra</Label><Input value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Notas..." /></div>
            </div>
            <DialogFooter className="gap-3">
              <Button variant="ghost" onClick={() => setIsFinalizarModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleFinalizarVenta} disabled={isSubmitting} className="bg-blue-600 text-white px-8 rounded-xl">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar y Guardar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isConfirmDiscardOpen} onOpenChange={setIsConfirmDiscardOpen}>
          <DialogContent className="sm:max-w-[400px] rounded-3xl p-6">
            <DialogHeader><div className="mx-auto bg-red-100 text-red-600 p-3 rounded-full w-fit mb-4"><AlertTriangle className="h-6 w-6" /></div><DialogTitle className="text-center text-xl font-bold">¿Descartar Venta?</DialogTitle></DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-3 mt-4"><Button variant="outline" onClick={() => setIsConfirmDiscardOpen(false)} className="w-full">Mantener</Button><Button onClick={resetForm} className="w-full bg-red-600 text-white">Sí, Descartar</Button></DialogFooter>
          </DialogContent>
        </Dialog>


        {/* --- MODALES DE EDICIÓN Y AUDITORÍA --- */}
        <Dialog open={isEditMainModalOpen} onOpenChange={setIsEditMainModalOpen}>
          <DialogContent className="max-w-[1200px] h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl border-2 border-amber-200 shadow-2xl">
            <DialogHeader className="p-6 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-900">
                <Edit className="h-5 w-5" /> Editando Venta
              </DialogTitle>
              <DialogDescription className="text-amber-700">Modifica los artículos, el cliente o la forma de pago detallada.</DialogDescription>
            </DialogHeader>
            
            <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-6 bg-slate-50/50">
              <section className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-4 shadow-sm">
                <div className="flex gap-4 items-end flex-wrap">
                  <div className="space-y-1.5 flex-grow min-w-[200px]">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Cliente / Razón Social</Label>
                    <Input value={editCliente} onChange={(e) => setEditCliente(e.target.value)} className="bg-slate-50" />
                  </div>
                  <div className="space-y-1.5 w-48">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Método Pago</Label>
                    <select value={editMetodoPago} onChange={(e) => setEditMetodoPago(e.target.value)} className="w-full h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                      <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                      <option value="Cruzada">Cruzada</option>
                    </select>
                  </div>
                  {editMetodoPago === "Tarjeta de Crédito" && (
                    <div className="space-y-1.5 w-32">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase">% Interés</Label>
                      <Input type="number" value={editInteresTarjeta} onChange={(e) => setEditInteresTarjeta(Number(e.target.value))} className="font-bold text-blue-600 bg-slate-50" />
                    </div>
                  )}
                  <div className="text-right bg-amber-50 p-2 px-4 rounded-xl border border-amber-100 ml-auto">
                    <span className="text-[10px] font-bold text-amber-700 uppercase block mb-0.5">Total Actualizado</span>
                    <span className="text-2xl font-black text-amber-900">$ {(editMetodoPago === "Tarjeta de Crédito" ? totalConInteresEdit : totalBaseEdit).toLocaleString('es-AR')}</span>
                  </div>
                </div>

                {(editMetodoPago.includes("Tarjeta")) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 animate-in fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">DNI <span className="text-red-500">*</span></Label>
                      <Input value={editDni} onChange={(e) => setEditDni(e.target.value)} className="bg-white border-blue-200" placeholder="Obligatorio" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">Teléfono <span className="text-red-500">*</span></Label>
                      <Input value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} className="bg-white border-blue-200" placeholder="Obligatorio" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">N° Cupón <span className="text-red-500">*</span></Label>
                      <Input value={editCupon} onChange={(e) => setEditCupon(e.target.value)} className="bg-white border-blue-200" placeholder="Obligatorio" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">ID Transacción <span className="text-red-500">*</span></Label>
                      <Input value={editTransaccionId} onChange={(e) => setEditTransaccionId(e.target.value)} className="bg-white border-blue-200" placeholder="Obligatorio" />
                    </div>
                  </div>
                )}

                {editMetodoPago === "Cruzada" && (
                  <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200 animate-in fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-amber-800">De <span className="text-red-500">*</span></Label>
                      <Input value={editDeCruzada} onChange={(e) => setEditDeCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Origen" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-amber-800">Para <span className="text-red-500">*</span></Label>
                      <Input value={editParaCruzada} onChange={(e) => setParaCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Destino" />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 w-full">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase">Información Extra / Notas</Label>
                  <Input value={editInfo} onChange={(e) => setEditInfo(e.target.value)} className="bg-slate-50" placeholder="Agregar alguna nota sobre esta venta o edición..." />
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center w-full bg-slate-100/50 p-3 rounded-xl border border-slate-200 mt-2">
                  <div className="space-y-1.5 flex-grow w-full md:w-auto">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Email (Opcional)</Label>
                    <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="bg-white" placeholder="cliente@correo.com" />
                  </div>
                  <div className="flex items-center space-x-3 w-full md:w-auto mt-4 md:mt-0 px-2">
                    <input 
                      type="checkbox" 
                      id="editEventoOffline" 
                      checked={editEventoOffline} 
                      onChange={(e) => setEditEventoOffline(e.target.checked)} 
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                    />
                    <Label htmlFor="editEventoOffline" className="text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap">
                      Evento Offline (Meta Ads)
                    </Label>
                  </div>
                </div>
              </section>

              <section className="flex-grow flex flex-col gap-3 min-h-[300px]">
                <Button onClick={() => setIsSearchEditModalOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white gap-2 px-6 rounded-xl w-fit">
                  <Plus className="h-4 w-4" /> Añadir Artículo a esta Venta
                </Button>
                <div className="flex-grow bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-100">
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-center">Precio Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-slate-700 py-3">
                             <div className="flex flex-col gap-1">
                               <div className="flex items-center gap-2">
                                 {/* CLICK EN NOMBRE (MODO EDICIÓN) */}
                                 <span 
                                   onClick={() => copiarAlPortapapeles(item.nombre)} 
                                   className="text-sm cursor-pointer hover:text-amber-600 transition-colors"
                                   title="Copiar Nombre"
                                 >
                                   {item.nombre}
                                 </span>
                                 <span className={`text-xs font-black px-2 py-1 rounded-md border whitespace-nowrap ${item.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : item.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                                   Stock: {item.stock}
                                 </span>
                               </div>
                               {/* CLICK EN ID (MODO EDICIÓN) */}
                               <span 
                                 onClick={() => copiarAlPortapapeles(item.id)} 
                                 className="text-[9px] text-slate-400 font-mono uppercase cursor-pointer hover:text-amber-600 transition-colors w-fit block" 
                                 title="Copiar ID"
                               >
                                 {item.id}
                               </span>
                             </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input type="number" value={item.cantidad} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? {...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.precio_unit} : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" 
                                title="Editar precio base en el sistema" 
                                onClick={() => abrirModalPrecioDB(item.id, item.precio_unit)}
                              >
                                <Database className="h-4 w-4" />
                              </Button>
                              <span className="text-slate-400 text-xs ml-1">$</span>
                              <Input type="number" value={item.precio_unit} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? {...i, precio_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value)} : i))} className={`w-28 h-8 ${inputSinFlechas}`} />
                              
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-slate-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" 
                                title="Guardar este precio en la Base de Datos" 
                                onClick={() => abrirModalFastUpdate(item.id, item.precio_unit)}
                              >
                                <Save className="h-4 w-4" />
                              </Button>

                              {/* NUEVO: FECHA DE ÚLTIMA MODIFICACIÓN */}
                              {item.ultimaModificacion && (
                                <div className="flex flex-col items-center ml-2 border-l border-slate-200 pl-2">
                                  <span className="text-[8px] text-slate-400 font-bold uppercase mb-0.5">Modificado</span>
                                  <span className="text-[10px] text-slate-600 font-mono bg-slate-100 px-1 rounded" title="Última actualización de precio en DB">
                                    {new Date(item.ultimaModificacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-700">
                            $ {item.subtotal.toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="text-center"><Button variant="ghost" size="icon" onClick={() => setEditItems(editItems.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>

            <DialogFooter className="p-6 bg-white border-t border-slate-100 gap-3">
              <Button variant="ghost" onClick={() => setIsEditMainModalOpen(false)}>Cancelar Cambios</Button>
              <Button onClick={handleGuardarEdicion} disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 text-white px-8 rounded-xl font-bold flex gap-2">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4"/> Guardar Modificación</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isSearchEditModalOpen} onOpenChange={setIsSearchEditModalOpen}>
          <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-2 border-amber-400 shadow-2xl">
            <div className="p-6 bg-amber-50 border-b border-amber-200">
              <DialogTitle className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2"><Search className="h-4 w-4" /> Buscar Artículo (Modo Edición)</DialogTitle>
              <div className="relative"><Search className="absolute left-4 top-3 h-5 w-5 text-amber-500" /><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Escribe el nombre..." className="flex h-12 w-full rounded-xl border border-amber-200 bg-white px-12 py-6 text-base outline-none focus:border-amber-500" /></div>
            </div>
            <div className="h-[400px] overflow-y-auto p-4 bg-white">
              {searchResults.map((prod) => (
                <button key={prod.id} onClick={() => agregarProductoEdicion(prod)} className="w-full flex items-center justify-between p-3.5 hover:bg-amber-50 rounded-xl group border border-transparent hover:border-amber-200 mb-2">
                  <div className="flex items-center gap-4">
                    <Plus className="h-4 w-4 text-slate-400 group-hover:text-amber-600" />
                    <div className="text-left flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-slate-900 leading-tight">{prod.nombre}</p>
                        <span className={`text-sm font-black px-2 py-0.5 rounded-md border ${prod.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : prod.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                          Stock: {prod.stock}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono uppercase">ID: {prod.id}</p>
                    </div>
                  </div>
                  <p className="font-medium text-slate-900">$ {prod.precio.toLocaleString('es-AR')}</p>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isHistorialModalOpen} onOpenChange={setIsHistorialModalOpen}>
          <DialogContent className="sm:max-w-[600px] rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900"><History className="h-5 w-5 text-slate-500" /> Historial de la Venta</DialogTitle>
              <DialogDescription>Aquí verás todos los cambios realizados sobre este ticket.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4 max-h-[500px] overflow-y-auto">
              {historialActual.length === 0 ? (
                <div className="text-center text-slate-400 italic py-10">No hay modificaciones registradas para esta venta.</div>
              ) : (
                historialActual.map((auditoria) => (
                  <div key={auditoria.id} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-4 items-start">
                    <div className="bg-white p-2 border border-slate-200 rounded-lg"><User className="h-4 w-4 text-slate-400"/></div>
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

        {/* --- MODAL CLÁSICO: EDICIÓN DE PRECIO BASE EN DB --- */}
        <Dialog open={isPriceDbModalOpen} onOpenChange={setIsPriceDbModalOpen}>
          <DialogContent className="sm:max-w-[400px] rounded-3xl p-6 border-2 border-indigo-400 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
                <Database className="h-5 w-5 text-indigo-600" /> Modificar Precio Base
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Modificar precios de la <b>Base de Datos</b>. este cambio quedara registrado.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 space-y-5">
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col">
                <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider mb-1">Artículo Seleccionado</p>
                <p className="text-sm font-bold text-slate-900">{priceDbItem?.nombre}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1">ID: {priceDbItem?.id}</p>
                <p className="text-sm font-bold text-slate-900 mt-2">Precio Viejo: ${priceDbItem?.precio.toLocaleString('es-AR')}</p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nuevo Precio Base ($)</Label>
                <Input 
                  type="number" 
                  autoFocus
                  value={newDbPrice} 
                  onChange={(e) => setNewDbPrice(Number(e.target.value))} 
                  className="font-black text-xl h-12 border-indigo-200 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <DialogFooter className="gap-3 mt-2">
              <Button variant="ghost" onClick={() => setIsPriceDbModalOpen(false)} className="text-slate-500">Cancelar</Button>
              <Button onClick={handleUpdateDbPrice} disabled={isUpdatingDbPrice} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-6 shadow-md">
                {isUpdatingDbPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar en Sistema"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- NUEVO MODAL: ACTUALIZACIÓN RÁPIDA DE PRECIO DESDE EL INPUT --- */}
        <Dialog open={isFastUpdateDbModalOpen} onOpenChange={setIsFastUpdateDbModalOpen}>
          <DialogContent className="sm:max-w-[420px] rounded-3xl p-6 border-2 border-green-400 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-green-900">
                <Save className="h-5 w-5 text-green-600" /> Confirmar Cambio de Precio
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Confirmar modificacion del precio en <b>Base de Datos</b>?
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 space-y-4">
              <div className="p-4 bg-green-50/50 rounded-xl border border-green-100 flex flex-col items-center text-center">
                <p className="text-sm font-bold text-slate-900 mb-4">{fastUpdateData?.nombre}</p>
                
                <div className="flex items-center justify-center gap-6 w-full">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Precio anterior</span>
                    <span className="text-lg font-medium text-slate-500 line-through">${fastUpdateData?.oldPrice.toLocaleString('es-AR')}</span>
                  </div>
                  
                  <div className="bg-green-200 text-green-800 p-1.5 rounded-full">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  
                  <div className="flex flex-col">
                    <span className="text-[10px] text-green-700 font-bold uppercase mb-1">Precio nuevo</span>
                    <span className="text-2xl font-black text-green-700">${fastUpdateData?.newPrice.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-center text-slate-400 px-4">Esta acción registrará el cambio de precio en la auditoría del sistema.</p>
            </div>

            <DialogFooter className="gap-3 mt-2">
              <Button variant="ghost" onClick={() => setIsFastUpdateDbModalOpen(false)} className="text-slate-500">Cancelar</Button>
              <Button onClick={handleFastUpdateDbPrice} disabled={isUpdatingDbPrice} className="bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold px-8 shadow-md">
                {isUpdatingDbPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sí, Actualizar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
}

// --- NUEVO: COMPONENTE DE TICKET DE IMPRESIÓN (Solo visible al imprimir) ---
function TicketImpresion({ items, total }: { items: ItemVenta[], total: number }) {
  const fechaActual = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    // Solo visible al imprimir (print:block) y con fuente monoespaciada
    <div className="hidden print:block w-[58mm] font-mono text-black bg-white" style={{ margin: 0, padding: 0 }}>
      {/* Estilos específicos para resetear los márgenes de la impresora web */}
      <style type="text/css" media="print">
        {`
          @page { margin: 0; size: 58mm auto; }
          body { margin: 0; -webkit-print-color-adjust: exact; }
        `}
      </style>

      {/* Cabecera Genérica Hardcodeada */}
      <div className="text-center mb-2">
        <h1 className="text-lg font-bold leading-none mb-1">LA DESPENSA</h1>
        <p className="text-[10px] leading-none">AV. COLÓN 123 - CORDOBA</p>
      </div>

      <p className="text-center text-xs mb-1">--------------------------------</p>

      {/* Datos dinámicos de la venta */}
      <div className="text-[10px] mb-2 leading-tight">
        <p>FECHA: {fechaActual}</p>
        <p className="font-bold text-center mt-1">*** PRESUPUESTO ***</p>
      </div>

      <p className="text-center text-xs mb-1">--------------------------------</p>

      {/* Tabla de Artículos */}
      <table className="w-full text-[10px] leading-tight text-left border-collapse">
        <thead>
          <tr>
            <th className="font-normal w-8 pb-1">CANT</th>
            <th className="font-normal pb-1">DETALLE</th>
            <th className="font-normal text-right pb-1">SUBTOT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="align-top">
              <td className="pt-1">{item.cantidad}</td>
              {/* pr-1 y break-words aseguran que el nombre largo se ajuste y no empuje el precio */}
              <td className="pt-1 pr-1 break-words">{item.nombre}</td>
              <td className="pt-1 text-right">${item.subtotal.toLocaleString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-center text-xs mt-1 mb-1">--------------------------------</p>

      {/* Total Dinámico */}
      <div className="flex justify-between items-center font-bold text-sm mb-2">
        <span>TOTAL</span>
        <span>${total.toLocaleString('es-AR')}</span>
      </div>

      <p className="text-center text-xs mb-2">--------------------------------</p>

      {/* Pie de Ticket Genérico */}
      <div className="text-center text-[10px] mt-2 mb-8 leading-tight">
        <p>GRACIAS POR SU VISITA!</p>
        <p>VOLVE PRONTO</p>
      </div>
    </div>
  );
}
