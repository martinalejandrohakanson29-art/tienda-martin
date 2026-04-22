"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Plus, Search, User, Trash2, ShoppingCart, Loader2, CreditCard, Phone, FileText,
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
import { DateRangeCalendar } from "./date-range-calendar";
import {
  crearVentaMostrador, guardarComoPedidoVenta, obtenerVentasPorFecha, obtenerVentasPorRango, marcarVentaComoRegistrada,
  actualizarVentaMostrador, obtenerHistorialVenta, actualizarPrecioArticuloDB, sincronizarArticulosMostrador,
  eliminarVentaMostrador
} from "@/app/actions/ventas-mostrador";

type Decimal = {
  toNumber(): number;
  toString(): string;
  toJSON(): string;
};

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
  packItems?: {
    id: string;
    componenteId: string;
    componente: {
      id: string;
      nombre: string;
      precio: number;
      stock: number;
    };
    cantidad: number;
  }[];
}

interface ItemVenta {
  id: string;
  productoId?: string;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
  packComponentes?: {
    id: string;
    nombre: string;
    cantidad: number;
    precio_unit: number;
    subtotal: number;
    stock: number;
  }[];
}

// Función para expandir un pack en sus componentes individuales
function expandirPackEnComponentes(packId: string, articulos: Articulo[]): ItemVenta[] {
  const pack = articulos.find(a => a.id === packId);
  if (!pack || !pack.esPack || !pack.packItems) return [];

  const componentes: ItemVenta[] = [];
  for (const packItem of pack.packItems) {
    componentes.push({
      id: packItem.componenteId,
      productoId: packItem.componenteId,
      nombre: packItem.componente.nombre,
      cantidad: packItem.cantidad,
      precio_unit: Number(packItem.componente.precio),
      subtotal: Number(packItem.cantidad * packItem.componente.precio),
      stock: packItem.componente.stock,
      esPack: false
    });
  }
  return componentes;
}

// Función para expandir todos los packs en los items
function expandirPacksEnItems(items: ItemVenta[], articulos: Articulo[]): ItemVenta[] {
  const resultado: ItemVenta[] = [];
  for (const item of items) {
    if (item.esPack && item.packComponentes) {
      // Expandir el pack en sus componentes
      resultado.push(...item.packComponentes);
    } else {
      // No es pack o no tiene componentes, agregar como está
      resultado.push(item);
    }
  }
  return resultado;
}

export default function VentasMostradorClient({
  articulosIniciales,
  vendedorNombre,
  puntosVenta = []
}: {
  articulosIniciales: Articulo[],
  vendedorNombre: string,
  puntosVenta?: any[]
}) {
  // --- ESTADOS GENERALES ---
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [ventasRealizadas, setVentasRealizadas] = useState<any[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [fechaDesde, setFechaDesde] = useState(new Date().toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);
  const [isLoadingVentas, setIsLoadingVentas] = useState(false);
  const [fechaDesdeTemp, setFechaDesdeTemp] = useState<string | null>(null);
  const [fechaHastaTemp, setFechaHastaTemp] = useState<string | null>(null);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // --- ESTADOS PARA NUEVA VENTA ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isGuardarComoPedido, setIsGuardarComoPedido] = useState(false);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [cliente, setCliente] = useState("Consumidor Final");
  const [interesTarjeta, setInteresTarjeta] = useState<number>(0);

  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [isPagoMixto, setIsPagoMixto] = useState(false);
  const [montoPago1, setMontoPago1] = useState<number>(0);
  const [metodoPago2, setMetodoPago2] = useState("Tarjeta de Crédito");

  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [info, setInfo] = useState("");
  const [cupon, setCupon] = useState("");
  const [transaccionId, setTransaccionId] = useState("");
  const [deCruzada, setDeCruzada] = useState("");
  const [paraCruzada, setParaCruzada] = useState("");

  const [email, setEmail] = useState("");
  const [eventoOffline, setEventoOffline] = useState(false);
  const [puntoVentaId, setPuntoVentaId] = useState("");
  const [puntoVentaSeleccionado, setPuntoVentaSeleccionado] = useState<any>(null);

  // Establecer "Mostrador" como punto de venta por defecto (solo una vez al montar)
  useEffect(() => {
    if (!puntoVentaId && puntosVenta && puntosVenta.length > 0) {
      const mostrador = puntosVenta.find((p: any) => p.nombre === "Mostrador");
      if (mostrador) {
        setPuntoVentaId(mostrador.id);
        setPuntoVentaSeleccionado(mostrador);
      }
    }
  }, [puntosVenta]);

  // Actualizar puntoVentaSeleccionado cuando puntoVentaId cambia
  useEffect(() => {
    if (puntoVentaId && puntosVenta) {
      const seleccionado = puntosVenta.find((p: any) => p.id === puntoVentaId);
      setPuntoVentaSeleccionado(seleccionado || null);
    } else {
      setPuntoVentaSeleccionado(null);
    }
  }, [puntoVentaId, puntosVenta]);

  // --- ESTADO PARA IMPRESIÓN ---
  const [ventaParaImprimir, setVentaParaImprimir] = useState<any>(null);

  // --- ESTADO PARA ACORDEÓN DE VENTAS ---
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());

  // --- ESTADOS PARA EDICIÓN Y AUDITORÍA ---
  const [isEditMainModalOpen, setIsEditMainModalOpen] = useState(false);
  const [isSearchEditModalOpen, setIsSearchEditModalOpen] = useState(false);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [isEliminarModalOpen, setIsEliminarModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<any[]>([]);

  const [editVentaId, setEditVentaId] = useState("");
  const [editCliente, setEditCliente] = useState("");
  const [editInteresTarjeta, setEditInteresTarjeta] = useState<number>(0);

  const [editMetodoPago, setEditMetodoPago] = useState("");
  const [isEditPagoMixto, setIsEditPagoMixto] = useState(false);
  const [editMontoPago1, setEditMontoPago1] = useState<number>(0);
  const [editMetodoPago2, setEditMetodoPago2] = useState("Tarjeta de Crédito");

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
  const [editPuntoVentaId, setEditPuntoVentaId] = useState("");

  // Establecer "Mostrador" como punto de venta por defecto para edición (solo una vez al montar)
  useEffect(() => {
    if (!editPuntoVentaId && puntosVenta && puntosVenta.length > 0) {
      const mostrador = puntosVenta.find((p: any) => p.nombre === "Mostrador");
      if (mostrador) {
        setEditPuntoVentaId(mostrador.id);
      }
    }
  }, [puntosVenta]);
  const [ventaOriginalParaComparar, setVentaOriginalParaComparar] = useState<any>(null);

  // --- ESTADO PARA FILTRO OFFLINE ---
  const [mostrarSoloOffline, setMostrarSoloOffline] = useState(false);

  // --- ESTADO PARA ELIMINAR VENTA ---
  const [ventaAEliminar, setVentaAEliminar] = useState<any>(null);

  // --- ESTADOS PARA EDICIÓN DE PRECIO EN BASE DE DATOS ---
  const [isPriceDbModalOpen, setIsPriceDbModalOpen] = useState(false);
  const [priceDbItem, setPriceDbItem] = useState<Articulo | null>(null);
  const [newDbPrice, setNewDbPrice] = useState<number>(0);
  const [isUpdatingDbPrice, setIsUpdatingDbPrice] = useState(false);

  // --- NUEVOS ESTADOS PARA ACTUALIZACIÓN RÁPIDA DE PRECIO ---
  const [isFastUpdateDbModalOpen, setIsFastUpdateDbModalOpen] = useState(false);
  const [fastUpdateData, setFastUpdateData] = useState<{ id: string, nombre: string, oldPrice: number, newPrice: number } | null>(null);


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
    cargarVentas(fechaDesde, fechaHasta);
  }, [fechaDesde, fechaHasta]);

  // Efecto para sincronizar fechaDesde y fechaHasta con la fecha actual al cargar
  useEffect(() => {
    const hoy = new Date().toISOString().split('T')[0];
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);


  // --- FUNCIONES COMUNES ---
  const cargarVentas = async (fechaDesde: string, fechaHasta: string) => {
    setIsLoadingVentas(true);
    const res = await obtenerVentasPorRango(fechaDesde, fechaHasta);
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

  // --- FUNCION AUXILIAR PARA EVALUAR MÉTODOS DE PAGO ---
  const esTarjeta = (m: string) => m === "Tarjeta de Crédito" || m === "Tarjeta de Débito";

  // --- CALCULOS NUEVA VENTA (LÓGICA MIXTA) ---
  const totalBase = items.reduce((acc: number, item: ItemVenta) => acc + item.subtotal, 0);

  const base1 = isPagoMixto ? montoPago1 : totalBase;
  const base2 = isPagoMixto ? Math.max(0, totalBase - montoPago1) : 0;

  const isCredito1 = metodoPago === "Tarjeta de Crédito";
  const isCredito2 = isPagoMixto && metodoPago2 === "Tarjeta de Crédito";

  const final1 = isCredito1 ? base1 * (1 + (interesTarjeta / 100)) : base1;
  const final2 = isCredito2 ? base2 * (1 + (interesTarjeta / 100)) : base2;

  const totalFinalCalculado = isPagoMixto ? (final1 + final2) : final1;

  // SOLAMENTE SE REQUIEREN DATOS EXTRA SEGÚN EL MÉTODO EXACTO
  const requiereTarjeta = isPagoMixto ? (esTarjeta(metodoPago) || esTarjeta(metodoPago2)) : esTarjeta(metodoPago);
  const requiereCruzada = (isPagoMixto && (metodoPago === "Cruzada" || metodoPago2 === "Cruzada")) || (!isPagoMixto && metodoPago === "Cruzada");

  // --- FUNCIONES PARA IMPRESIÓN ---
  const handleImprimirPresupuesto = () => {
    // Expandir packs en sus componentes antes de imprimir
    const itemsExpandidos = expandirPacksEnItems(items, articulos);
    
    setVentaParaImprimir({
      id: crypto.randomUUID(),
      items: itemsExpandidos,
      total: totalFinalCalculado,
      totalFinal: totalFinalCalculado,
      cliente: requiereTarjeta && dni ? dni : cliente,
      metodo_pago: isPagoMixto ? "MIXTO" : metodoPago
    });
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleImprimirVentaHistorial = (venta: { id: string; cliente: string; email?: string; eventoOffline?: boolean }) => {
    setVentaParaImprimir(venta);
    setTimeout(() => {
      window.print();
      setTimeout(() => setVentaParaImprimir(null), 1000);
    }, 100);
  };

  // --- FUNCIONES NUEVA VENTA ---
  const agregarProductoAVenta = (prod: Articulo) => {
    // Si es un pack, expandirlo en sus componentes
    if (prod.esPack && prod.packItems && prod.packItems.length > 0) {
      const componentes = prod.packItems.map(packItem => ({
        id: crypto.randomUUID(),
        productoId: packItem.componenteId,
        nombre: packItem.componente.nombre,
        cantidad: packItem.cantidad,
        precio_unit: Number(packItem.componente.precio),
        subtotal: Number(packItem.cantidad * packItem.componente.precio),
        stock: packItem.componente.stock,
        ultimaModificacion: prod.ultimaModificacion
      }));
      setItems(prev => [...prev, ...componentes]);
    } else {
      // No es pack, agregar como normal
      const existe = items.find(item => item.productoId === prod.id);
      if (existe) {
        setItems(items.map(item =>
          item.productoId === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unit } : item
        ));
      } else {
        setItems([...items, {
          id: crypto.randomUUID(),
          productoId: prod.id,
          nombre: prod.nombre,
          cantidad: 1,
          precio_unit: Number(prod.precio),
          subtotal: Number(prod.precio),
          stock: prod.stock,
          ultimaModificacion: prod.ultimaModificacion
        }]);
      }
    }
    setIsModalOpen(false);
    setSearchTerm("");
  };

  // --- FUNCIONES NUEVA VENTA ---
  const handleFinalizarVenta = async (overrideComoPedido?: boolean | React.MouseEvent) => {
    const isPedido = typeof overrideComoPedido === 'boolean' ? overrideComoPedido : isGuardarComoPedido;

    if (requiereTarjeta && (!dni.trim() || !telefono.trim() || !cupon.trim() || !transaccionId.trim())) {
      alert("DNI, Teléfono, N° Cupón y Transacción son OBLIGATORIOS para pagos con Tarjeta."); return;
    }
    if (requiereCruzada && (!deCruzada.trim() || !paraCruzada.trim())) { alert("'De' y 'Para' obligatorios para pagos Cruzados."); return; }

    const clienteFinal = cliente;

    let metodoPagoFinal = isPagoMixto ? "Mixto" : metodoPago;
    let infoFinal = info || (isPedido ? "Pedido de venta - pendiente de confirmación" : "Venta confirmada");

    if (isPagoMixto) {
      const det = `[Mixto -> ${metodoPago}: $${final1.toLocaleString('es-AR')} | ${metodoPago2}: $${final2.toLocaleString('es-AR')}]`;
      infoFinal = info ? `${det} - ${info}` : det;
    }

    try {
      setIsSubmitting(true);
      
      // Preparar items para guardar: expandir packs en sus componentes
      const itemsParaGuardar = items.flatMap(item => {
        const articulo = articulos.find(a => a.id === item.productoId);
        if (articulo?.esPack && articulo.packItems) {
          // Expandir pack en sus componentes
          return articulo.packItems.map(packItem => ({
            ...item,
            productoId: packItem.componenteId,
            nombre: packItem.componente.nombre,
            precio_unit: Number(packItem.componente.precio),
            subtotal: Number(packItem.cantidad * packItem.componente.precio),
            stock: packItem.componente.stock
          }));
        }
        return item;
      });

      const resultado = isPedido
        ? await guardarComoPedidoVenta({
            cliente: clienteFinal, vendedor: vendedorNombre, total: totalBase,
            interes: interesTarjeta,
            totalFinal: totalFinalCalculado,
            items: itemsParaGuardar, metodo_pago: metodoPagoFinal, dni, telefono, info: infoFinal, cupon, transaccionId, de: deCruzada, para: paraCruzada,
            email, eventoOffline, puntoVentaId
          })
        : await crearVentaMostrador({
            cliente: clienteFinal, vendedor: vendedorNombre, total: totalBase,
            interes: interesTarjeta,
            totalFinal: totalFinalCalculado,
            items: itemsParaGuardar, metodo_pago: metodoPagoFinal, dni, telefono, info: infoFinal, cupon, transaccionId, de: deCruzada, para: paraCruzada,
            email, eventoOffline, puntoVentaId
          });
      
      if (resultado.success) {
        if (isPedido) {
          mostrarMensajeExito("¡Pedido de venta guardado con éxito!");
       } else {
          mostrarMensajeExito("¡Venta registrada con éxito!");
          setArticulos(prev => prev.map(art => {
            const itemVendido = itemsParaGuardar.find(i => i.productoId === art.id);
            if (itemVendido) {
              return { ...art, stock: art.stock - itemVendido.cantidad };
            }
            return art;
          }));
       }

       resetForm();
       cargarVentas(fechaDesde, fechaHasta);
      } else { alert("Error al guardar: " + resultado.error); }
    } catch (error) { alert("Ocurrió un error inesperado."); } finally { setIsSubmitting(false); }
  };

  const resetForm = () => {
    setItems([]); setCliente("Consumidor Final"); setMetodoPago("Efectivo"); setDni(""); setTelefono("");
    setInfo(""); setCupon(""); setTransaccionId(""); setDeCruzada(""); setParaCruzada(""); setInteresTarjeta(0);
    setEmail(""); setEventoOffline(false); setIsPagoMixto(false); setMontoPago1(0); setMetodoPago2("Tarjeta de Crédito");
    setIsFinalizarModalOpen(false); setIsConfirmDiscardOpen(false);
    // Restaurar "Mostrador" como punto de venta por defecto
    if (puntosVenta && puntosVenta.length > 0) {
      const mostrador = puntosVenta.find((p: any) => p.nombre === "Mostrador");
      if (mostrador) {
        setPuntoVentaId(mostrador.id);
      }
    }
  };

  const handleMarcarRegistrada = async (id: string) => {
    setVentasRealizadas(prev => prev.map(v => v.id === id ? { ...v, registrada: true } : v));
    const res = await marcarVentaComoRegistrada(id);
    if (!res.success) { alert("No se pudo actualizar"); cargarVentas(fechaDesde, fechaHasta); }
  };

  // --- CALCULOS EDICIÓN VENTA (LÓGICA MIXTA) ---
  const totalBaseEdit = editItems.reduce((acc: number, item: ItemVenta) => acc + item.subtotal, 0);

  const editBase1 = isEditPagoMixto ? editMontoPago1 : totalBaseEdit;
  const editBase2 = isEditPagoMixto ? Math.max(0, totalBaseEdit - editMontoPago1) : 0;

  const isEditCredito1 = editMetodoPago === "Tarjeta de Crédito";
  const isEditCredito2 = isEditPagoMixto && editMetodoPago2 === "Tarjeta de Crédito";

  const editFinal1 = isEditCredito1 ? editBase1 * (1 + (editInteresTarjeta / 100)) : editBase1;
  const editFinal2 = isEditCredito2 ? editBase2 * (1 + (editInteresTarjeta / 100)) : editBase2;

  const editTotalFinalCalculado = isEditPagoMixto ? (editFinal1 + editFinal2) : editFinal1;

  // SOLAMENTE SE REQUIEREN DATOS EXTRA SEGÚN EL MÉTODO EXACTO EN EDICIÓN
  const requiereTarjetaEdit = isEditPagoMixto ? (esTarjeta(editMetodoPago) || esTarjeta(editMetodoPago2)) : esTarjeta(editMetodoPago);
  const requiereCruzadaEdit = (isEditPagoMixto && (editMetodoPago === "Cruzada" || editMetodoPago2 === "Cruzada")) || (!isEditPagoMixto && editMetodoPago === "Cruzada");

  const abrirModalEdicion = async (venta: { id: string; cliente: string; email?: string; metodo_pago: string; totalFinal: number; items: Array<{ productoId: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }>; createdAt: string; total: number; interes: number; dni?: string; telefono?: string; cupon?: string; transaccionId?: string; de?: string; para?: string; eventoOffline?: boolean; info?: string; puntoVentaId?: string }) => {
    // Sincronizar artículos con la base de datos para asegurar precios correctos
    const syncResult = await sincronizarArticulosMostrador();
    if (syncResult.success && syncResult.data) {
      setArticulos(syncResult.data);
    }

    setVentaOriginalParaComparar(venta);
    setEditVentaId(venta.id);
    setEditCliente(venta.cliente || "");
    setEditMetodoPago(venta.metodo_pago === "Mixto" ? "Efectivo" : (venta.metodo_pago || "Efectivo"));
    setIsEditPagoMixto(venta.metodo_pago === "Mixto");
    setEditMontoPago1(venta.total / 2); // default
    setEditMetodoPago2("Tarjeta de Crédito"); // default

    setEditInteresTarjeta(Number(venta.interes) || 0);
    setEditDni(venta.dni || "");
    setEditTelefono(venta.telefono || "");
    setEditCupon(venta.cupon || "");
    setEditTransaccionId(venta.transaccionId || "");
    setEditDeCruzada(venta.de || "");
    setEditParaCruzada(venta.para || "");
    setEditEmail(venta.email || "");
    setEditEventoOffline(venta.eventoOffline || false);
    setEditPuntoVentaId(venta.puntoVentaId || "");

    // Limpiamos la marca de mixto vieja del info para no duplicarla si se guarda de nuevo
    const cleanInfo = (venta.info || "").replace(/\[Mixto -> .*?\](?: - )?/, "");
    setEditInfo(cleanInfo);

    // Ahora inicializamos editItems con los precios CORRECTOS desde la base de datos
    setEditItems(venta.items.map((i: { id?: string; productoId: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }) => {
      const articuloBase = articulos.find(a => a.id === i.productoId);
      return {
        id: i.id || crypto.randomUUID(),
        productoId: i.productoId,
        nombre: i.nombre, cantidad: i.cantidad,
        precio_unit: Number(i.precio_unit), subtotal: Number(i.subtotal),
        stock: articuloBase ? articuloBase.stock : 0,
        ultimaModificacion: articuloBase?.ultimaModificacion || null
      };
    }));
    setIsEditMainModalOpen(true);
  };

  const agregarProductoEdicion = (prod: Articulo) => {
    const existe = editItems.find(item => item.productoId === prod.id);
    if (existe) {
      setEditItems(editItems.map(item =>
        item.productoId === prod.id ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unit } : item
      ));
    } else {
      setEditItems([...editItems, {
        id: crypto.randomUUID(),
        productoId: prod.id,
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
    if (requiereTarjetaEdit && (!editDni.trim() || !editTelefono.trim() || !editCupon.trim() || !editTransaccionId.trim())) {
      alert("DNI, Teléfono, N° Cupón y Transacción son OBLIGATORIOS para pagos con Tarjeta."); return;
    }
    if (requiereCruzadaEdit && (!editDeCruzada.trim() || !editParaCruzada.trim())) { alert("'De' y 'Para' son obligatorios para transferencias Cruzadas."); return; }

    let cambios = [];
    if (ventaOriginalParaComparar.cliente !== editCliente) cambios.push(`Cliente modificado`);
    if (ventaOriginalParaComparar.metodo_pago !== (isEditPagoMixto ? "Mixto" : editMetodoPago)) cambios.push(`Método modificado`);
    if (ventaOriginalParaComparar.email !== editEmail) cambios.push(`Email modificado`);
    if (ventaOriginalParaComparar.eventoOffline !== editEventoOffline) cambios.push(`Evento offline modificado`);
    if (ventaOriginalParaComparar.puntoVentaId !== editPuntoVentaId) cambios.push(`Punto de venta modificado`);
    if (Number(ventaOriginalParaComparar.totalFinal) !== editTotalFinalCalculado) {
      cambios.push(`Total alterado`);
    }
    if (cambios.length === 0) cambios.push("Se actualizaron artículos o datos menores.");
    const resumenCambios = cambios.join(" | ");

    let editMetodoPagoFinal = isEditPagoMixto ? "Mixto" : editMetodoPago;
    let editInfoFinal = editInfo;
    if (isEditPagoMixto) {
      const det = `[Mixto -> ${editMetodoPago}: $${editFinal1.toLocaleString('es-AR')} | ${editMetodoPago2}: $${editFinal2.toLocaleString('es-AR')}]`;
      editInfoFinal = editInfo ? `${det} - ${editInfo}` : det;
    }

    try {
      setIsSubmitting(true);
      const resultado = await actualizarVentaMostrador(
        editVentaId,
        {
          cliente: editCliente,
          total: totalBaseEdit,
          interes: editInteresTarjeta,
          totalFinal: editTotalFinalCalculado,
          metodo_pago: editMetodoPagoFinal,
          dni: editDni, telefono: editTelefono, info: editInfoFinal, cupon: editCupon,
          transaccionId: editTransaccionId, de: editDeCruzada, para: editParaCruzada,
          email: editEmail,
          eventoOffline: editEventoOffline,
          puntoVentaId: editPuntoVentaId,
          items: editItems
        },
        vendedorNombre,
        resumenCambios
      );

      if (resultado.success) {
        mostrarMensajeExito("¡Venta modificada con éxito!");
        setArticulos(prev => prev.map(art => {
          let nuevoStock = art.stock;
          const oldItem = ventaOriginalParaComparar.items.find((i: { productoId: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }) => i.productoId === art.id);
          if (oldItem) nuevoStock += oldItem.cantidad;
          const newItem = editItems.find(i => i.productoId === art.id);
          if (newItem) nuevoStock -= newItem.cantidad;
          return { ...art, stock: nuevoStock };
        }));

        setIsEditMainModalOpen(false);
        cargarVentas(fechaDesde, fechaHasta);
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

  const abrirModalEliminacion = (venta: any) => {
    setVentaAEliminar(venta);
    setIsEliminarModalOpen(true);
  };

  const handleEliminarVenta = async () => {
    if (!ventaAEliminar) return;

    const res = await eliminarVentaMostrador(ventaAEliminar.id, vendedorNombre);

    if (res.success) {
      mostrarMensajeExito("¡Venta eliminada exitosamente!");
      setIsEliminarModalOpen(false);
      setVentaAEliminar(null);
      // Recargar las ventas
      cargarVentas(fechaDesde, fechaHasta);
    } else {
      alert("No se pudo eliminar la venta: " + res.error);
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
      setItems(prev => prev.map(i => i.productoId === priceDbItem.id ? { ...i, precio_unit: newDbPrice, subtotal: i.cantidad * newDbPrice, ultimaModificacion: nowStr } : i));
      setEditItems(prev => prev.map(i => i.productoId === priceDbItem.id ? { ...i, precio_unit: newDbPrice, subtotal: i.cantidad * newDbPrice, ultimaModificacion: nowStr } : i));

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
        oldPrice: Number(articulo.precio),
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
      setItems(prev => prev.map(i => (i.productoId || i.id) === fastUpdateData.id ? { ...i, precio_unit: fastUpdateData.newPrice, subtotal: i.cantidad * fastUpdateData.newPrice, ultimaModificacion: nowStr } : i));
      setEditItems(prev => prev.map(i => (i.productoId || i.id) === fastUpdateData.id ? { ...i, precio_unit: fastUpdateData.newPrice, subtotal: i.cantidad * fastUpdateData.newPrice, ultimaModificacion: nowStr } : i));

      mostrarMensajeExito("¡Precio actualizado en la Base de Datos con éxito!");
      setIsFastUpdateDbModalOpen(false);
    } else {
      alert("No se pudo guardar el precio: " + res.error);
    }

    setIsUpdatingDbPrice(false);
  };

  // Top 5 artículos más vendidos en el rango de fechas filtrado
  const topItemsVentas = useMemo(() => {
    if (!ventasFiltradas || ventasFiltradas.length === 0) return [];

    const itemCounts: Record<string, { nombre: string; total: number }> = {};

    // Iterar sobre todas las ventas filtradas y contar cada artículo vendido
    ventasFiltradas.forEach((venta) => {
      if (venta.items && venta.items.length > 0) {
        venta.items.forEach((item: any) => {
          const nombre = item.nombre || '';
          if (nombre) {
            if (!itemCounts[nombre]) {
              itemCounts[nombre] = { nombre, total: 0 };
            }
            // Cada artículo vendido cuenta como 1 (independientemente de la cantidad)
            itemCounts[nombre].total += 1;
          }
        });
      }
    });

    // Ordenar por cantidad descendente y tomar los top 5
    return Object.values(itemCounts)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventasFiltradas]);

  // Ventas agrupadas por método de pago
  const ventasPorMetodo = useMemo(() => {
    if (!ventasFiltradas || ventasFiltradas.length === 0) return [];
    
    const totals: Record<string, number> = {};
    
    ventasFiltradas.forEach((venta) => {
      const metodo = venta.metodo_pago || 'Desconocido';
      totals[metodo] = (totals[metodo] || 0) + Number(venta.totalFinal || venta.total);
    });
    
    return Object.entries(totals)
      .map(([metodo, total]) => ({ metodo, total }))
      .sort((a, b) => b.total - a.total);
  }, [ventasFiltradas]);

  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <>
      {/* 1. EL TICKET */}
      <TicketImpresion
        ventaId={ventaParaImprimir ? ventaParaImprimir.id : ""}
        numeroVenta={ventaParaImprimir?.numeroVenta}
        items={ventaParaImprimir ? ventaParaImprimir.items.map((i: { productoId: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }) => ({ ...i, id: crypto.randomUUID() })) : items}
        total={ventaParaImprimir ? Number(ventaParaImprimir.totalFinal || ventaParaImprimir.total) : totalFinalCalculado}
        cliente={ventaParaImprimir ? (ventaParaImprimir.cliente || ventaParaImprimir.dni) : cliente}
        metodoPago={ventaParaImprimir ? ventaParaImprimir.metodo_pago : (isPagoMixto ? "MIXTO" : metodoPago)}
      />

      {/* 2. INTERFAZ NORMAL */}
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
          <div className="flex items-center gap-4">
            <Link 
              href="/admin/erp" 
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Volver al ERP"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">Venta Mostrador</h1>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Revolución Motos</p>
              </div>
            </div>
          </div>
          <div className="text-right border-l pl-4 border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Vendedor</p>
            <p className="text-sm font-semibold text-blue-600">{vendedorNombre}</p>
          </div>
        </header>

        <Tabs defaultValue="registrar" className="flex-grow flex flex-col overflow-hidden h-full w-full">
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
          <TabsContent value="registrar" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">

              <section className="flex-grow flex flex-col min-h-0 gap-4">
                <div className="flex gap-4 items-center">
                  <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl w-fit shadow-md flex-shrink-0">
                    <Plus className="h-4 w-4" /> Añadir Artículo ( + )
                  </Button>
                </div>

                <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="overflow-y-auto flex-grow h-full">
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
                                <Input type="number" value={item.cantidad} onChange={(e) => setItems(items.map((i: ItemVenta) => i.id === item.id ? { ...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.precio_unit } : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                              </TableCell>
                              <TableCell className="text-center py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-green-600 hover:bg-green-50 rounded-lg"
                                    title="Editar precio base en el sistema"
                                    onClick={() => abrirModalPrecioDB(item.productoId ?? item.id, item.precio_unit)}
                                  >
                                    <Database className="h-4 w-4" />
                                  </Button>
                                  <span className="text-slate-400 text-xs ml-1">$</span>
                                  <Input type="number" value={item.precio_unit} onChange={(e) => setItems(items.map((i: ItemVenta) => i.id === item.id ? { ...i, precio_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value) } : i))} className={`w-28 h-8 ${inputSinFlechas}`} />

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Guardar este precio en la Base de Datos"
                                    onClick={() => abrirModalFastUpdate(item.productoId ?? item.id, item.precio_unit)}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>

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
                                $ {Number(item.subtotal).toLocaleString('es-AR')}
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
              </section>
            </main>

            <footer className="bg-white border-t border-slate-200 p-4 md:p-5 flex-shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-20 relative">
              <div className="max-w-[1800px] mx-auto flex justify-center">
                <div className="flex flex-col lg:flex-row items-center lg:items-end gap-10">
                  
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-700 block mb-0.5">Total Base Gral.</span>
                      <span className="text-3xl font-black text-slate-900 tracking-tighter">$ {totalBase.toLocaleString('es-AR')}</span>
                    </div>
                    <div className="space-y-1.5 w-32">
                      <Label className="text-sm font-bold text-slate-700">% Int. Tarjeta</Label>
                      <div className="relative">
                        <Input type="number" value={interesTarjeta} onChange={(e) => setInteresTarjeta(Number(e.target.value))} className="pl-8 h-10 bg-slate-50/50 border-slate-200 font-bold text-blue-600 focus:bg-white transition-colors" />
                        <Percent className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                    <div className={`text-right ${interesTarjeta === 0 ? 'hidden select-none' : ''}`}>
                      <span className="text-[10px] font-bold text-black uppercase tracking-wider block mb-0.5">Total con Interés</span>
                      <span className="text-3xl font-black text-red-600 tracking-tighter">$ {(totalBase * (1 + interesTarjeta / 100)).toLocaleString('es-AR')}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 justify-center border-l border-slate-200 pl-10 h-full">
                    <Button variant="ghost" onClick={() => setIsConfirmDiscardOpen(true)} className="text-red-500 hover:bg-red-50 h-12 px-4 rounded-xl hidden sm:flex">
                      <Trash2 className="h-4 w-4 mr-2" /> Descartar
                    </Button>
                    <Button variant="outline" onClick={handleImprimirPresupuesto} disabled={items.length === 0} className="text-slate-700 border-slate-300 hover:bg-slate-50 h-12 px-6 rounded-xl font-medium">
                      <Printer className="h-4 w-4 mr-2" /> Presupuesto
                    </Button>
                    <Button onClick={() => setIsFinalizarModalOpen(true)} disabled={items.length === 0 || isSubmitting} className="h-12 px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-600/20 transition-all hover:shadow-lg hover:-translate-y-0.5">
                      Finalizar Venta
                    </Button>
                  </div>
                </div>
              </div>
            </footer>
          </TabsContent>

          {/* --- PESTAÑA: LISTADO DE VENTAS --- */}
          <TabsContent value="listado" className="flex-grow overflow-hidden m-0 select-text data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtrar por Fecha</Label>
                    <div className="flex items-center gap-2">
                      <DateRangeCalendar
                        fechaDesde={fechaDesde}
                        fechaHasta={fechaHasta}
                        setFechaDesde={(date) => { setFechaDesde(date); cargarVentas(date, fechaHasta); }}
                        setFechaHasta={(date) => { setFechaHasta(date); cargarVentas(fechaDesde, date); }}
                        onApply={() => { }}
                      />
                      <Button variant="outline" size="icon" onClick={() => cargarVentas(fechaDesde, fechaHasta)} disabled={isLoadingVentas} className="rounded-xl border-slate-200 h-10 w-10 text-slate-400 hover:text-blue-600 transition-all">
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
                <div className="flex items-end justify-end gap-4 flex-1 max-w-[700px]">
                  {/* Bloque de totales existente */}
                  <div className="text-right min-w-[250px]">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Filtrado (Final)</p>
                    <p className="text-xl font-black text-slate-900">Total: ${ventasFiltradas.reduce((acc, v) => acc + Number(v.totalFinal || v.total), 0).toLocaleString('es-AR')}</p>
                    <p className="text-xl font-black text-green-600">Cantidad Total: {ventasFiltradas.length.toLocaleString('es-AR')}</p>
                    <p className="text-lg font-medium text-slate-900">Promedio Venta: ${ventasFiltradas.length > 0 ? Math.round(ventasFiltradas.reduce((acc, v) => acc + Number(v.totalFinal || v.total), 0) / ventasFiltradas.length).toLocaleString('es-AR') : '0'}</p>
                  </div>

                  {/* Nuevo bloque: Top 5 artículos más vendidos */}
                  <div className="text-left flex-shrink-0">
                    {topItemsVentas.length > 0 ? (
                      <>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Top 5 Artículos Más Vendidos</p>
                        <div className="flex flex-col gap-0.5">
                          {topItemsVentas.map((item, index) => (
                            <p key={index} className="text-[10px] text-slate-600 font-medium">
                              {index + 1}. {item.nombre} ({item.total})
                            </p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Sin datos de ventas</p>
                    )}
                  </div>

                  {/* Ventas por Método de Pago */}
                  <div className="text-left flex-shrink-0">
                    {ventasPorMetodo.length > 0 ? (
                      <>
                        <p className="text-[11px] text-slate-400 font-bold uppercase mb-1">Ventas por Método de Pago</p>
                        <div className="flex flex-col gap-0.5">
                          {ventasPorMetodo.map(({ metodo, total }, index) => (
                            <p key={metodo} className={`text-[11px] font-medium ${
                              metodo === 'Efectivo' ? 'text-red-600' :
                              metodo === 'Cruzada' ? 'text-blue-600' :
                              metodo === 'Mixto' ? 'text-purple-600' :
                              'text-blue-600'
                            }`}>
                              {index + 1}. {metodo} ${total.toLocaleString('es-AR')}
                            </p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">Sin datos de ventas</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-grow h-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="text-[10px] font-bold uppercase py-3">ID Venta</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Fecha / Hora</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Cliente</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Ver Artículos</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Cupón / De</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Trans. / Para</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Info Extra</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                        <TableHead className="text-center text-[10px] font-bold uppercase py-3 w-28">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventasFiltradas.length === 0 ? (
                        <TableRow><TableCell colSpan={10} className="py-20 text-center text-slate-400 italic">No se encontraron ventas con estos filtros</TableCell></TableRow>
                      ) : (
                        ventasFiltradas.map((v) => {
                          const isExpanded = expandedVentas.has(v.id);
                          return (
                            <React.Fragment key={v.id}>
                              <TableRow className="hover:bg-slate-50/50 align-top transition-colors">
                                <TableCell className="py-4">
                                  <span className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200" title={v.id}>
                                    {v.numeroVenta || v.id.slice(0, 8)}
                                  </span>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-slate-700 font-bold whitespace-nowrap">{new Date(v.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </TableCell>

                                <TableCell className="font-medium text-slate-700 py-4">
                                  {v.cliente}
                                  {v.email && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{v.email}</div>}
                                  {v.puntoVenta && <div className="mt-1"><span className="inline-block px-2 py-0.5 rounded-full uppercase text-white" style={{ backgroundColor: v.puntoVenta.color || '#10b981' }}>{v.puntoVenta.nombre}</span></div>}
                                  {v.eventoOffline && <div className="mt-1"><span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-bold rounded-full uppercase">Offline Event</span></div>}
                                </TableCell>

                                <TableCell className="py-4 pl-2">
                                  <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" onClick={(e) => {
                                    e.stopPropagation();
                                    const newExpanded = new Set(expandedVentas);
                                    if (isExpanded) newExpanded.delete(v.id);
                                    else newExpanded.add(v.id);
                                    setExpandedVentas(newExpanded);
                                  }}>
                                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    <span className="ml-1 text-xs">Artículos ({v.items?.length || 0})</span>
                                  </Button>
                                </TableCell>
                                <TableCell className="py-4">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : v.metodo_pago === 'Mixto' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {v.metodo_pago}
                                  </span>
                                </TableCell>
                                <TableCell className="py-4 text-xs font-mono text-slate-600">
                                  {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.de || "-") : (v.cupon || "-")}
                                </TableCell>
                                <TableCell className="py-4 text-xs font-mono text-slate-600">
                                  {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.para || "-") : (v.transaccionId || "-")}
                                </TableCell>
                                <TableCell className="py-4 text-xs text-slate-500 max-w-[200px]" title={v.info || ""}>
                                  {v.info || "-"}
                                </TableCell>
                                <TableCell className="text-right font-black text-slate-900 py-4">$ {(v.totalFinal || v.total).toLocaleString('es-AR')}</TableCell>
                                <TableCell className="py-4 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleImprimirVentaHistorial(v); }}
                                      className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-transparent"
                                      title="Imprimir Ticket"
                                    >
                                      <Printer className="h-5 w-5" />
                                    </button>
                                    <button
                                      disabled={v.registrada}
                                      onClick={(e) => { e.stopPropagation(); handleMarcarRegistrada(v.id); }}
                                      className={`p-2 rounded-xl transition-all ${v.registrada ? 'text-green-600 bg-green-50 cursor-default border border-green-100' : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50 border border-transparent'}`}
                                      title={v.registrada ? "Registrada" : "Marcar como Registrada"}
                                    >
                                      {v.registrada ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                    </button>
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
                                        v.items.map((item: { id: string; productoId?: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }) => (
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

          {/* --- PESTAÑA: GESTIÓN Y EDICIÓN --- */}
          <TabsContent value="gestion" className="flex-grow overflow-hidden m-0 select-text data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">
              <div className="flex items-center justify-between bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Filtrar por Fecha</Label>
                    <div className="flex items-center gap-2">
                      <DateRangeCalendar
                        fechaDesde={fechaDesde}
                        fechaHasta={fechaHasta}
                        setFechaDesde={(date) => { setFechaDesdeTemp(date); cargarVentas(date, fechaHasta); }}
                        setFechaHasta={(date) => { setFechaHastaTemp(date); cargarVentas(fechaDesde, date); }}
                        onApply={() => { }}
                      />
                      <Button variant="outline" size="icon" onClick={() => cargarVentas(fechaDesde, fechaHasta)} disabled={isLoadingVentas} className="rounded-xl border-amber-200 h-10 w-10 text-amber-500 hover:text-amber-700 hover:bg-white transition-all">
                        <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-700 font-bold flex items-center gap-2 justify-end"><AlertTriangle className="h-4 w-4" /> Área de Modificaciones</p>
                  <p className="text-[10px] text-amber-600">Las ediciones quedarán registradas en el historial.</p>
                </div>
              </div>

              <div className="flex-grow bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-grow h-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="text-[10px] font-bold uppercase py-3">ID Venta</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Fecha / Hora</TableHead>
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
                        <TableRow><TableCell colSpan={10} className="py-20 text-center text-slate-400 italic">No hay ventas para gestionar en esta fecha</TableCell></TableRow>
                      ) : (
                        ventasRealizadas.map((v) => (
                          <TableRow key={v.id} className="hover:bg-slate-50/50">
                            <TableCell className="py-4">
                              <span className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200" title={v.id}>
                                {v.numeroVenta || v.id.slice(0, 8)}
                              </span>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-slate-700 font-bold whitespace-nowrap">{new Date(v.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-bold text-slate-700 py-4">
                              {v.cliente}
                              {v.puntoVenta && <div className="mt-1"><span className="inline-block px-2 py-0.5 rounded-full uppercase text-white" style={{ backgroundColor: v.puntoVenta.color || '#10b981' }}>{v.puntoVenta.nombre}</span></div>}
                            </TableCell>
                            <TableCell className="py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : v.metodo_pago === 'Mixto' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {v.metodo_pago}
                              </span>
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono text-slate-600">
                              {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.de || "-") : (v.cupon || "-")}
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono text-slate-600">
                              {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.para || "-") : (v.transaccionId || "-")}
                            </TableCell>
                            <TableCell className="py-4 text-xs text-slate-500 max-w-[200px]" title={v.info || ""}>
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
                              <Button size="sm" variant="destructive" onClick={() => abrirModalEliminacion(v)} className="bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 border border-red-300">
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
                        <p className="font-bold text-slate-900 leading-tight">
                          {prod.esPack && <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-1.5 py-0.5 rounded border border-purple-200 mr-2 uppercase">Pack</span>}
                          {prod.nombre}
                        </p>
                        <span className={`text-sm font-black px-2 py-0.5 rounded-md border ${prod.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : prod.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                          Stock: {prod.stock}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono uppercase">ID: {prod.id}</p>
                    </div>
                  </div>
                  <p className="font-medium text-slate-900">$ {Number(prod.precio).toLocaleString('es-AR')}</p>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isFinalizarModalOpen} onOpenChange={setIsFinalizarModalOpen}>
          <DialogContent className="sm:max-w-[550px] rounded-3xl p-6">
            <DialogHeader><DialogTitle className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-600" /> Detalles del Cobro</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Cliente / Razón Social</Label>
                <div className="relative">
                  <Input value={cliente} onChange={(e) => setCliente(e.target.value)} className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white transition-colors" />
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* SELECTOR DE PAGO MIXTO */}
              <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="pagoMixto"
                  checked={isPagoMixto}
                  onChange={(e) => {
                    setIsPagoMixto(e.target.checked);
                    if (e.target.checked && montoPago1 === 0) setMontoPago1(totalBase / 2);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <Label htmlFor="pagoMixto" className="text-sm font-bold text-slate-700 cursor-pointer">
                  Pago Mixto (Dividir en 2 métodos de pago)
                </Label>
              </div>

              {isPagoMixto ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-purple-50 p-4 rounded-xl border border-purple-200 animate-in fade-in">
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-purple-800 uppercase">Metodo 1</Label>
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-purple-200 bg-white px-3 text-sm focus:outline-none">
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                      <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                      <option value="Cruzada">Cruzada</option>
                    </select>
                    <div>
                      <Label className="text-[10px] font-bold text-purple-600 uppercase block mb-1">Monto Base a pagar 1</Label>
                      <Input type="number" value={montoPago1} onChange={(e) => setMontoPago1(Number(e.target.value))} className="font-bold border-purple-200 h-10 text-base" />
                    </div>
                    {isCredito1 && (
                      <p className="text-[10px] font-bold text-purple-700 bg-purple-100 p-2 rounded-lg border border-purple-200">
                        Total P1 (+{interesTarjeta}%): <span className="text-sm block">$ {final1.toLocaleString('es-AR')}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-purple-800 uppercase">Metodo 2</Label>
                    <select value={metodoPago2} onChange={(e) => setMetodoPago2(e.target.value)} className="w-full h-10 rounded-xl border border-purple-200 bg-white px-3 text-sm focus:outline-none">
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                      <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                      <option value="Cruzada">Cruzada</option>
                    </select>
                    <div>
                      <Label className="text-[10px] font-bold text-purple-600 uppercase block mb-1">Monto Base Restante 2</Label>
                      <div className="h-10 bg-purple-100/50 rounded-xl border border-purple-200 flex items-center px-3 font-bold text-purple-900">
                        $ {base2.toLocaleString('es-AR')}
                      </div>
                    </div>
                    {isCredito2 && (
                      <p className="text-[10px] font-bold text-purple-700 bg-purple-100 p-2 rounded-lg border border-purple-200">
                        Total P2 (+{interesTarjeta}%): <span className="text-sm block">$ {final2.toLocaleString('es-AR')}</span>
                      </p>
                    )}
                  </div>

                  <div className="col-span-1 md:col-span-2 mt-2 bg-purple-700 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Final Calculado</span>
                    <span className="text-2xl font-black">$ {totalFinalCalculado.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Forma de Pago</Label>
                  <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:outline-none">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                    <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                    <option value="Cruzada">Cruzada</option>
                  </select>
                </div>
              )}

              {requiereTarjeta && (
                <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 animate-in fade-in">
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">DNI <span className="text-red-500">*</span></Label><Input value={dni} onChange={(e) => setDni(e.target.value)} className="bg-white border-blue-200" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">Teléfono <span className="text-red-500">*</span></Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="bg-white border-blue-200" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">N° Cupón <span className="text-red-500">*</span></Label><Input value={cupon} onChange={(e) => setCupon(e.target.value)} className="bg-white border-blue-200" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-blue-700">ID Transacción <span className="text-red-500">*</span></Label><Input value={transaccionId} onChange={(e) => setTransaccionId(e.target.value)} className="bg-white border-blue-200" /></div>
                </div>
              )}

              {requiereCruzada && (
                <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-100 animate-in fade-in">
                  <div className="space-y-2"><Label className="text-xs font-bold text-amber-700">De <span className="text-red-500">*</span></Label><Input value={deCruzada} onChange={(e) => setDeCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Origen" /></div>
                  <div className="space-y-2"><Label className="text-xs font-bold text-amber-700">Para <span className="text-red-500">*</span></Label><Input value={paraCruzada} onChange={(e) => setParaCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Destino" /></div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Punto de Venta</Label>
                  <div className="relative">
                    <select
                      value={puntoVentaId || ""}
                      onChange={(e) => {
                        setPuntoVentaId(e.target.value);
                        const seleccionado = puntosVenta?.find((p: any) => p.id === e.target.value);
                        setPuntoVentaSeleccionado(seleccionado || null);
                      }}
                      className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none color-select cursor-pointer"
                      style={{ backgroundColor: puntoVentaSeleccionado ? puntoVentaSeleccionado.color : '#ffffff' }}
                    >
                      <option value="">Seleccionar...</option>
                      {puntosVenta?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
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

              <div className="space-y-2"><Label className="text-xs font-bold text-slate-500 uppercase">Observaciones / Datos de Envío (Dirección, Teléfono, etc.)</Label><Textarea value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Dirección, referencias, método de entrega, observaciones adicionales..." className="min-h-[80px]" /></div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4 mb-2">
              <Label className="text-xs font-bold text-slate-600 uppercase block mb-3 text-center">Acción Final</Label>
              <div className="flex flex-col gap-5">
                <Button 
                  onClick={() => handleFinalizarVenta(false)} 
                  disabled={isSubmitting} 
                  className="bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold w-full"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-5 w-5 mr-2" /> Registrar venta</>}
                </Button>
                <Button 
                  onClick={() => handleFinalizarVenta(true)} 
                  disabled={isSubmitting} 
                  className="bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white h-10 rounded-xl font-bold w-full text-sm shadow-md"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Clock className="h-4 w-4 mr-2" /> Pedido de venta</>}
                </Button>
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button variant="ghost" onClick={() => setIsFinalizarModalOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
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

                <div className="flex gap-4 items-end flex-wrap mb-2">
                  <div className="space-y-1.5 flex-grow min-w-[200px]">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Cliente / Razón Social</Label>
                    <Input value={editCliente} onChange={(e) => setEditCliente(e.target.value)} className="bg-slate-50" />
                  </div>
                  <div className="space-y-1.5 w-32">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">% Interés Gral.</Label>
                    <Input type="number" value={editInteresTarjeta} onChange={(e) => setEditInteresTarjeta(Number(e.target.value))} className="font-bold text-blue-600 bg-slate-50" />
                  </div>
                  <div className="text-right bg-amber-50 p-2 px-4 rounded-xl border border-amber-100 ml-auto">
                    <span className="text-[10px] font-bold text-amber-700 uppercase block mb-0.5">Total Base Gral.</span>
                    <span className="text-2xl font-black text-amber-900">$ {totalBaseEdit.toLocaleString('es-AR')}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center space-x-3 mb-4">
                    <input
                      type="checkbox"
                      id="editPagoMixto"
                      checked={isEditPagoMixto}
                      onChange={(e) => {
                        setIsEditPagoMixto(e.target.checked);
                        if (e.target.checked && editMontoPago1 === 0) setEditMontoPago1(totalBaseEdit / 2);
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                    />
                    <Label htmlFor="editPagoMixto" className="text-sm font-bold text-slate-700 cursor-pointer">
                      Pago Mixto (Dividir en 2 métodos de pago)
                    </Label>
                  </div>

                  {isEditPagoMixto ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-purple-50 p-4 rounded-xl border border-purple-200 animate-in fade-in">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold text-purple-800 uppercase">Pago 1 (Principal)</Label>
                        <select value={editMetodoPago} onChange={(e) => setEditMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-purple-200 bg-white px-3 text-sm focus:outline-none">
                          <option value="Efectivo">Efectivo</option>
                          <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                          <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                          <option value="Cruzada">Cruzada</option>
                        </select>
                        <div>
                          <Label className="text-[10px] font-bold text-purple-600 uppercase block mb-1">Monto 1</Label>
                          <Input type="number" value={editMontoPago1} onChange={(e) => setEditMontoPago1(Number(e.target.value))} className="font-bold border-purple-200 h-10 text-base" />
                        </div>
                        {isEditCredito1 && (
                          <p className="text-[10px] font-bold text-purple-700 bg-purple-100 p-2 rounded-lg border border-purple-200">
                            Total P1 (+{editInteresTarjeta}%): <span className="text-sm block">$ {editFinal1.toLocaleString('es-AR')}</span>
                          </p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <Label className="text-xs font-bold text-purple-800 uppercase">Pago 2 (Restante)</Label>
                        <select value={editMetodoPago2} onChange={(e) => setEditMetodoPago2(e.target.value)} className="w-full h-10 rounded-xl border border-purple-200 bg-white px-3 text-sm focus:outline-none">
                          <option value="Efectivo">Efectivo</option>
                          <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                          <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                          <option value="Cruzada">Cruzada</option>
                        </select>
                        <div>
                          <Label className="text-[10px] font-bold text-purple-600 uppercase block mb-1">Monto 2</Label>
                          <div className="h-10 bg-purple-100/50 rounded-xl border border-purple-200 flex items-center px-3 font-bold text-purple-900">
                            $ {editBase2.toLocaleString('es-AR')}
                          </div>
                        </div>
                        {isEditCredito2 && (
                          <p className="text-[10px] font-bold text-purple-700 bg-purple-100 p-2 rounded-lg border border-purple-200">
                            Total P2 + interes (+{editInteresTarjeta}%): <span className="text-sm block">$ {editFinal2.toLocaleString('es-AR')}</span>
                          </p>
                        )}
                      </div>

                      <div className="col-span-1 md:col-span-2 mt-2 bg-purple-700 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                        <span className="text-xs font-bold uppercase tracking-wider">Total Final</span>
                        <span className="text-2xl font-black">$ {editTotalFinalCalculado.toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 w-64">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Forma de Pago Única</Label>
                      <select value={editMetodoPago} onChange={(e) => setEditMetodoPago(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none">
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                        <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                        <option value="Cruzada">Cruzada</option>
                      </select>
                    </div>
                  )}
                </div>

                {requiereTarjetaEdit && (
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

                {requiereCruzadaEdit && (
                  <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200 animate-in fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-amber-800">De <span className="text-red-500">*</span></Label>
                      <Input value={editDeCruzada} onChange={(e) => setEditDeCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Origen" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-amber-800">Para <span className="text-red-500">*</span></Label>
                      <Input value={editParaCruzada} onChange={(e) => setEditParaCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Destino" />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 w-full">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase">Observaciones / Datos de Envío (Dirección, Teléfono, etc.)</Label>
                  <Textarea value={editInfo} onChange={(e) => setEditInfo(e.target.value)} className="bg-slate-50 min-h-[80px]" placeholder="Dirección, referencias, método de entrega, observaciones adicionales..." />
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center w-full bg-slate-100/50 p-3 rounded-xl border border-slate-200 mt-2">
                  <div className="space-y-1.5 flex-grow w-full md:w-auto">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Punto de Venta</Label>
                    <select value={editPuntoVentaId} onChange={(e) => setEditPuntoVentaId(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none">
                      <option value="">Seleccionar...</option>
                      {puntosVenta?.map((p: any) => (
                        <option key={p.id} value={p.id} style={{ backgroundColor: p.color, color: '#ffffff' }}>{p.nombre}</option>
                      ))}
                    </select>
                    {editPuntoVentaId && puntosVenta?.find((p: any) => p.id === editPuntoVentaId) && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-3 h-3 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: puntosVenta.find((p: any) => p.id === editPuntoVentaId)?.color }}></div>
                        <span className="text-[10px] text-slate-500 font-mono">{puntosVenta.find((p: any) => p.id === editPuntoVentaId)?.color}</span>
                      </div>
                    )}
                  </div>
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
                            <Input type="number" value={item.cantidad} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? { ...i, cantidad: Number(e.target.value), subtotal: Number(e.target.value) * i.precio_unit } : i))} className={`w-16 mx-auto h-8 ${inputSinFlechas}`} />
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title="Editar precio base en el sistema"
                                onClick={() => abrirModalPrecioDB(item.productoId ?? item.id, item.precio_unit)}
                              >
                                <Database className="h-4 w-4" />
                              </Button>
                              <span className="text-slate-400 text-xs ml-1">$</span>
                              <Input type="number" value={item.precio_unit} onChange={(e) => setEditItems(editItems.map(i => i.id === item.id ? { ...i, precio_unit: Number(e.target.value), subtotal: i.cantidad * Number(e.target.value) } : i))} className={`w-28 h-8 ${inputSinFlechas}`} />

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Guardar este precio en la Base de Datos"
                                onClick={() => abrirModalFastUpdate(item.productoId ?? item.id, item.precio_unit)}
                              >
                                <Save className="h-4 w-4" />
                              </Button>

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
                            $ {Number(item.subtotal).toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="text-center"><Button variant="ghost" size="icon" onClick={() => setEditItems(editItems.filter((i: ItemVenta) => i.id !== item.id))} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></Button></TableCell>
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
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Guardar Modificación</>}
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
                  <p className="font-medium text-slate-900">$ {Number(prod.precio).toLocaleString('es-AR')}</p>
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

        {/* --- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE VENTA --- */}
        <Dialog open={isEliminarModalOpen} onOpenChange={setIsEliminarModalOpen}>
          <DialogContent className="sm:max-w-[450px] rounded-3xl p-6 border-2 border-red-400 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-900">
                <AlertTriangle className="h-5 w-5 text-red-600" /> Confirmar Eliminación de Venta
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Esta acción eliminará permanentemente la venta y todos sus datos relacionados.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Advertencia visual */}
              <div className="p-4 bg-red-50/50 rounded-xl border border-red-200 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-grow">
                  <p className="text-sm font-bold text-red-900 mb-1">⚠️ ¡ATENCIÓN!</p>
                  <p className="text-xs text-red-700 leading-relaxed">
                    Esta acción es <b>irreversible</b>. Se eliminará:
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      <li>Los datos principales de la venta</li>
                      <li>Todos los items de la venta</li>
                      <li>El historial de auditoría de la venta</li>
                    </ul>
                  </p>
                </div>
              </div>

              {/* Información de la venta a eliminar */}
              {ventaAEliminar && (
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Venta a Eliminar</p>
                  <p className="text-sm font-medium text-slate-900">{ventaAEliminar.cliente}</p>
                  <p className="text-xs text-slate-500 mt-1">ID: {ventaAEliminar.id}</p>
                  <p className="text-sm font-bold text-slate-700 mt-2">Total: ${ventaAEliminar.totalFinal?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-500 mt-1">Fecha: {new Date(ventaAEliminar.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-3 mt-2">
              <Button variant="outline" onClick={() => setIsEliminarModalOpen(false)} className="border-slate-300 text-slate-700 hover:bg-slate-100">
                Cancelar
              </Button>
              <Button onClick={handleEliminarVenta} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold px-6 shadow-md">
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar Venta
              </Button>
            </DialogFooter>
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
                <p className="text-sm font-bold text-slate-900 mt-2">Precio Viejo: ${Number(priceDbItem?.precio).toLocaleString('es-AR')}</p>
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

// ========================================================================
// --- COMPONENTE DE TICKET DE IMPRESIÓN "X" PARA IMPRESORA TÉRMICA ---
// ========================================================================
function TicketImpresion({
  ventaId,
  numeroVenta,
  items,
  total,
  cliente,
  metodoPago
}: {
  ventaId: string,
  numeroVenta?: number,
  items: ItemVenta[],
  total: number,
  cliente: string,
  metodoPago: string
}) {
  const [mounted, setMounted] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [fechaActual, setFechaActual] = useState("");

  useEffect(() => {
    setMounted(true);
    setTicketId(String(Date.now()).slice(-8));
    setFechaActual(new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  }, []);

  if (!mounted) return null;

  const formatPrecio = (num: number | string) => {
    return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const clienteFinalStr = cliente && cliente !== "Consumidor Final" ? cliente.toUpperCase() : "CONSUMIDOR FINAL";

  return (
    <div className="hidden print:flex flex-col w-[48mm] mx-auto font-mono text-black bg-white text-[9px] uppercase leading-tight" style={{ margin: 0, padding: 0 }}>
      <style type="text/css" media="print">
        {`
          @page { margin: 0; size: 58mm auto; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; color-adjust: exact; background-color: white;}
          .border-print-black { border-color: black !important; }
        `}
      </style>

      <div className="text-center w-full mb-1">
        <p>NO VALIDO COMO FACTURA</p>
        <p>{fechaActual}</p>
        <p>ID VENTA: {numeroVenta || ventaId.slice(0, 8)}</p>
        <p>NRO: 00099-{ticketId}</p>
      </div>

      <div className="flex justify-center my-2">
        <div className="border-[1.5px] border-print-black border-black w-8 h-8 flex items-center justify-center font-bold text-xl">
          X
        </div>
      </div>

      <div className="text-left w-full mb-1">
        <p>CUIT: 30-00000000-0</p>
      </div>

      <div className="text-center w-full mb-2">
        <p>//</p>
      </div>

      <div className="text-left w-full mb-2">
        <p className="font-bold text-[10px]">{clienteFinalStr}</p>
        <p>CORDOBA</p>
        <p>{metodoPago.toUpperCase()}</p>
      </div>

      <div className="w-full border-t border-print-black border-black my-1"></div>

      <table className="w-full text-[9px] leading-tight text-left border-collapse table-fixed">
        <thead>
          <tr>
            <th className="font-normal w-[12%] pb-1 pt-1 align-bottom">CANT</th>
            <th className="font-normal w-[63%] pb-1 pt-1 align-bottom">DESC.</th>
            <th className="font-normal w-[25%] pb-1 pt-1 text-right align-bottom">TOTAL</th>
          </tr>
        </thead>
        <tbody className="before:content-[''] before:block before:h-1">
          {items.map((item: ItemVenta, idx: number) => (
            <tr key={idx} className="align-top">
              <td className="pt-0.5">{item.cantidad}</td>
              <td className="pt-0.5 pr-1 break-words whitespace-normal">{item.nombre}</td>
              <td className="pt-0.5 text-right">{formatPrecio(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="w-full border-t border-print-black border-black my-1 mt-2"></div>

      <div className="flex justify-between items-center w-full mt-1 mb-1">
        <span>SUBTOTAL:</span>
        <span>{formatPrecio(total)}</span>
      </div>

      <div className="flex justify-between items-center w-full font-bold text-[10px] mb-2">
        <span>TOTAL:</span>
        <span>{formatPrecio(total)}</span>
      </div>

      <div className="text-left w-full mb-2">
        <p>SON PESOS:</p>
        <p className="break-words">{numeroALetras(Number(total))}</p>
      </div>

      <div className="text-left w-full mt-2 mb-2">
        <p>SALDO ANTERIOR: 0.00</p>
      </div>

      <div className="text-center w-full mt-2 pb-6">
        <p>//</p>
      </div>

    </div>
  );
}

function numeroALetras(num: number): string {
  const Unidades = (n: number) => {
    switch (n) {
      case 1: return "UN"; case 2: return "DOS"; case 3: return "TRES"; case 4: return "CUATRO"; case 5: return "CINCO"; case 6: return "SEIS"; case 7: return "SIETE"; case 8: return "OCHO"; case 9: return "NUEVE"; default: return "";
    }
  };
  const Decenas = (n: number) => {
    const decena = Math.floor(n / 10); const unidad = n - (decena * 10);
    switch (decena) {
      case 1: switch (unidad) { case 0: return "DIEZ"; case 1: return "ONCE"; case 2: return "DOCE"; case 3: return "TRECE"; case 4: return "CATORCE"; case 5: return "QUINCE"; default: return "DIECI" + Unidades(unidad); }
      case 2: return unidad === 0 ? "VEINTE" : "VEINTI" + Unidades(unidad);
      case 3: return DecenasY("TREINTA", unidad); case 4: return DecenasY("CUARENTA", unidad); case 5: return DecenasY("CINCUENTA", unidad);
      case 6: return DecenasY("SESENTA", unidad); case 7: return DecenasY("SETENTA", unidad); case 8: return DecenasY("OCHENTA", unidad);
      case 9: return DecenasY("NOVENTA", unidad); case 0: return Unidades(unidad); default: return "";
    }
  };
  const DecenasY = (strSin: string, numUnidades: number) => numUnidades > 0 ? strSin + " Y " + Unidades(numUnidades) : strSin;
  const Centenas = (n: number) => {
    const centenas = Math.floor(n / 100); const decenas = n - (centenas * 100);
    switch (centenas) {
      case 1: return decenas > 0 ? "CIENTO " + Decenas(decenas) : "CIEN"; case 2: return "DOSCIENTOS " + Decenas(decenas); case 3: return "TRESCIENTOS " + Decenas(decenas);
      case 4: return "CUATROCIENTOS " + Decenas(decenas); case 5: return "QUINIENTOS " + Decenas(decenas); case 6: return "SEISCIENTOS " + Decenas(decenas);
      case 7: return "SETECIENTOS " + Decenas(decenas); case 8: return "OCHOCIENTOS " + Decenas(decenas); case 9: return "NOVECIENTOS " + Decenas(decenas); default: return Decenas(decenas);
    }
  };
  const Miles = (n: number) => {
    const divisor = 1000; const cientos = Math.floor(n / divisor); const resto = n - (cientos * divisor);
    let strMiles = "";
    if (cientos > 0) strMiles = cientos > 1 ? Centenas(cientos) + " MIL" : "UN MIL";
    return strMiles === "" ? Centenas(resto) : strMiles + " " + Centenas(resto);
  };
  const Millones = (n: number) => {
    const divisor = 1000000; const cientos = Math.floor(n / divisor); const resto = n - (cientos * divisor);
    let strMillones = "";
    if (cientos > 0) strMillones = cientos > 1 ? Centenas(cientos) + " MILLONES" : "UN MILLON";
    return strMillones === "" ? Miles(resto) : strMillones + " " + Miles(resto);
  };

  const enteros = Math.floor(num);
  const centavos = Math.round((num - enteros) * 100).toString().padStart(2, '0');
  if (enteros === 0) return `CERO CON ${centavos}/100`;
  return `${Millones(enteros).trim()} CON ${centavos}/100`;
}
