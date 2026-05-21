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
  crearCompra, obtenerComprasPorRango, actualizarCompra, eliminarCompra, obtenerHistorialCompra, guardarComoPedidoCompra
} from "@/app/actions/compras";
import { obtenerProveedores, crearProveedor } from "@/app/actions/listas";
import { actualizarPrecioArticuloDB, sincronizarArticulosMostrador } from "@/app/actions/ventas-mostrador";
import { crearArticuloMostrador } from "@/app/actions/listas";
import { PedidosCompraClient } from "@/app/admin/erp/pedidos-compra/pedidos-compra-client";

function DecimalInput({ value, onChange, className, ...props }: {
  value: number
  onChange: (val: number) => void
  className?: string
  [key: string]: any
}) {
  const [display, setDisplay] = React.useState(value === 0 ? "" : String(value))

  React.useEffect(() => {
    const isTypingDecimal = display.endsWith(".") || display.endsWith(",")
    const current = parseFloat(display.replace(",", "."))
    if (!isTypingDecimal && current !== value) {
      setDisplay(value === 0 ? "" : String(value))
    }
  }, [value])

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={display}
      className={className}
      onChange={(e) => {
        const raw = e.target.value
        if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return
        setDisplay(raw)
        const parsed = parseFloat(raw.replace(",", "."))
        if (!isNaN(parsed)) onChange(parsed)
        else if (raw === "" || raw === "-") onChange(0)
      }}
      onBlur={() => {
        const parsed = parseFloat(display.replace(",", "."))
        setDisplay(isNaN(parsed) ? "" : String(parsed))
      }}
    />
  )
}

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
  costo?: number;
  margenGanancia?: number;
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
  margenGanancia?: number;
  precioPublico?: number;
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
  const [expandedCompras, setExpandedCompras] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  // --- ESTADOS PARA NUEVA COMPRA ---
  const [isPuntoVentaOpen, setIsPuntoVentaOpen] = useState(false);
  const [isPuntoVentaOpenGestion, setIsPuntoVentaOpenGestion] = useState(false);

  // Helper para color del margen
  const getMarginColor = (m: number) => {
    if (m > 60) return "text-fuchsia-600 font-bold";
    if (m > 50) return "text-orange-600 font-bold";
    if (m >= 40) return "text-yellow-600 font-bold";
    if (m < 40) return "text-red-600 font-bold";
    return "text-slate-600";
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isConfirmResumenOpen, setIsConfirmResumenOpen] = useState(false);
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
  const [impactarCostos, setImpactarCostos] = useState(false);
  const [fechaCompra, setFechaCompra] = useState(new Date().toISOString().split('T')[0]);
  const [fechaIngreso, setFechaIngreso] = useState("");

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
  const [editImpactarCostos, setEditImpactarCostos] = useState(false);
  const [editFechaCompra, setEditFechaCompra] = useState("");
  const [editFechaIngreso, setEditFechaIngreso] = useState("");
  const [compraOriginalParaComparar, setCompraOriginalParaComparar] = useState<any>(null);
  const [compraAEliminar, setCompraAEliminar] = useState<any>(null);

  // --- ESTADOS PARA PROVEEDORES ---
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showProvList, setShowProvList] = useState(false);
  const [showProvListEdit, setShowProvListEdit] = useState(false);

  // --- ESTADOS PARA CREACIÓN DE ARTÍCULO ---
  const [isCreateArticuloModalOpen, setIsCreateArticuloModalOpen] = useState(false);
  const [newArtData, setNewArtData] = useState<Articulo>({
    id: "",
    nombre: "",
    precio: 0,
    stock: 0,
    costo: 0,
    margenGanancia: 0
  });

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

  const handleCrearNuevoArticulo = async () => {
    if (!newArtData.id || !newArtData.nombre) {
      alert("ID y Nombre son obligatorios");
      return;
    }
    setIsSubmitting(true);

    const res = await crearArticuloMostrador({
      id: newArtData.id,
      nombre: newArtData.nombre,
      precio: newArtData.precio,
      stock: newArtData.stock,
      costo: newArtData.costo,
      margenGanancia: newArtData.margenGanancia
    });

    if (res.success) {
      const nuevo = { ...newArtData, precio: Number(newArtData.precio) };
      setArticulos(prev => [...prev, nuevo]);
      agregarProductoACompra(nuevo);
      setIsCreateArticuloModalOpen(false);
      setNewArtData({ id: "", nombre: "", precio: 0, stock: 0, costo: 0, margenGanancia: 0 });
      mostrarMensajeExito("Artículo creado y añadido a la compra");
    } else {
      alert("Error: " + res.error);
    }
    setIsSubmitting(false);
  };

  const calcularPrecioArt = (costo: number, margen: number) => {
    return Number((costo * (1 + margen / 100)).toFixed(2));
  };

  const handleCostoArtChange = (val: number) => {
    const nuevoPrecio = calcularPrecioArt(val, newArtData.margenGanancia || 0);
    setNewArtData({ ...newArtData, costo: val, precio: nuevoPrecio });
  };

  const handleMargenArtChange = (val: number) => {
    const nuevoPrecio = calcularPrecioArt(newArtData.costo || 0, val);
    setNewArtData({ ...newArtData, margenGanancia: val, precio: nuevoPrecio });
  };

  // --- CÁLCULOS NUEVA COMPRA ---
  const totalBase = items.reduce((acc, item) => acc + item.subtotal, 0);
  const totalFinalCalculado = totalBase + interes - descuento;

  // --- FUNCIONES NUEVA COMPRA ---
  const agregarProductoACompra = (prod: Articulo) => {
    const existe = items.find(item => item.productoId === prod.id);
    if (existe) {
      setItems(items.map(item =>
        item.productoId === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.costo_unit } : item
      ));
    } else {
      const costoInit = Number(prod.costo) > 0 ? Number(prod.costo) : Number(prod.precio);
      const margenInit = Number(prod.margenGanancia) || 50;
      setItems([...items, {
        id: crypto.randomUUID(),
        productoId: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        costo_unit: costoInit,
        subtotal: costoInit,
        stock: prod.stock,
        ultimaModificacion: prod.ultimaModificacion,
        margenGanancia: margenInit,
        precioPublico: Math.round(costoInit * (1 + margenInit / 100))
      }]);
    }
    setIsModalOpen(false);
    setSearchTerm("");
  };

  const handleGuardarPedidoCompra = async () => {
    if (metodoPago === "A Cuenta Corriente" && !proveedorId) {
      alert("Debe seleccionar un proveedor de la lista para compras a Cuenta Corriente.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await guardarComoPedidoCompra({
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
        proveedorId,
        impactarCostos,
        fechaCompra,
        fechaIngreso
      });

      if (res.success) {
        mostrarMensajeExito("¡Pedido de compra guardado!");
        resetForm();
        cargarCompras(fechaDesde, fechaHasta);
        // Actualizar stock local (el pedido también suma stock en este sistema según compras.ts)
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
        proveedorId,
        impactarCostos,
        fechaCompra,
        fechaIngreso
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
    setImpactarCostos(false);
    setFechaCompra(new Date().toISOString().split('T')[0]);
    setFechaIngreso("");
    setIsFinalizarModalOpen(false); setIsConfirmDiscardOpen(false); setIsConfirmResumenOpen(false);
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
    setEditImpactarCostos(false);
    setEditFechaCompra(new Date(compra.fechaCarga || compra.createdAt).toISOString().split('T')[0]);
    setEditFechaIngreso(compra.fechaIngreso ? new Date(compra.fechaIngreso).toISOString().split('T')[0] : "");
    setEditItems(compra.items.map((i: any) => {
      const c = Number(i.costo_unit);
      const m = i.margenGanancia || 50;
      return {
        id: i.id || crypto.randomUUID(),
        productoId: i.productoId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        costo_unit: c,
        subtotal: Number(i.subtotal),
        stock: articulos.find(a => a.id === i.productoId)?.stock || 0,
        margenGanancia: m,
        precioPublico: Math.round(c * (1 + m / 100))
      };
    }));
    setIsEditMainModalOpen(true);
  };

  const handleGuardarEdicion = async () => {
    const totalBaseEdit = editItems.reduce((acc, item) => acc + item.subtotal, 0);
    const totalFinalEdit = totalBaseEdit + editInteres - editDescuento;

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
        items: editItems,
        impactarCostos: editImpactarCostos,
        fechaCompra: editFechaCompra,
        fechaIngreso: editFechaIngreso
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
            <TabsTrigger value="pedidos" className="gap-2 px-6 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-900 border border-transparent data-[state=active]:border-indigo-200">
              <Clock className="h-4 w-4" /> Pedidos de Compra
            </TabsTrigger>
            <TabsTrigger value="gestion" className="gap-2 px-6 ml-auto bg-amber-50 text-amber-700 hover:bg-amber-100 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 border border-transparent data-[state=active]:border-amber-200">
              <Edit className="h-4 w-4" /> Gestión y Edición
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="registrar" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <main className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden h-full">
            <div className="flex gap-4 items-center">
              <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl w-fit shadow-md flex-shrink-0">
                <Plus className="h-4 w-4" /> Buscar Artículo ( + )
              </Button>
              <Button onClick={() => {
                const nuevoId = "ART-" + Math.random().toString(36).substring(2, 9).toUpperCase();
                setNewArtData({ ...newArtData, id: nuevoId });
                setIsCreateArticuloModalOpen(true);
              }} variant="outline" className="ml-auto border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-2 px-6 rounded-xl w-fit shadow-sm flex-shrink-0">
                <Plus className="h-4 w-4" /> Crear nuevo artículo
              </Button>
            </div>

            <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-y-auto flex-grow h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Artículo</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Cant.</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Costo Unit.</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Margen %</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Precio Público</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Subtotal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-20 text-center text-slate-400 italic">No hay artículos cargados</TableCell></TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-medium text-slate-700 py-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold">{item.nombre}</span>
                                <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">STOCK: {item.stock}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">{item.productoId}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <Input type="number" value={item.cantidad} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.costo_unit } : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400 text-xs">$</span>
                              <DecimalInput
                                value={item.costo_unit}
                                onChange={(newCost) => {
                                  const newPrecio = Math.round(newCost * (1 + (item.margenGanancia ?? 50) / 100));
                                  setItems(items.map(i => i.id === item.id ? { ...i, costo_unit: newCost, subtotal: i.cantidad * newCost, precioPublico: newPrecio } : i));
                                }}
                                className={`w-28 h-8 ${inputSinFlechas}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <DecimalInput
                                value={item.margenGanancia ?? 50}
                                onChange={(newMargin) => {
                                  const newPrecio = Math.round(item.costo_unit * (1 + newMargin / 100));
                                  setItems(items.map(i => i.id === item.id ? { ...i, margenGanancia: newMargin, precioPublico: newPrecio } : i));
                                }}
                                className={`w-16 h-8 ${inputSinFlechas} ${getMarginColor(item.margenGanancia ?? 50)}`}
                              />
                              <span className="text-slate-400 text-xs">%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-emerald-600 text-xs">$</span>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={item.precioPublico ?? Math.round(item.costo_unit * (1 + (item.margenGanancia ?? 50) / 100))}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  const newPrice = parseInt(val);
                                  const cost = item.costo_unit;
                                  if (!isNaN(newPrice)) {
                                    const newMargin = cost > 0 ? Math.round(((newPrice - cost) / cost) * 100 * 100) / 100 : 0;
                                    setItems(items.map(i => i.id === item.id ? { ...i, precioPublico: newPrice, margenGanancia: newMargin } : i));
                                  } else if (val === "") {
                                    setItems(items.map(i => i.id === item.id ? { ...i, precioPublico: 0, margenGanancia: 0 } : i));
                                  }
                                }}
                                className={`w-28 h-8 ${inputSinFlechas} text-emerald-600 font-bold`}
                              />
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
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-24 text-[10px] font-bold uppercase py-3">N° Compra</TableHead>
                      <TableHead className="w-28 text-[10px] font-bold uppercase py-3">Fecha Ingreso</TableHead>
                      <TableHead className="w-28 text-[10px] font-bold uppercase py-3">Fecha Carga</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Proveedor</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Artículos</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Responsable</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Recargo</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprasRealizadas.map((c) => {
                      const isExpanded = expandedCompras.has(c.id);
                      return (
                        <React.Fragment key={c.id}>
                          <TableRow className="hover:bg-slate-50/50 align-top transition-colors border-b">
                            <TableCell className="py-4">
                              <span className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                #{c.numeroCompra}
                              </span>
                            </TableCell>
                            <TableCell className="py-4">
                              {c.fechaIngreso ? (
                                <span className="text-[10px] text-blue-600 font-bold whitespace-nowrap">{new Date(c.fechaIngreso).toLocaleDateString('es-AR')}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">-</span>
                              )}
                            </TableCell>
                            <TableCell className="py-4">
                              <span className="text-[10px] text-slate-700 font-bold whitespace-nowrap">{new Date(c.fechaCarga || c.createdAt).toLocaleDateString('es-AR')}</span>
                            </TableCell>
                            <TableCell className="py-4 font-bold text-slate-900">
                              {c.proveedor}
                            </TableCell>
                            <TableCell className="py-4 pl-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newExpanded = new Set(expandedCompras);
                                  if (isExpanded) newExpanded.delete(c.id);
                                  else newExpanded.add(c.id);
                                  setExpandedCompras(newExpanded);
                                }}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                <span className="ml-1 text-xs">Artículos ({c.items?.length || 0})</span>
                              </Button>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                                  {c.comprador?.charAt(0) || "U"}
                                </div>
                                <span className="text-xs font-medium text-slate-700">{c.comprador}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${c.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' :
                                  c.metodo_pago === 'Transferencia' ? 'bg-blue-100 text-blue-700' :
                                    c.metodo_pago === 'A Cuenta Corriente' ? 'bg-amber-100 text-amber-700' :
                                      c.metodo_pago === 'Cheque' ? 'bg-indigo-100 text-indigo-700' :
                                        c.metodo_pago === 'Mercado Pago' ? 'bg-sky-100 text-sky-700' :
                                          'bg-slate-100 text-slate-700'
                                  }`}>
                                {c.metodo_pago}
                              </span>
                            </TableCell>
                            <TableCell className="text-right py-4">
                              <span className="text-xs font-mono text-amber-600 font-bold">
                                {c.interes > 0 ? `+ $ ${c.interes.toLocaleString('es-AR')}` : "-"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right py-4 font-black text-slate-900">
                              $ {c.totalFinal.toLocaleString('es-AR')}
                            </TableCell>
                            <TableCell className="text-center py-4">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => abrirModalEdicion(c)} className="h-8 w-8 p-0 hover:text-amber-600"><Edit className="h-4 w-4" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => abrirModalHistorial(c.id)} className="h-8 w-8 p-0 hover:text-blue-600"><History className="h-4 w-4" /></Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => { setCompraAEliminar(c); setIsEliminarModalOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="bg-slate-50/30 border-b-2 border-slate-200">
                              <TableCell colSpan={3} className="py-0">
                                <div className="p-3 bg-white border-b border-slate-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <ChevronDown className="h-4 w-4 text-slate-400" />
                                    <span className="text-xs font-bold text-slate-600 uppercase">Detalles de Artículos</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell colSpan={7} className="py-0">
                                <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                                  {c.items?.length > 0 ? (
                                    c.items.map((item: any) => (
                                      <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                                        <div className="flex flex-col gap-0.5">
                                          <span
                                            onClick={(e) => { e.stopPropagation(); copiarAlPortapapeles(item.nombre); }}
                                            className="font-bold text-slate-800 uppercase cursor-pointer hover:text-blue-600 transition-colors"
                                            title="Copiar Nombre"
                                          >
                                            {item.nombre}
                                          </span>
                                          <span
                                            onClick={(e) => { e.stopPropagation(); copiarAlPortapapeles(item.productoId ?? item.id); }}
                                            className="text-[9px] text-slate-400 font-mono uppercase cursor-pointer hover:text-blue-600 mt-0.5 w-fit block transition-colors"
                                            title="Copiar ID"
                                          >
                                            {item.productoId ?? item.id}
                                          </span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black text-[10px]">x{item.cantidad}</span>
                                          <span className="text-slate-700 font-bold whitespace-nowrap">$ {Number(item.subtotal || 0).toLocaleString('es-AR')}</span>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-xs text-slate-400 italic">No hay artículos</div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </main>
        </TabsContent>

        <TabsContent value="pedidos" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full bg-white">
          <div className="flex-grow overflow-auto">
            <PedidosCompraClient initialData={[]} />
          </div>
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
                      <TableHead className="text-[10px] font-bold uppercase py-3 w-24">ID Compra</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3 w-28">Fecha Ingreso</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3 w-28">Fecha Carga</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Proveedor</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Artículos</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Responsable</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase py-3">Método / Comprobante</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Recargo</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3 w-40">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprasRealizadas.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="py-20 text-center text-slate-400 italic">No se encontraron compras</TableCell></TableRow>
                    ) : (
                      comprasRealizadas.map((v) => {
                        const isExpanded = expandedCompras.has(v.id);
                        return (
                          <React.Fragment key={v.id}>
                            <TableRow className="hover:bg-amber-50/20 transition-colors border-b align-top">
                              <TableCell className="py-4">
                                <span
                                  className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer hover:text-blue-600 transition-colors"
                                  onClick={() => copiarAlPortapapeles(v.id)}
                                >
                                  #{v.numeroCompra}
                                </span>
                              </TableCell>
                              <TableCell className="py-4">
                                {v.fechaIngreso ? (
                                  <span className="text-xs font-bold text-blue-600">{new Date(v.fechaIngreso).toLocaleDateString('es-AR')}</span>
                                ) : (
                                  <span className="text-xs text-slate-300 italic">-</span>
                                )}
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-xs font-bold text-slate-700">{new Date(v.fechaCarga || v.createdAt).toLocaleDateString('es-AR')}</span>
                              </TableCell>
                              <TableCell className="py-4 font-bold text-slate-900">
                                {v.proveedor}
                              </TableCell>
                              <TableCell className="py-4 pl-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newExpanded = new Set(expandedCompras);
                                    if (isExpanded) newExpanded.delete(v.id);
                                    else newExpanded.add(v.id);
                                    setExpandedCompras(newExpanded);
                                  }}
                                >
                                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  <span className="ml-1 text-xs">Artículos ({v.items?.length || 0})</span>
                                </Button>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                                    {v.comprador?.charAt(0) || "U"}
                                  </div>
                                  <span className="text-xs font-medium text-slate-700">{v.comprador}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex flex-col gap-1">
                                  <span className={`w-fit px-2 py-0.5 text-[9px] font-black rounded-full uppercase ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' :
                                    v.metodo_pago === 'Transferencia' ? 'bg-blue-100 text-blue-700' :
                                      v.metodo_pago === 'A Cuenta Corriente' ? 'bg-amber-100 text-amber-700' :
                                        v.metodo_pago === 'Cheque' ? 'bg-indigo-100 text-indigo-700' :
                                          v.metodo_pago === 'Mercado Pago' ? 'bg-sky-100 text-sky-700' :
                                            'bg-slate-100 text-slate-700'
                                    }`}>
                                    {v.metodo_pago}
                                  </span>
                                  {v.comprobante && <span className="text-[10px] font-mono text-slate-400"># {v.comprobante}</span>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right py-4 font-mono text-xs text-amber-600 font-bold">
                                {v.interes > 0 ? `+ $ ${v.interes.toLocaleString('es-AR')}` : "-"}
                              </TableCell>
                              <TableCell className="text-right py-4">
                                <span className="text-base font-black text-slate-900">$ {v.totalFinal.toLocaleString('es-AR')}</span>
                              </TableCell>
                              <TableCell className="text-right py-4">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => abrirModalEdicion(v)}
                                    className="h-8 gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg"
                                  >
                                    <Edit className="h-3.5 w-3.5" /> Editar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setCompraAEliminar(v); setIsEliminarModalOpen(true); }}
                                    className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-slate-50/30 border-b-2 border-slate-200">
                                <TableCell colSpan={3} className="py-0">
                                  <div className="p-3 bg-white border-b border-slate-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <ChevronDown className="h-4 w-4 text-slate-400" />
                                      <span className="text-xs font-bold text-slate-600 uppercase">Detalles de Artículos</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell colSpan={7} className="py-0">
                                  <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                                    {v.items?.length > 0 ? (
                                      v.items.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                                          <div className="flex flex-col gap-0.5">
                                            <span
                                              onClick={(e) => { e.stopPropagation(); copiarAlPortapapeles(item.nombre); }}
                                              className="font-bold text-slate-800 uppercase cursor-pointer hover:text-blue-600 transition-colors"
                                              title="Copiar Nombre"
                                            >
                                              {item.nombre}
                                            </span>
                                            <span
                                              onClick={(e) => { e.stopPropagation(); copiarAlPortapapeles(item.productoId ?? item.id); }}
                                              className="text-[9px] text-slate-400 font-mono uppercase cursor-pointer hover:text-blue-600 mt-0.5 w-fit block transition-colors"
                                              title="Copiar ID"
                                            >
                                              {item.productoId ?? item.id}
                                            </span>
                                          </div>
                                          <div className="flex flex-col items-end gap-1">
                                            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black text-[10px]">x{item.cantidad}</span>
                                            <span className="text-slate-700 font-bold whitespace-nowrap">$ {Number(item.subtotal || 0).toLocaleString('es-AR')}</span>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-xs text-slate-400 italic">No hay artículos</div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })
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
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-600">Costo: $ {Number(prod.costo).toLocaleString('es-AR')}</p>
                  <p className="text-[10px] text-slate-400 font-medium italic">Venta: $ {Number(prod.precio).toLocaleString('es-AR')}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFinalizarModalOpen} onOpenChange={setIsFinalizarModalOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="max-h-[95vh] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
            <DialogHeader><DialogTitle className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" /> Detalles de la Compra</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2 relative">
                <Label className="text-xs font-bold text-slate-500 uppercase">Proveedor</Label>
                <Input value={proveedor} onChange={(e) => { setProveedor(e.target.value); setShowProvList(true); }} className="pl-9" />
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
                    <option value="Mercado Pago">Mercado Pago</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Comprobante N°</Label>
                  <Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Ej: 0001-00001234" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Recargo ($)</Label>
                  <DecimalInput value={interes} onChange={setInteres} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Descuento ($)</Label>
                  <DecimalInput value={descuento} onChange={setDescuento} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Fecha Carga</Label>
                  <div className="relative">
                    <Input 
                      type="date" 
                      value={fechaCompra} 
                      onChange={(e) => setFechaCompra(e.target.value)} 
                      className="pl-9"
                    />
                    <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Fecha Ingreso (Opc)</Label>
                  <div className="relative">
                    <Input 
                      type="date" 
                      value={fechaIngreso} 
                      onChange={(e) => setFechaIngreso(e.target.value)} 
                      className="pl-9"
                    />
                    <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-blue-400" />
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 py-2">
                <input
                  type="checkbox"
                  id="impactarCostos"
                  checked={impactarCostos}
                  onChange={(e) => setImpactarCostos(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <Label htmlFor="impactarCostos" className="text-sm font-medium text-slate-700 cursor-pointer">Impactar compra en costos</Label>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-2">
              <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-xs font-bold text-slate-500 uppercase">Total Final a Pagar</span>
                <span className="text-2xl font-black text-slate-900">$ {totalFinalCalculado.toLocaleString('es-AR')}</span>
              </div>
              <div className="space-y-3 pt-3 border-t border-slate-200/60">
                <Button
                  onClick={() => {
                    if (metodoPago === "A Cuenta Corriente" && !proveedorId) {
                      alert("Debe seleccionar un proveedor de la lista para compras a Cuenta Corriente.");
                      return;
                    }
                    setIsConfirmResumenOpen(true);
                  }}
                  disabled={items.length === 0 || isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-bold w-full shadow-lg shadow-emerald-600/10"
                >
                  <CheckCircle className="h-5 w-5 mr-2" /> Confirmar Compra
                </Button>
                <Button
                  onClick={handleGuardarPedidoCompra}
                  disabled={items.length === 0 || isSubmitting}
                  className="bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white h-10 rounded-xl font-bold w-full text-xs shadow-md"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Clock className="h-4 w-4 mr-2" /> Pedido de compra</>}
                </Button>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button variant="ghost" onClick={() => setIsFinalizarModalOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Resumen / Confirmación final */}
      <Dialog open={isConfirmResumenOpen} onOpenChange={setIsConfirmResumenOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Resumen de la Compra
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1">
                Revisá los datos antes de confirmar el registro.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-2">
              {/* Proveedor */}
              <div className="flex justify-between items-center bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">Proveedor</span>
                <span className="text-sm font-bold text-indigo-800">{proveedor || <span className="italic font-normal text-indigo-300">Sin especificar</span>}</span>
              </div>

              {/* Método de pago */}
              <div className="flex justify-between items-center bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-violet-400 uppercase tracking-wide">Método de Pago</span>
                <span className="text-sm font-bold text-violet-800">{metodoPago}</span>
              </div>

              {/* Comprobante */}
              {comprobante && (
                <div className="flex justify-between items-center bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wide">Comprobante N°</span>
                  <span className="text-sm font-bold text-sky-800">{comprobante}</span>
                </div>
              )}

              {/* Fecha */}
              <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Fecha de Carga</span>
                <span className="text-sm font-bold text-slate-700">{fechaCompra}</span>
              </div>

              {/* Totales */}
              <div className="rounded-2xl overflow-hidden border border-slate-200 mt-1">
                <div className="flex justify-between items-center bg-white px-4 py-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Subtotal</span>
                  <span className="text-sm font-bold text-slate-700">$ {totalBase.toLocaleString('es-AR')}</span>
                </div>
                {interes > 0 && (
                  <div className="flex justify-between items-center bg-orange-50 px-4 py-3 border-b border-orange-100">
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Recargo</span>
                    <span className="text-sm font-bold text-orange-700">+ $ {interes.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {descuento > 0 && (
                  <div className="flex justify-between items-center bg-emerald-50 px-4 py-3 border-b border-emerald-100">
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-wide">Descuento</span>
                    <span className="text-sm font-bold text-emerald-700">− $ {descuento.toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-emerald-600 px-4 py-4">
                  <span className="text-xs font-bold text-emerald-100 uppercase tracking-wide">Total Final</span>
                  <span className="text-2xl font-black text-white">$ {totalFinalCalculado.toLocaleString('es-AR')}</span>
                </div>
              </div>

              {/* Impactar costos */}
              {impactarCostos && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <Database className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  <span className="font-semibold">Esta compra impactará en los costos</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <Button
                onClick={handleFinalizarCompra}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-bold w-full shadow-lg shadow-emerald-600/10"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-5 w-5 mr-2" /> Registrar Compra</>}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setIsConfirmResumenOpen(false)}
                className="w-full rounded-xl"
                disabled={isSubmitting}
              >
                Volver y editar
              </Button>
            </div>
          </div>
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

      {/* Modal Confirmación Descarte */}
      <Dialog open={isConfirmDiscardOpen} onOpenChange={setIsConfirmDiscardOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl">
          <DialogHeader><DialogTitle className="text-red-600">¿Descartar cambios?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Se perderán todos los artículos agregados a la lista actual de compra. Esta acción no se puede deshacer.</p>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsConfirmDiscardOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={resetForm}>Descartar Todo</Button>
          </DialogFooter>
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
            <div className="grid grid-cols-5 gap-6">
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
                  <option value="Mercado Pago">Mercado Pago</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comprobante N°</Label>
                <Input value={editComprobante} onChange={(e) => setEditComprobante(e.target.value)} className="h-12 bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recargo ($)</Label>
                <DecimalInput value={editInteres} onChange={setEditInteres} className="h-12 bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descuento ($)</Label>
                <DecimalInput value={editDescuento} onChange={setEditDescuento} className="h-12 bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha Carga</Label>
                <Input type="date" value={editFechaCompra} onChange={(e) => setEditFechaCompra(e.target.value)} className="h-12 bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha Ingreso</Label>
                <Input type="date" value={editFechaIngreso} onChange={(e) => setEditFechaIngreso(e.target.value)} className="h-12 bg-slate-50" />
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
                      <TableHead className="text-center">Margen %</TableHead>
                      <TableHead className="text-center">Precio Público</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold">{item.nombre}</span>
                              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">STOCK: {item.stock}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono uppercase">{item.productoId}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center"><Input type="number" value={item.cantidad} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? { ...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.costo_unit } : i))} className="w-16 mx-auto h-8 text-center" /></TableCell>
                        <TableCell className="text-center">
                          <DecimalInput
                            value={item.costo_unit}
                            onChange={(newCost) => {
                              const newPrecio = Math.round(newCost * (1 + (item.margenGanancia ?? 50) / 100));
                              setEditItems(editItems.map(i => i.id === item.id ? { ...i, costo_unit: newCost, subtotal: i.cantidad * newCost, precioPublico: newPrecio } : i));
                            }}
                            className="w-28 mx-auto h-8 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <DecimalInput
                              value={item.margenGanancia ?? 50}
                              onChange={(newMargin) => {
                                const newPrecio = Math.round(item.costo_unit * (1 + newMargin / 100));
                                setEditItems(editItems.map(i => i.id === item.id ? { ...i, margenGanancia: newMargin, precioPublico: newPrecio } : i));
                              }}
                              className={`w-16 h-8 ${inputSinFlechas} ${getMarginColor(item.margenGanancia ?? 50)}`}
                            />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-emerald-600 text-xs">$</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={item.precioPublico ?? Math.round(item.costo_unit * (1 + (item.margenGanancia ?? 50) / 100))}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                const newPrice = parseInt(val);
                                const cost = item.costo_unit;
                                if (!isNaN(newPrice)) {
                                  const newMargin = cost > 0 ? Math.round(((newPrice - cost) / cost) * 100 * 100) / 100 : 0;
                                  setEditItems(editItems.map(i => i.id === item.id ? { ...i, precioPublico: newPrice, margenGanancia: newMargin } : i));
                                } else if (val === "") {
                                  setEditItems(editItems.map(i => i.id === item.id ? { ...i, precioPublico: 0, margenGanancia: 0 } : i));
                                }
                              }}
                              className={`w-28 h-8 ${inputSinFlechas} text-emerald-600 font-bold`}
                            />
                          </div>
                        </TableCell>
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
                  <p className="text-3xl font-black text-amber-600">$ {(editItems.reduce((acc, i) => acc + i.subtotal, 0) + editInteres - editDescuento).toLocaleString('es-AR')}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="editImpactarCostos"
                    checked={editImpactarCostos}
                    onChange={(e) => setEditImpactarCostos(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <Label htmlFor="editImpactarCostos" className="text-sm font-medium text-slate-700 cursor-pointer">Impactar compra en costos</Label>
                </div>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setIsEditMainModalOpen(false)} className="h-12 px-6 rounded-xl">Cancelar</Button>
                  <Button onClick={handleGuardarEdicion} disabled={isSubmitting} className="h-12 px-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md shadow-amber-500/20">Guardar Cambios</Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CREACIÓN DE ARTÍCULO RÁPIDO */}
      <Dialog open={isCreateArticuloModalOpen} onOpenChange={setIsCreateArticuloModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-2 border-emerald-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-emerald-900">
              <Plus className="h-5 w-5 text-emerald-600" /> Crear Nuevo Artículo
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Ingresa los datos para dar de alta un nuevo producto en el sistema.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">ID / SKU</Label>
                <Input 
                  value={newArtData.id} 
                  readOnly
                  className="font-mono bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Stock Inicial</Label>
                <Input 
                  type="number" 
                  value={newArtData.stock} 
                  onChange={(e) => setNewArtData({...newArtData, stock: Number(e.target.value)})} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción</Label>
              <Input 
                value={newArtData.nombre} 
                onChange={(e) => setNewArtData({...newArtData, nombre: e.target.value})} 
                className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
                <DecimalInput
                  value={newArtData.costo ?? 0}
                  onChange={handleCostoArtChange}
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
                <DecimalInput
                  value={newArtData.margenGanancia ?? 0}
                  onChange={handleMargenArtChange}
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <Label className="text-xs font-bold text-emerald-600 uppercase mb-2 block">Precio Final de Venta</Label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-emerald-900">$</span>
                <DecimalInput
                  value={newArtData.precio}
                  onChange={(val) => setNewArtData({...newArtData, precio: val})}
                  className="font-black text-2xl bg-white border-emerald-200 text-emerald-700 focus-visible:ring-emerald-500 h-12"
                />
              </div>
              <p className="text-[10px] text-emerald-400 mt-2 font-medium italic">* El valor se calcula automáticamente pero puede editarse manualmente.</p>
            </div>
          </div>

          <DialogFooter className="gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsCreateArticuloModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            <Button 
              onClick={handleCrearNuevoArticulo} 
              disabled={isSubmitting} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-8 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Crear e Incluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
