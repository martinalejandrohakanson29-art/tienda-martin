"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Plus, Search, User, Trash2, ShoppingCart, Loader2, CreditCard, Phone, FileText, ShieldCheck,
  Calendar as CalendarIcon, ClipboardList, CheckCircle2, AlertTriangle, Clock,
  RefreshCcw, Copy, Square, CheckSquare, Percent, Edit, History, Save, Database, Printer, CheckCircle,
  ChevronDown, ArrowLeft, X, Package, BellRing, Bell, ArrowRightLeft,
  Maximize2, Camera, ImageOff
} from "lucide-react";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DateRangeCalendar } from "./date-range-calendar";
import {
  crearVentaMostrador, guardarComoPedidoVenta, obtenerVentasPorFecha, obtenerVentasPorRango, obtenerVentasMLPorRango, marcarVentaComoRegistrada,
  actualizarVentaMostrador, obtenerHistorialVenta, actualizarPrecioArticuloDB, sincronizarArticulosMostrador,
  eliminarVentaMostrador,
  generarFacturaARCA, cancelarVenta, buscarVentaGlobalPorMLId, actualizarAlertaML, refacturarComoA
} from "@/app/actions/ventas-mostrador";
import { obtenerProveedores, crearProveedor, crearArticuloMostrador, actualizarObservacionesProveedor } from "@/app/actions/listas";
import { obtenerFotosEnvio, obtenerEnviosConFoto } from "@/app/actions/preparacion";
import { obtenerFotosPedido, obtenerPedidosConFoto } from "@/app/actions/preparacion-pedidos";
import { consultarPadron } from "@/app/actions/afip";
import PedidosVentaEdicionClient from "@/app/admin/erp/pedidos-venta/pedidos-venta-edicion-client";
import EnviosAndreaniTab from "./envios-andreani-tab";

// Métodos de pago con ícono y color suave para distinguir cada opción de un vistazo.
// El `value` se mantiene idéntico al guardado en BD; solo cambia la etiqueta visible.
const METODOS_PAGO = [
  { value: "Efectivo", label: "💵 Efectivo", color: "#dcfce7" },
  { value: "Tarjeta de Crédito", label: "💳 Tarjeta de Crédito", color: "#dbeafe" },
  { value: "Tarjeta de Débito", label: "🏧 Tarjeta de Débito", color: "#cffafe" },
  { value: "MercadoLibre", label: "🟡 MercadoLibre", color: "#fef9c3" },
  { value: "MercadoPago", label: "🔵 MercadoPago", color: "#e0e7ff" },
  { value: "Cruzada", label: "🔁 Cruzada", color: "#f3e8ff" },
  { value: "A Cuenta Corriente", label: "📒 A Cuenta Corriente", color: "#ffedd5" },
  { value: "A Confirmar", label: "⏳ A Confirmar", color: "#f1f5f9" },
];

function OpcionesMetodoPago({ incluirAConfirmar = true }: { incluirAConfirmar?: boolean }) {
  return (
    <>
      {METODOS_PAGO
        .filter((m) => incluirAConfirmar || m.value !== "A Confirmar")
        .map((m) => (
          <option key={m.value} value={m.value} style={{ backgroundColor: m.color }}>
            {m.label}
          </option>
        ))}
    </>
  );
}

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
  costo?: number;
  margenGanancia?: number;
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
  esNota?: boolean;
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

const transformDriveLink = (url: string) => {
  if (!url) return "";
  if (url.includes("drive.google.com") && url.includes("/d/")) {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (idMatch && idMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${idMatch[1]}`
    }
  }
  return url;
}

export default function VentasMostradorClient({
  articulosIniciales,
  vendedorNombre,
  puntosVenta = [],
  config
}: {
  articulosIniciales: Articulo[],
  vendedorNombre: string,
  puntosVenta?: any[],
  config?: any
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
  const [showNotaInput, setShowNotaInput] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const [expandirPacks, setExpandirPacks] = useState(true);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isGuardarComoPedido, setIsGuardarComoPedido] = useState(false);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [cliente, setCliente] = useState("Consumidor Final");
  const [cuitBusqueda, setCuitBusqueda] = useState("");
  const [isSearchingPadron, setIsSearchingPadron] = useState(false);
  const [interesTarjeta, setInteresTarjeta] = useState<number>(0);

  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [isPagoMixto, setIsPagoMixto] = useState(false);
  const [montoPago1, setMontoPago1] = useState<number>(0);
  const [metodoPago2, setMetodoPago2] = useState("Tarjeta de Crédito");
  // Procesador / entidad de la tarjeta de crédito (sub-dato de "Tarjeta de Crédito")
  const [procesadorTarjeta, setProcesadorTarjeta] = useState("Posnet Intercap");

  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [info, setInfo] = useState("");
  const [cupon, setCupon] = useState("");
  const [transaccionId, setTransaccionId] = useState("");
  const [deCruzada, setDeCruzada] = useState("");
  const [paraCruzada, setParaCruzada] = useState("");
  const [proveedoresCruzada, setProveedoresCruzada] = useState<{ id: string, razonSocial: string, monto: number }[]>([]);
  const [showProvListMulti, setShowProvListMulti] = useState<number | null>(null);
  const [paraCuentaCorriente, setParaCuentaCorriente] = useState("");
  const [showProvListCC, setShowProvListCC] = useState(false);

  // --- ESTADOS PARA MERCADOLIBRE Y MERCADOPAGO ---
  const [mlIdVenta, setMlIdVenta] = useState("");
  const [mlIdEnvio, setMlIdEnvio] = useState("");
  const [mlMla, setMlMla] = useState("");
  const [mlDni, setMlDni] = useState("");

  const [email, setEmail] = useState("");
  const [eventoOffline, setEventoOffline] = useState(false);
  const [puntoVentaId, setPuntoVentaId] = useState("");
  const [puntoVentaSeleccionado, setPuntoVentaSeleccionado] = useState<any>(null);

  // --- ESTADOS PARA ARCA (FACTURACIÓN) ---
  const [docTipo, setDocTipo] = useState<number>(99); // Consumidor Final por defecto
  const [docNro, setDocNro] = useState<string>("");
  const [condicionIva, setCondicionIva] = useState<number>(5); // Consumidor Final
  const facturaRef = useRef<HTMLDivElement>(null);
  const pedidoRef = useRef<HTMLDivElement>(null);
  const [ventaParaFactura, setVentaParaFactura] = useState<any>(null);
  const [ventaParaPedido, setVentaParaPedido] = useState<any>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isFacturando, setIsFacturando] = useState(false);
  const [isEliminando, setIsEliminando] = useState(false);
  const [tipoFacturaSugerida, setTipoFacturaSugerida] = useState<number>(6); // B por defecto para Responsable Inscripto
  const [solicitarFactura, setSolicitarFactura] = useState(false);
  const [sujetoId, setSujetoId] = useState<string | null>(null);
  const [sujetosEncontrados, setSujetosEncontrados] = useState<any[]>([]);
  const [isSearchingSujetos, setIsSearchingSujetos] = useState(false);
  const [showSujetoList, setShowSujetoList] = useState(false);
  const [isSavingObsProveedor, setIsSavingObsProveedor] = useState(false);

  const searchSujetoRef = useRef<HTMLDivElement>(null);

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

  // Click outside search results to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchSujetoRef.current && !searchSujetoRef.current.contains(event.target as Node)) {
        setShowSujetoList(false);
      }
      if (puntoVentaRef.current && !puntoVentaRef.current.contains(event.target as Node)) {
        setIsPuntoVentaOpen(false);
      }
      if (puntoVentaGestionRef.current && !puntoVentaGestionRef.current.contains(event.target as Node)) {
        setIsPuntoVentaOpenGestion(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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

  // --- ESTADO PARA VISUALIZACIÓN DE FOTOS DE AUDITORÍA (Mercado Libre) ---
  const [fotosVenta, setFotosVenta] = useState<{ venta: any; fotos: any[] } | null>(null);
  const [loadingFotosVentaId, setLoadingFotosVentaId] = useState<string | null>(null);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);
  // Set de mlIdEnvio que tienen al menos una foto cargada (habilita el botón "Ver foto")
  const [enviosConFoto, setEnviosConFoto] = useState<Set<string>>(new Set());
  // Estado de auditoría por ventaId para Pedidos de Venta (FOTO_CARGADA | AUDITADO | RECHAZADO)
  const [pedidosConFoto, setPedidosConFoto] = useState<Record<string, string>>({});

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
  const [editParaCuentaCorriente, setEditParaCuentaCorriente] = useState("");
  const [showProvListCCEdit, setShowProvListCCEdit] = useState(false);
  const [editMlIdVenta, setEditMlIdVenta] = useState("");
  const [editMlIdEnvio, setEditMlIdEnvio] = useState("");
  const [editMlMla, setEditMlMla] = useState("");
  const [editMlDni, setEditMlDni] = useState("");

  const [editEmail, setEditEmail] = useState("");
  const [editEventoOffline, setEditEventoOffline] = useState(false);
  const [editPuntoVentaId, setEditPuntoVentaId] = useState("");
  const [editDocTipo, setEditDocTipo] = useState<number>(99);
  const [editDocNro, setEditDocNro] = useState<string>("");
  const [editCondicionIva, setEditCondicionIva] = useState<number>(5);
  const [editCuitBusqueda, setEditCuitBusqueda] = useState("");
  const [isSearchingPadronEdit, setIsSearchingPadronEdit] = useState(false);
  const [editTipoFacturaSugerida, setEditTipoFacturaSugerida] = useState<number>(6);

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

  // --- ESTADO PARA FILTRO OFFLINE Y BUSQUEDA ---
  const [mostrarSoloOffline, setMostrarSoloOffline] = useState(false);
  const [filtroPuntoVenta, setFiltroPuntoVenta] = useState<string[]>([]);
  const [isPuntoVentaOpen, setIsPuntoVentaOpen] = useState(false);
  const [isPuntoVentaOpenGestion, setIsPuntoVentaOpenGestion] = useState(false);
  const puntoVentaRef = useRef<HTMLDivElement>(null);
  const puntoVentaGestionRef = useRef<HTMLDivElement>(null);
  const [filtroBusquedaTexto, setFiltroBusquedaTexto] = useState("");
  const [tipoBusqueda, setTipoBusqueda] = useState<"venta" | "cliente" | "mla_venta" | "mla_envio">("venta");
  const [filtroMetodoPago, setFiltroMetodoPago] = useState("");
  const [ventasGlobales, setVentasGlobales] = useState<any[] | null>(null);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [ventasML, setVentasML] = useState<any[]>([]);
  const [mlCargadas, setMlCargadas] = useState(false);
  const [isLoadingML, setIsLoadingML] = useState(false);

  // --- ESTADO PARA ELIMINAR VENTA ---
  const [ventaAEliminar, setVentaAEliminar] = useState<any>(null);

  // --- ESTADOS PARA ALERTA ML ---
  const [isAlertaAnulacionOpen, setIsAlertaAnulacionOpen] = useState(false);
  const [isAlertaMLOpen, setIsAlertaMLOpen] = useState(false);
  const [ventaParaAlerta, setVentaParaAlerta] = useState<any>(null);
  const [alertaActiva, setAlertaActiva] = useState(false);
  const [alertaObservacion, setAlertaObservacion] = useState("");
  const [isGuardandoAlerta, setIsGuardandoAlerta] = useState(false);

  // --- ESTADOS PARA EDICIÓN DE PRECIO EN BASE DE DATOS ---
  const [isPriceDbModalOpen, setIsPriceDbModalOpen] = useState(false);
  const [priceDbItem, setPriceDbItem] = useState<Articulo | null>(null);
  const [newDbPrice, setNewDbPrice] = useState<number>(0);
  const [isUpdatingDbPrice, setIsUpdatingDbPrice] = useState(false);

  // --- NUEVOS ESTADOS PARA ACTUALIZACIÓN RÁPIDA DE PRECIO ---
  const [isFastUpdateDbModalOpen, setIsFastUpdateDbModalOpen] = useState(false);
  const [fastUpdateData, setFastUpdateData] = useState<{ id: string, nombre: string, oldPrice: number, newPrice: number } | null>(null);

  // --- ESTADOS PARA PROVEEDORES EN CRUZADA ---
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [isAddProveedorModalOpen, setIsAddProveedorModalOpen] = useState(false);
  const [newProvData, setNewProvData] = useState({ razonSocial: "", cuit: "", nombreFantasia: "", email: "", telefono: "" });
  const [isCreatingProveedor, setIsCreatingProveedor] = useState(false);
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

  // Limpiar resultados globales cuando el usuario cambia el término de búsqueda
  useEffect(() => {
    setVentasGlobales(null);
  }, [filtroBusquedaTexto, tipoBusqueda]);

  // Carga inicial al montar el componente
  useEffect(() => {
    cargarVentas(fechaDesde, fechaHasta);
    cargarVentasML();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar proveedores
  useEffect(() => {
    const fetchProveedores = async () => {
      const res = await obtenerProveedores();
      if (res.success && res.data) setProveedores(res.data);
    };
    fetchProveedores();
  }, []);

  const handleCrearProveedorRapido = async () => {
    if (!newProvData.razonSocial || !newProvData.cuit) {
      alert("Razón Social y CUIT son obligatorios");
      return;
    }
    setIsCreatingProveedor(true);
    const res = await crearProveedor(newProvData);
    if (res.success && res.data) {
      const nuevo = res.data as any;
      setProveedores(prev => [nuevo, ...prev]);
      // Si estamos en nueva venta, lo seleccionamos
      if (isFinalizarModalOpen) setParaCruzada(nuevo.razonSocial);
      // Si estamos en edición, lo seleccionamos
      if (isEditMainModalOpen) setEditParaCruzada(nuevo.razonSocial);

      setIsAddProveedorModalOpen(false);
      setNewProvData({ razonSocial: "", cuit: "", nombreFantasia: "", email: "", telefono: "" });
      mostrarMensajeExito("Proveedor creado con éxito");
    } else {
      alert("Error al crear proveedor: " + res.error);
    }
    setIsCreatingProveedor(false);
  };


  // --- FUNCIONES COMUNES ---
  const handleBuscarGlobal = async () => {
    if (!filtroBusquedaTexto.trim()) return;
    setIsSearchingGlobal(true);
    try {
      const res = await buscarVentaGlobalPorMLId(filtroBusquedaTexto.trim());
      if (res.success) {
        setVentasGlobales(res.data || []);
      }
    } catch (error) {
      console.error("Error en búsqueda global:", error);
    } finally {
      setIsSearchingGlobal(false);
    }
  };

  const cargarVentas = async (fechaDesde: string, fechaHasta: string) => {
    setIsLoadingVentas(true);
    try {
      const res = await obtenerVentasPorRango(fechaDesde, fechaHasta, true);
      if (res.success) {
        setVentasRealizadas(res.data || []);
      }
    } catch (error) {
      console.error("Error al cargar ventas:", error);
    } finally {
      setIsLoadingVentas(false);
    }
  };

  const cargarVentasML = async () => {
    setIsLoadingML(true);
    try {
      const res = await obtenerVentasMLPorRango(fechaDesde, fechaHasta);
      if (res.success) {
        setVentasML(res.data || []);
        setMlCargadas(true);
      }
    } catch (error) {
      console.error("Error al cargar ventas ML:", error);
    } finally {
      setIsLoadingML(false);
    }
  };

  const handleCargar = async () => {
    setVentasML([]);
    setMlCargadas(false);
    await Promise.all([cargarVentas(fechaDesde, fechaHasta), cargarVentasML()]);
  };

  const abrirAlertaML = (venta: any) => {
    setVentaParaAlerta(venta);
    setAlertaActiva(venta.mlAlerta ?? false);
    setAlertaObservacion(venta.mlObservacion ?? "");
    setIsAlertaMLOpen(true);
  };

  // --- VISUALIZAR FOTOS DE AUDITORÍA (preparación ML) ---
  const handleVerFotosVenta = async (venta: any) => {
    if (!venta.mlIdEnvio) {
      alert("Esta venta no tiene Id de Envío de Mercado Libre asociado, no se pueden buscar las fotos.");
      return;
    }
    setLoadingFotosVentaId(venta.id);
    try {
      const res = await obtenerFotosEnvio(venta.mlIdEnvio);
      if (res.success) {
        setFotosVenta({ venta, fotos: res.fotos });
        if (!res.fotos || res.fotos.length === 0) {
          // Se abre el modal igual para informar que no hay fotos cargadas.
        }
      } else {
        alert("No se pudieron obtener las fotos del servidor de imágenes.");
      }
    } catch (e) {
      console.error("Error al obtener fotos de la venta:", e);
      alert("Fallo la conexión con el servidor de imágenes.");
    } finally {
      setLoadingFotosVentaId(null);
    }
  };

  // --- VISUALIZAR FOTOS DE PREPARACIÓN DE PEDIDOS DE VENTA (auditoría por ventaId) ---
  const handleVerFotosPedido = async (venta: any) => {
    setLoadingFotosVentaId(venta.id);
    try {
      const res = await obtenerFotosPedido(venta.id);
      if (res.success) {
        setFotosVenta({ venta, fotos: res.fotos });
      } else {
        alert("No se pudieron obtener las fotos del servidor de imágenes.");
      }
    } catch (e) {
      console.error("Error al obtener fotos del pedido:", e);
      alert("Fallo la conexión con el servidor de imágenes.");
    } finally {
      setLoadingFotosVentaId(null);
    }
  };

  const guardarAlertaML = async () => {
    if (!ventaParaAlerta) return;
    setIsGuardandoAlerta(true);
    try {
      const res = await actualizarAlertaML(ventaParaAlerta.id, alertaActiva, alertaObservacion);
      if (res.success) {
        const actualizar = (lista: any[]) => lista.map(v =>
          v.id === ventaParaAlerta.id ? { ...v, mlAlerta: alertaActiva, mlObservacion: alertaObservacion || null } : v
        );
        setVentasRealizadas(prev => actualizar(prev));
        setVentasML(prev => actualizar(prev));
        setIsAlertaMLOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGuardandoAlerta(false);
    }
  };

  const renderParaDisplay = (para: string) => {
    if (!para) return "-";
    if (para.trim().startsWith('[') || para.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(para);
        if (Array.isArray(parsed)) {
          return `${parsed[0]?.razonSocial || parsed[0]?.nombre || "?"} (+${parsed.length - 1})`;
        }
        return parsed.razonSocial || parsed.nombre || para;
      } catch (e) {
        return para;
      }
    }
    return para;
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
      agregarProductoAVenta(nuevo);
      setIsCreateArticuloModalOpen(false);
      setNewArtData({ id: "", nombre: "", precio: 0, stock: 0, costo: 0, margenGanancia: 0 });
      mostrarMensajeExito("Artículo creado y añadido a la venta");
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


  const todasLasVentas = useMemo(() => [...ventasRealizadas, ...ventasML], [ventasRealizadas, ventasML]);

  const ventasFiltradas = todasLasVentas.filter(v => {
    // Filtro Offline
    const cumpleOffline = mostrarSoloOffline ? v.eventoOffline === true : true;

    // Filtro Punto de Venta
    const cumplePuntoVenta = filtroPuntoVenta.length > 0 ? filtroPuntoVenta.includes(v.puntoVentaId) : true;

    // Filtro de Búsqueda (Venta, Cliente, MLA Venta, MLA Envío)
    const cumpleBusqueda = filtroBusquedaTexto ? (() => {
      const term = filtroBusquedaTexto.toLowerCase();
      if (tipoBusqueda === "venta") {
        return v.numeroVenta?.toString().includes(filtroBusquedaTexto) ||
          v.id.toLowerCase().includes(term) ||
          v.dni?.toLowerCase().includes(term);
      }
      if (tipoBusqueda === "cliente") {
        return v.cliente?.toLowerCase().includes(term) ||
          v.dni?.toLowerCase().includes(term);
      }
      if (tipoBusqueda === "mla_venta") {
        return v.mlIdVenta?.toLowerCase().includes(term) ||
          v.mlPackId?.toLowerCase().includes(term);
      }
      if (tipoBusqueda === "mla_envio") {
        return v.mlIdEnvio?.toLowerCase().includes(term);
      }
      return true;
    })() : true;

    // Filtro Metodo de Pago
    const cumpleMetodoPago = filtroMetodoPago
      ? (filtroMetodoPago === "MercadoLibre"
        ? (v.metodo_pago === "MercadoLibre" || v.metodo_pago === "mercadopago (ML)")
        : v.metodo_pago === filtroMetodoPago)
      : true;

    return cumpleOffline && cumplePuntoVenta && cumpleBusqueda && cumpleMetodoPago;
  });

  const ventasActivasFiltradas = ventasFiltradas.filter(v => v.estadoPedido !== "CANCELADO");

  const esBusquedaML = tipoBusqueda === "mla_venta" || tipoBusqueda === "mla_envio";
  const mostrandoGlobal = ventasFiltradas.length === 0 && ventasGlobales !== null && ventasGlobales.length > 0;
  const ventasParaTabla = mostrandoGlobal ? ventasGlobales! : ventasFiltradas;

  // Clave estable con todos los mlIdEnvio presentes (para evitar re-consultas en cada render)
  const enviosIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const lista of [ventasRealizadas, ventasML, ventasGlobales || []]) {
      for (const v of lista) if (v?.mlIdEnvio) ids.add(v.mlIdEnvio);
    }
    return Array.from(ids).sort().join(",");
  }, [ventasRealizadas, ventasML, ventasGlobales]);

  // Consulta en lote qué envíos tienen foto cargada para habilitar el botón "Ver foto"
  useEffect(() => {
    const ids = enviosIdsKey ? enviosIdsKey.split(",") : [];
    if (ids.length === 0) { setEnviosConFoto(new Set()); return; }
    let cancelled = false;
    obtenerEnviosConFoto(ids)
      .then((res) => { if (!cancelled && res.success) setEnviosConFoto(new Set(res.envioIds)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enviosIdsKey]);

  // Clave estable con todos los ventaId presentes (para detectar fotos de preparación de pedidos)
  const ventasIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const lista of [ventasRealizadas, ventasML, ventasGlobales || []]) {
      for (const v of lista) if (v?.id) ids.add(v.id);
    }
    return Array.from(ids).sort().join(",");
  }, [ventasRealizadas, ventasML, ventasGlobales]);

  // Consulta en lote el estado de auditoría de preparación de pedidos por ventaId
  useEffect(() => {
    const ids = ventasIdsKey ? ventasIdsKey.split(",") : [];
    if (ids.length === 0) { setPedidosConFoto({}); return; }
    let cancelled = false;
    obtenerPedidosConFoto(ids)
      .then((res) => { if (!cancelled && res.success) setPedidosConFoto(res.estados); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ventasIdsKey]);

  // --- FUNCION AUXILIAR PARA EVALUAR MÉTODOS DE PAGO ---
  const esMercadoLibre = (m: string) => m === "MercadoLibre" || m === "mercadopago (ML)";
  const esMercadoPago = (m: string) => m === "MercadoPago";
  const esTarjeta = (m: string) => m === "Tarjeta de Crédito" || m === "Tarjeta de Débito";

  const formatCurrency = (amount: any) => {
    const value = typeof amount === "number" ? amount : parseFloat(amount);
    if (isNaN(value)) return "$ 0,00";

    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(value);
  };

  // --- CALCULOS NUEVA VENTA (LÓGICA MIXTA) ---
  const totalBase = items.filter((item: ItemVenta) => !item.esNota).reduce((acc: number, item: ItemVenta) => acc + item.subtotal, 0);

  const base1 = isPagoMixto ? montoPago1 : totalBase;
  const base2 = isPagoMixto ? Math.max(0, totalBase - montoPago1) : 0;

  const isCredito1 = metodoPago === "Tarjeta de Crédito";
  const isCredito2 = isPagoMixto && metodoPago2 === "Tarjeta de Crédito";

  const final1 = isCredito1 ? base1 * (1 + (interesTarjeta / 100)) : base1;
  const final2 = isCredito2 ? base2 * (1 + (interesTarjeta / 100)) : base2;

  const totalFinalCalculado = isPagoMixto ? (final1 + final2) : final1;

  // SOLAMENTE SE REQUIEREN DATOS EXTRA SEGÚN EL MÉTODO EXACTO
  const requiereTarjeta = isPagoMixto ? (esTarjeta(metodoPago) || esTarjeta(metodoPago2)) : esTarjeta(metodoPago);
  const requiereMercadoLibre = isPagoMixto ? (esMercadoLibre(metodoPago) || esMercadoLibre(metodoPago2)) : esMercadoLibre(metodoPago);
  const requiereMercadoPago = isPagoMixto ? (esMercadoPago(metodoPago) || esMercadoPago(metodoPago2)) : esMercadoPago(metodoPago);
  const requiereCruzada = (isPagoMixto && (metodoPago === "Cruzada" || metodoPago2 === "Cruzada")) || (!isPagoMixto && metodoPago === "Cruzada");
  const requiereCuentaCorriente = (isPagoMixto && (metodoPago === "A Cuenta Corriente" || metodoPago2 === "A Cuenta Corriente")) || (!isPagoMixto && metodoPago === "A Cuenta Corriente");
  const esMixtoCruzadaCC = isPagoMixto && requiereCruzada && requiereCuentaCorriente;

  // Tarjeta de crédito (pago único): habilita el sub-desplegable de procesador y,
  // si el procesador es Go Cuotas o Posnet Mercadopago, ofrece fiscalizar en ARCA.
  const esTarjetaCreditoUnica = !isPagoMixto && metodoPago === "Tarjeta de Crédito";
  const requiereFiscalizacionOpcional = esTarjetaCreditoUnica &&
    (procesadorTarjeta === "Go Cuotas" || procesadorTarjeta === "Posnet Mercadopago");

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
    if (prod.esPack && prod.packItems && prod.packItems.length > 0) {
      if (expandirPacks) {
        // Modo expandido: agregar cada componente como línea separada
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
        // Modo pack: agregar como ítem único con el ID y precio del pack
        const existe = items.find(item => item.productoId === prod.id);
        if (existe) {
          setItems(items.map(item =>
            item.productoId === prod.id
              ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.precio_unit }
              : item
          ));
        } else {
          setItems(prev => [...prev, {
            id: crypto.randomUUID(),
            productoId: prod.id,
            nombre: prod.nombre,
            cantidad: 1,
            precio_unit: Number(prod.precio),
            subtotal: Number(prod.precio),
            stock: prod.stock,
            esPack: true,
            ultimaModificacion: prod.ultimaModificacion
          }]);
        }
      }
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
  const handleBuscarPadron = async () => {
    const cleanCuit = cuitBusqueda.replace(/\D/g, '');
    console.log("🔍 [Padron] Iniciando búsqueda para:", cleanCuit);

    if (!cleanCuit || cleanCuit.length < 7) {
      alert("Ingresa un CUIT (11 dígitos) o DNI (7-8 dígitos) válido");
      return;
    }

    setIsSearchingPadron(true);
    try {
      const res = await consultarPadron(cleanCuit);
      console.log("📥 [Padron] Respuesta recibida:", res);

      if (res.success) {
        setCliente(res.nombre || "Sin Nombre");
        setParaCruzada(res.nombre || "Sin Nombre");
        if (res.cuit) {
          setDocNro(res.cuit);
          setDocTipo(res.cuit.length === 11 ? 80 : 96);
        }
        if (res.condicionIva) setCondicionIva(res.condicionIva);
        if (res.tipoFactura) setTipoFacturaSugerida(res.tipoFactura);

        mostrarMensajeExito("Datos obtenidos del padrón");
      } else {
        console.warn("⚠️ [Padron] No se obtuvieron resultados:", res.error);
        alert(res.error || "No se encontraron datos en el padrón");
      }
    } catch (e) {
      console.error("❌ [Padron] Error fatal:", e);
      alert("Error al consultar el padrón AFIP");
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleSearchSujetos = async (q: string) => {
    if (!q.trim()) {
      setSujetosEncontrados([]);
      setShowSujetoList(false);
      return;
    }
    const filtered = proveedores.filter(p =>
      p.razonSocial.toLowerCase().includes(q.toLowerCase()) ||
      p.cuit?.includes(q)
    ).slice(0, 10);
    setSujetosEncontrados(filtered);
    setShowSujetoList(true);
  };

  const handleSelectSujeto = (s: any) => {
    setCliente(s.razonSocial);
    setParaCruzada(s.razonSocial);
    setDocNro(s.cuit || "");
    setCuitBusqueda(s.cuit || "");
    setDocTipo(s.docTipo || (s.cuit?.length > 8 ? 80 : 96));
    setCondicionIva(s.condicionIva || 5);
    setSujetoId(s.id);
    setEmail(s.email || "");
    setTelefono(s.telefono || "");
    if (s.observaciones) setInfo(s.observaciones);
    setShowSujetoList(false);
  };

  const handleBuscarPadronProv = async () => {
    if (!newProvData.cuit) {
      alert("Ingresa un CUIT/DNI para buscar");
      return;
    }
    setIsSearchingPadron(true);
    try {
      const res = await consultarPadron(newProvData.cuit);
      if (res.success) {
        setNewProvData({
          ...newProvData,
          razonSocial: res.nombre,
          cuit: res.cuit || newProvData.cuit
        });
        mostrarMensajeExito("Datos obtenidos del padrón");
      } else {
        alert(res.error || "No se encontró el CUIT");
      }
    } catch (e) {
      console.error("Error al consultar padrón:", e);
      alert("Error al consultar padrón");
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleBuscarPadronEdit = async () => {
    const cleanCuit = editCuitBusqueda.replace(/\D/g, '');
    if (!cleanCuit || cleanCuit.length < 7) {
      alert("Ingresa un CUIT (11 dígitos) o DNI (7-8 dígitos) válido");
      return;
    }

    setIsSearchingPadronEdit(true);
    try {
      const res = await consultarPadron(cleanCuit);
      if (res.success) {
        setEditCliente(res.nombre || "Sin Nombre");
        if (res.cuit) {
          setEditDocNro(res.cuit);
          setEditDocTipo(res.cuit.length === 11 ? 80 : 96);
          setEditDni(res.cuit);
        }
        if (res.condicionIva) setEditCondicionIva(res.condicionIva);
        if (res.tipoFactura) setEditTipoFacturaSugerida(res.tipoFactura);

        mostrarMensajeExito("Datos obtenidos del padrón");
      } else {
        alert(res.error || "No se encontraron datos en el padrón");
      }
    } catch (e) {
      alert("Error al consultar el padrón AFIP");
    } finally {
      setIsSearchingPadronEdit(false);
    }
  };

  const agregarProveedorCruzada = () => {
    if (proveedoresCruzada.length < 4) {
      setProveedoresCruzada([...proveedoresCruzada, { id: "", razonSocial: "", monto: 0 }]);
    }
  };

  const eliminarProveedorCruzada = (index: number) => {
    const newList = proveedoresCruzada.filter((_, i) => i !== index);
    setProveedoresCruzada(newList);
  };

  const actualizarProveedorCruzada = (index: number, field: string, value: any) => {
    const newList = [...proveedoresCruzada];
    newList[index] = { ...newList[index], [field]: value };
    setProveedoresCruzada(newList);
  };

  const actualizarProveedorCruzadaMultiple = (index: number, campos: Record<string, any>) => {
    const newList = [...proveedoresCruzada];
    newList[index] = { ...newList[index], ...campos };
    setProveedoresCruzada(newList);
  };

  useEffect(() => {
    if (isFinalizarModalOpen && metodoPago === "Cruzada" && proveedoresCruzada.length === 0) {
      setProveedoresCruzada([{ id: "", razonSocial: "", monto: totalFinalCalculado }]);
    }
  }, [isFinalizarModalOpen, metodoPago, totalFinalCalculado]);

  useEffect(() => {
    if (esMixtoCruzadaCC && !paraCuentaCorriente && cliente && cliente !== "Consumidor Final") {
      setParaCuentaCorriente(cliente);
    }
  }, [esMixtoCruzadaCC, cliente]);

  const handleFinalizarVenta = async (overrideComoPedido?: boolean | React.MouseEvent, fiscalizar: boolean = false) => {
    const isPedido = typeof overrideComoPedido === 'boolean' ? overrideComoPedido : isGuardarComoPedido;

    // Para "Registrar y fiscalizar" necesitamos un CUIT/DNI (del buscador de Padrón A13)
    if (fiscalizar) {
      const docOk = (docNro && docNro !== "0") || cuitBusqueda.length > 6;
      if (!docOk) {
        alert("Para 'Registrar y fiscalizar' necesitás cargar el CUIT/DNI en el buscador de Padrón A13.");
        return;
      }
    }

    if (requiereTarjeta && (!dni.trim() || !telefono.trim() || !cupon.trim() || !transaccionId.trim())) {
      alert("DNI, Teléfono, N° Cupón y Transacción son OBLIGATORIOS para pagos con Tarjeta."); return;
    }
    if (requiereMercadoLibre && (!mlIdVenta.trim() || !mlIdEnvio.trim() || !mlMla.trim())) {
      alert("Id Venta, Id Envío y MLA son OBLIGATORIOS para MercadoLibre."); return;
    }
    if (requiereMercadoPago && !mlIdVenta.trim()) {
      alert("El Id de pago es OBLIGATORIO para MercadoPago."); return;
    }
    if (requiereCruzada && !isPagoMixto && (!deCruzada.trim() || proveedoresCruzada.length === 0)) { alert("'De' y al menos un proveedor son obligatorios para pagos Cruzados."); return; }
    if (esMixtoCruzadaCC) {
      if (!deCruzada.trim() || !paraCruzada.trim()) { alert("Para el pago Cruzada: 'De' (quien envía) y 'Para' (proveedor) son obligatorios."); return; }
      if (!paraCuentaCorriente.trim()) { alert("Debe seleccionar el proveedor para la Cuenta Corriente."); return; }
    } else {
      if (requiereCruzada && isPagoMixto && (!deCruzada.trim() || !paraCruzada.trim())) { alert("'De' y 'Para' obligatorios para Cruzada en pago Mixto."); return; }
      if (requiereCuentaCorriente && !paraCruzada.trim()) { alert("Debe seleccionar un proveedor para la Cuenta Corriente."); return; }
    }

    // VALIDACIÓN DE PROVEEDOR EXISTENTE
    const checkProveedorExiste = (nombre: string) => {
      return proveedores.some(p => p.razonSocial.toLowerCase().trim() === nombre.toLowerCase().trim());
    };

    if (requiereCruzada && !isPagoMixto) {
      const nuevosProveedores = [...proveedoresCruzada];
      for (let i = 0; i < nuevosProveedores.length; i++) {
        const provEncontrado = proveedores.find(p => p.razonSocial.toLowerCase().trim() === nuevosProveedores[i].razonSocial.toLowerCase().trim());
        if (!provEncontrado) {
          alert(`El proveedor "${nuevosProveedores[i].razonSocial}" no existe en la base de datos. Por favor, selecciónalo de la lista o créalo primero.`);
          return;
        }
        // Actualizamos con el nombre exacto de la base de datos
        nuevosProveedores[i].razonSocial = provEncontrado.razonSocial;
        nuevosProveedores[i].id = provEncontrado.id;
      }
      setProveedoresCruzada(nuevosProveedores);
    }

    let paraCruzadaExacto: string | undefined;
    let paraCCExacto: string | undefined;

    if ((requiereCruzada && isPagoMixto) || (requiereCuentaCorriente && !esMixtoCruzadaCC)) {
      const provEncontrado = proveedores.find(p => p.razonSocial.toLowerCase().trim() === paraCruzada.toLowerCase().trim());
      if (!provEncontrado) {
        const esNuevoDelPadron = !!docNro && docNro !== "0" &&
          paraCruzada.toLowerCase().trim() === cliente.toLowerCase().trim();
        if (!esNuevoDelPadron) {
          alert(`El proveedor "${paraCruzada}" no existe en la base de datos. Por favor, selecciónalo de la lista o créalo primero.`);
          return;
        }
        paraCruzadaExacto = paraCruzada;
      } else {
        setParaCruzada(provEncontrado.razonSocial);
        paraCruzadaExacto = provEncontrado.razonSocial;
      }
    }

    if (esMixtoCruzadaCC) {
      const provCC = proveedores.find(p => p.razonSocial.toLowerCase().trim() === paraCuentaCorriente.toLowerCase().trim());
      if (!provCC) {
        const esNuevoDelPadron = !!docNro && docNro !== "0" &&
          paraCuentaCorriente.toLowerCase().trim() === cliente.toLowerCase().trim();
        if (!esNuevoDelPadron) {
          alert(`El proveedor de Cuenta Corriente "${paraCuentaCorriente}" no existe. Selecciónalo de la lista o créalo primero.`);
          return;
        }
        paraCCExacto = paraCuentaCorriente;
      } else {
        setParaCuentaCorriente(provCC.razonSocial);
        paraCCExacto = provCC.razonSocial;
      }
    }

    const clienteFinal = cliente;

    let metodoPagoFinal = isPagoMixto ? "Mixto" : metodoPago;
    let infoFinal = info || (isPedido ? "Pedido de venta - pendiente de confirmación" : "Venta confirmada");

    if (isPagoMixto) {
      const det = `[Mixto -> ${metodoPago}: $${final1.toLocaleString('es-AR')} | ${metodoPago2}: $${final2.toLocaleString('es-AR')}]`;
      infoFinal = info ? `${det} - ${info}` : det;
    } else if (esTarjetaCreditoUnica) {
      const det = `[Tarjeta: ${procesadorTarjeta}]`;
      infoFinal = info ? `${det} - ${info}` : det;
    }

    try {
      setIsSubmitting(true);

      // Los items se guardan tal como están:
      // - Modo expandido: cada componente ya tiene productoId del componente
      // - Modo pack (esPack=true): el servidor desglosa el stock por componentes en ajustarStockItemsTx
      const itemsParaGuardar = items;

      const dniFinal = (requiereMercadoLibre || requiereMercadoPago) ? (mlDni || dni || cuitBusqueda) : (dni || cuitBusqueda);
      const docNroFinal = (docNro && docNro !== "0") ? docNro : (cuitBusqueda.length > 6 ? cuitBusqueda : "");

      let paraFinal = paraCruzadaExacto || paraCruzada;
      if (metodoPago === "Cruzada" && !isPagoMixto) {
        paraFinal = JSON.stringify(proveedoresCruzada);
      } else if (esMixtoCruzadaCC) {
        const montoCruzada = metodoPago === "Cruzada" ? final1 : final2;
        const montoCC = metodoPago === "A Cuenta Corriente" ? final1 : final2;
        paraFinal = JSON.stringify([
          { razonSocial: paraCruzadaExacto || paraCruzada, monto: montoCruzada },
          { razonSocial: paraCCExacto || paraCuentaCorriente, monto: montoCC },
        ]);
      }

      const resultado = isPedido
        ? await guardarComoPedidoVenta({
          cliente: clienteFinal, vendedor: vendedorNombre, total: totalBase,
          interes: interesTarjeta,
          totalFinal: totalFinalCalculado,
          items: itemsParaGuardar, metodo_pago: metodoPagoFinal, dni: dniFinal, telefono, info: infoFinal, cupon, transaccionId, de: deCruzada, para: paraFinal,
          email, eventoOffline, puntoVentaId,
          docTipo, docNro: docNroFinal, condicionIva, tipoComprobante: tipoFacturaSugerida,
          mlIdVenta, mlIdEnvio, mlMla, mlDni
        })
        : await crearVentaMostrador({
          cliente: clienteFinal, vendedor: vendedorNombre, total: totalBase,
          interes: interesTarjeta,
          totalFinal: totalFinalCalculado,
          items: itemsParaGuardar, metodo_pago: metodoPagoFinal, dni: dniFinal, telefono, info: infoFinal, cupon, transaccionId, de: deCruzada, para: paraFinal,
          email, eventoOffline, puntoVentaId,
          solicitarFactura: solicitarFactura,
          // ARCA fields para guardar el snapshot
          docTipo, docNro: docNroFinal, condicionIva, tipoComprobante: tipoFacturaSugerida,
          mlIdVenta, mlIdEnvio, mlMla, mlDni
        });

      if (resultado.success) {
        if (isPedido) {
          mostrarMensajeExito("¡Pedido de venta guardado con éxito!");
        } else {
          setArticulos(prev => prev.map(art => {
            const itemVendido = itemsParaGuardar.find(i => i.productoId === art.id);
            if (itemVendido) {
              return { ...art, stock: art.stock - itemVendido.cantidad };
            }
            return art;
          }));

          if (fiscalizar && (resultado as any).id) {
            const resFiscal = await generarFacturaARCA((resultado as any).id);
            if (resFiscal.success) {
              mostrarMensajeExito(`¡Venta registrada y fiscalizada! CAE: ${resFiscal.cae}`);
            } else {
              mostrarMensajeExito("¡Venta registrada! (sin fiscalizar)");
              alert(`La venta se registró pero NO se pudo fiscalizar en ARCA:\n${resFiscal.error || ""}${resFiscal.details ? "\n" + resFiscal.details : ""}\n\nPodés fiscalizarla luego desde el listado de ventas.`);
            }
          } else {
            mostrarMensajeExito("¡Venta registrada con éxito!");
          }
        }

        resetForm();
        cargarVentas(fechaDesde, fechaHasta);
      } else { alert("Error al guardar: " + resultado.error); }
    } catch (error) { alert("Ocurrió un error inesperado."); } finally { setIsSubmitting(false); }
  };

  const handleGenerarFactura = async (ventaId: string) => {
    if (!confirm("¿Estás seguro de que deseas generar la factura electrónica en ARCA?")) return;
    setIsFacturando(true);
    try {
      const res = await generarFacturaARCA(ventaId);
      if (res.success) {
        mostrarMensajeExito(`Factura generada con éxito! CAE: ${res.cae}`);
        cargarVentas(fechaDesde, fechaHasta);
      } else {
        alert(`Error al facturar: ${res.error}\n${res.details || ""}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error al procesar la factura");
    } finally {
      setIsFacturando(false);
    }
  };

  const handleImprimirFactura = async (venta: any) => {
    setVentaParaFactura(venta);
    setIsGeneratingPDF(true);

    // Aumentamos el tiempo para permitir la carga de la imagen del QR y renderizado
    setTimeout(async () => {
      if (facturaRef.current) {
        try {
          const dataUrl = await toPng(facturaRef.current, {
            quality: 1,
            pixelRatio: 2,
            backgroundColor: "#ffffff",
            skipFonts: true,
          });

          const pdf = new jsPDF("p", "mm", "a4");
          const imgProps = pdf.getImageProperties(dataUrl);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

          pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
          const pdfUrl = pdf.output("bloburl");
          window.open(pdfUrl, "_blank");
        } catch (err: any) {
          console.error("Error al generar PDF:", err);
          alert(`No se pudo generar el PDF: ${err.message || "Error de red o CORS"}`);
        }
      }
      setVentaParaFactura(null);
      setIsGeneratingPDF(false);
    }, 1500);
  };

  const handleVerResumenPDF = async (venta: any) => {
    setVentaParaPedido(venta);
    setIsGeneratingPDF(true);

    // Aumentamos el tiempo para permitir el renderizado
    setTimeout(async () => {
      if (pedidoRef.current) {
        try {
          const dataUrl = await toPng(pedidoRef.current, {
            quality: 1,
            pixelRatio: 2,
            backgroundColor: "#ffffff",
            skipFonts: true,
          });

          const pdf = new jsPDF("p", "mm", "a4");
          const imgProps = pdf.getImageProperties(dataUrl);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

          pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);

          const blob = pdf.output("blob");
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
        } catch (error) {
          console.error("Error al generar PDF:", error);
          alert("No se pudo generar el resumen en PDF.");
        } finally {
          setVentaParaPedido(null);
          setIsGeneratingPDF(false);
        }
      }
    }, 1500);
  };

  const resetForm = () => {
    setItems([]); setCliente("Consumidor Final"); setMetodoPago("Efectivo"); setDni(""); setTelefono("");
    setInfo(""); setCupon(""); setTransaccionId(""); setDeCruzada(""); setParaCruzada(""); setParaCuentaCorriente(""); setInteresTarjeta(0);
    setCuitBusqueda(""); setEmail(""); setEventoOffline(false); setIsPagoMixto(false); setMontoPago1(0); setMetodoPago2("Tarjeta de Crédito"); setProcesadorTarjeta("Posnet Intercap");
    setMlIdVenta(""); setMlIdEnvio(""); setMlMla(""); setMlDni("");
    setDocTipo(99); setDocNro(""); setCondicionIva(5); setTipoFacturaSugerida(6);
    setSujetoId(null); setSujetosEncontrados([]); setShowSujetoList(false); setSolicitarFactura(false);
    setProveedoresCruzada([]); setIsGuardarComoPedido(false);
    setIsFinalizarModalOpen(false); setIsConfirmDiscardOpen(false);
    // Restaurar "Mostrador" como punto de venta por defecto
    if (puntosVenta && puntosVenta.length > 0) {
      const mostrador = puntosVenta.find((p: any) => p.nombre === "Mostrador");
      if (mostrador) {
        setPuntoVentaId(mostrador.id);
      }
    }
  };


  // --- CALCULOS EDICIÓN VENTA (LÓGICA MIXTA) ---
  const totalBaseEdit = editItems.filter((item: ItemVenta) => !item.esNota).reduce((acc: number, item: ItemVenta) => acc + item.subtotal, 0);

  const editBase1 = isEditPagoMixto ? editMontoPago1 : totalBaseEdit;
  const editBase2 = isEditPagoMixto ? Math.max(0, totalBaseEdit - editMontoPago1) : 0;

  const isEditCredito1 = editMetodoPago === "Tarjeta de Crédito";
  const isEditCredito2 = isEditPagoMixto && editMetodoPago2 === "Tarjeta de Crédito";

  const editFinal1 = isEditCredito1 ? editBase1 * (1 + (editInteresTarjeta / 100)) : editBase1;
  const editFinal2 = isEditCredito2 ? editBase2 * (1 + (editInteresTarjeta / 100)) : editBase2;

  const editTotalFinalCalculado = isEditPagoMixto ? (editFinal1 + editFinal2) : editFinal1;

  // SOLAMENTE SE REQUIEREN DATOS EXTRA SEGÚN EL MÉTODO EXACTO EN EDICIÓN
  const requiereTarjetaEdit = isEditPagoMixto ? (esTarjeta(editMetodoPago) || esTarjeta(editMetodoPago2)) : esTarjeta(editMetodoPago);
  const requiereMercadoLibreEdit = isEditPagoMixto ? (esMercadoLibre(editMetodoPago) || esMercadoLibre(editMetodoPago2)) : esMercadoLibre(editMetodoPago);
  const requiereMercadoPagoEdit = isEditPagoMixto ? (esMercadoPago(editMetodoPago) || esMercadoPago(editMetodoPago2)) : esMercadoPago(editMetodoPago);
  const requiereCruzadaEdit = (isEditPagoMixto && (editMetodoPago === "Cruzada" || editMetodoPago2 === "Cruzada")) || (!isEditPagoMixto && editMetodoPago === "Cruzada");
  const requiereCuentaCorrienteEdit = (isEditPagoMixto && (editMetodoPago === "A Cuenta Corriente" || editMetodoPago2 === "A Cuenta Corriente")) || (!isEditPagoMixto && editMetodoPago === "A Cuenta Corriente");
  const esMixtoCruzadaCCEdit = isEditPagoMixto && requiereCruzadaEdit && requiereCuentaCorrienteEdit;

  useEffect(() => {
    if (esMixtoCruzadaCCEdit && !editParaCuentaCorriente && editCliente && editCliente !== "Consumidor Final") {
      setEditParaCuentaCorriente(editCliente);
    }
  }, [esMixtoCruzadaCCEdit, editCliente]);

  const abrirModalEdicion = async (venta: { id: string; cliente: string; email?: string; metodo_pago: string; totalFinal: number; items: Array<{ productoId: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }>; createdAt: string; total: number; interes: number; dni?: string; telefono?: string; cupon?: string; transaccionId?: string; de?: string; para?: string; eventoOffline?: boolean; info?: string; puntoVentaId?: string; mlIdVenta?: string; mlIdEnvio?: string; mlMla?: string; mlDni?: string; docTipo?: number; docNro?: string; condicionIva?: number; tipoComprobante?: number }) => {
    // Sincronizar artículos con la base de datos para asegurar precios correctos
    const syncResult = await sincronizarArticulosMostrador();
    if (syncResult.success && syncResult.data) {
      setArticulos(syncResult.data);
    }

    setVentaOriginalParaComparar(venta);
    setEditVentaId(venta.id);
    setEditCliente(venta.cliente || "");
    setEditMetodoPago(venta.metodo_pago === "Mixto" ? "Efectivo" : (venta.metodo_pago === "mercadopago (ML)" ? "MercadoLibre" : (venta.metodo_pago || "Efectivo")));
    setIsEditPagoMixto(venta.metodo_pago === "Mixto");

    // Lógica para cargar montos y métodos reales si es Pago Mixto
    if (venta.metodo_pago === "Mixto") {
      const info = venta.info || "";
      try {
        if (info.trim().startsWith('{')) {
          const infoObj = JSON.parse(info);
          setEditMetodoPago(infoObj.metodo1 || "Efectivo");
          setEditMontoPago1(Number(infoObj.monto1) || (Number(venta.total) / 2));
          setEditMetodoPago2(infoObj.metodo2 || "Tarjeta de Crédito");
        } else {
          // Formato [Mixto -> Metodo1: $10.000 | Metodo2: $90.000]
          const extractMonto = (label: string) => {
            const regex = new RegExp(`${label}:\\s*\\$?([0-9.,]+)`, "i");
            const match = info.match(regex);
            if (match && match[1]) {
              // Usamos la lógica segura que ya implementamos en el backend
              let valStr = match[1];
              if (valStr.includes(',') && valStr.includes('.')) {
                valStr = valStr.replace(/\./g, '').replace(',', '.');
              } else if (valStr.includes('.')) {
                const parts = valStr.split('.');
                if (parts[parts.length - 1].length === 3) valStr = valStr.replace(/\./g, '');
              } else if (valStr.includes(',')) {
                valStr = valStr.replace(',', '.');
              }
              return parseFloat(valStr) || 0;
            }
            return 0;
          };

          const metodosPosibles = ["Efectivo", "Tarjeta de Crédito", "Tarjeta de Débito", "MercadoLibre", "MercadoPago", "Cruzada", "A Cuenta Corriente", "A Confirmar"];
          let m1 = "Efectivo";
          let m2 = "Tarjeta de Crédito";

          const foundMethods = [];
          for (const m of metodosPosibles) {
            // Buscamos el método seguido de : para evitar falsos positivos
            if (info.includes(`${m}:`)) {
              foundMethods.push(m);
            }
          }

          if (foundMethods.length >= 1) m1 = foundMethods[0];
          if (foundMethods.length >= 2) m2 = foundMethods[1];

          const v1 = extractMonto(m1);
          setEditMetodoPago(m1);
          setEditMontoPago1(v1 || (Number(venta.total) / 2));
          setEditMetodoPago2(m2);
        }
      } catch (e) {
        console.error("Error al parsear info mixta en edición:", e);
        setEditMetodoPago("Efectivo");
        setEditMontoPago1(Number(venta.total) / 2);
        setEditMetodoPago2("Tarjeta de Crédito");
      }
    } else {
      setEditMetodoPago(venta.metodo_pago === "mercadopago (ML)" ? "MercadoLibre" : (venta.metodo_pago || "Efectivo"));
      setEditMontoPago1(Number(venta.total) / 2);
      setEditMetodoPago2("Tarjeta de Crédito");
    }

    setEditInteresTarjeta(Number(venta.interes) || 0);
    setEditDni(venta.dni || "");
    setEditTelefono(venta.telefono || "");
    setEditCupon(venta.cupon || "");
    setEditTransaccionId(venta.transaccionId || "");
    setEditDeCruzada(venta.de || "");
    // Si el campo para es un JSON array (mixto Cruzada+CC), separar en los dos campos
    const paraVal = venta.para || "";
    try {
      const paraParsed = paraVal.trim().startsWith('[') ? JSON.parse(paraVal) : null;
      if (Array.isArray(paraParsed) && paraParsed.length === 2) {
        setEditParaCruzada(paraParsed[0]?.razonSocial || "");
        setEditParaCuentaCorriente(paraParsed[1]?.razonSocial || "");
      } else {
        setEditParaCruzada(paraVal);
        setEditParaCuentaCorriente("");
      }
    } catch {
      setEditParaCruzada(paraVal);
      setEditParaCuentaCorriente("");
    }
    setEditEmail(venta.email || "");
    setEditEventoOffline(venta.eventoOffline || false);
    setEditPuntoVentaId(venta.puntoVentaId || "");
    setEditMlIdVenta(venta.mlIdVenta || "");
    setEditMlIdEnvio(venta.mlIdEnvio || "");
    setEditMlMla(venta.mlMla || "");
    setEditMlDni(venta.mlDni || "");

    // Limpiamos la marca de mixto vieja del info para no duplicarla si se guarda de nuevo
    const cleanInfo = (venta.info || "").replace(/\[Mixto -> .*?\](?: - )?/, "");
    setEditInfo(cleanInfo);

    setEditDocTipo(venta.docTipo || 99);
    setEditDocNro(venta.docNro || "");
    setEditCondicionIva(venta.condicionIva || 5);
    setEditCuitBusqueda(venta.docNro || venta.dni || "");
    setEditTipoFacturaSugerida(venta.tipoComprobante || 6);

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
    if (requiereMercadoLibreEdit && (!editMlIdVenta.trim() || !editMlIdEnvio.trim() || !editMlMla.trim())) {
      alert("Id Venta, Id Envío y MLA son OBLIGATORIOS para MercadoLibre."); return;
    }
    if (requiereMercadoPagoEdit && !editMlIdVenta.trim()) {
      alert("El Id de pago es OBLIGATORIO para MercadoPago."); return;
    }
    if (esMixtoCruzadaCCEdit) {
      if (!editDeCruzada.trim() || !editParaCruzada.trim()) { alert("Para el pago Cruzada: 'De' (quien envía) y 'Para' (proveedor) son obligatorios."); return; }
      if (!editParaCuentaCorriente.trim()) { alert("Debe seleccionar el proveedor para la Cuenta Corriente."); return; }
    } else {
      if (requiereCruzadaEdit && (!editDeCruzada.trim() || !editParaCruzada.trim())) { alert("'De' y 'Para' son obligatorios para transferencias Cruzadas."); return; }
      if (requiereCuentaCorrienteEdit && !editParaCruzada.trim()) { alert("Debe seleccionar un proveedor para la Cuenta Corriente."); return; }
    }

    // VALIDACIÓN DE PROVEEDOR EXISTENTE EN EDICIÓN
    let editParaCruzadaExacto: string | undefined;
    let editParaCCExacto: string | undefined;

    if ((requiereCruzadaEdit || requiereCuentaCorrienteEdit) && !esMixtoCruzadaCCEdit) {
      const provEncontrado = proveedores.find(p => p.razonSocial.toLowerCase().trim() === editParaCruzada.toLowerCase().trim());
      if (!provEncontrado) {
        alert(`El proveedor "${editParaCruzada}" no existe en la base de datos. Por favor, selecciónalo de la lista o créalo primero.`);
        return;
      }
      setEditParaCruzada(provEncontrado.razonSocial);
      editParaCruzadaExacto = provEncontrado.razonSocial;
    }

    if (esMixtoCruzadaCCEdit) {
      const provCruzada = proveedores.find(p => p.razonSocial.toLowerCase().trim() === editParaCruzada.toLowerCase().trim());
      if (!provCruzada) {
        alert(`El proveedor de Cruzada "${editParaCruzada}" no existe en la base de datos. Por favor, selecciónalo de la lista o créalo primero.`);
        return;
      }
      setEditParaCruzada(provCruzada.razonSocial);
      editParaCruzadaExacto = provCruzada.razonSocial;

      const provCC = proveedores.find(p => p.razonSocial.toLowerCase().trim() === editParaCuentaCorriente.toLowerCase().trim());
      if (!provCC) {
        alert(`El proveedor de Cuenta Corriente "${editParaCuentaCorriente}" no existe. Selecciónalo de la lista o créalo primero.`);
        return;
      }
      setEditParaCuentaCorriente(provCC.razonSocial);
      editParaCCExacto = provCC.razonSocial;
    }

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
          transaccionId: editTransaccionId, de: editDeCruzada,
          para: esMixtoCruzadaCCEdit
            ? JSON.stringify([
              { razonSocial: editParaCruzadaExacto || editParaCruzada, monto: editMetodoPago === "Cruzada" ? editFinal1 : editFinal2 },
              { razonSocial: editParaCCExacto || editParaCuentaCorriente, monto: editMetodoPago === "A Cuenta Corriente" ? editFinal1 : editFinal2 },
            ])
            : (editParaCruzadaExacto || editParaCruzada),
          email: editEmail,
          eventoOffline: editEventoOffline,
          puntoVentaId: editPuntoVentaId,
          items: editItems,
          mlIdVenta: editMlIdVenta,
          mlIdEnvio: editMlIdEnvio,
          mlMla: editMlMla,
          mlDni: editMlDni,
          docTipo: editDocTipo,
          docNro: editDocNro,
          condicionIva: editCondicionIva,
          tipoComprobante: editTipoFacturaSugerida
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
    if (venta.mlAlerta) {
      setIsAlertaAnulacionOpen(true);
    } else {
      setIsEliminarModalOpen(true);
    }
  };

  const handleEliminarVenta = async () => {
    if (!ventaAEliminar) return;
    setIsEliminando(true);
    try {
      if (ventaAEliminar.cae && !ventaAEliminar.info?.includes("ANULADA CON NC")) {
        // Venta con factura ARCA: generar Nota de Crédito y marcar como CANCELADA
        const res = await cancelarVenta(ventaAEliminar.id);
        if (res.success) {
          mostrarMensajeExito(res.message || "Venta cancelada con Nota de Crédito generada.");
          setIsEliminarModalOpen(false);
          setVentaAEliminar(null);
          cargarVentas(fechaDesde, fechaHasta);
        } else {
          alert("Error al generar Nota de Crédito: " + res.error + (res.details ? "\n" + JSON.stringify(res.details) : ""));
        }
      } else {
        const res = await eliminarVentaMostrador(ventaAEliminar.id, vendedorNombre);
        if (res.success) {
          mostrarMensajeExito("¡Venta eliminada exitosamente!");
          setIsEliminarModalOpen(false);
          setVentaAEliminar(null);
          cargarVentas(fechaDesde, fechaHasta);
        } else {
          alert("No se pudo eliminar la venta: " + res.error);
        }
      }
    } finally {
      setIsEliminando(false);
    }
  };

  const handleAnularConNC = async (ventaId: string) => {
    if (!confirm("¿Estás seguro de que deseas anular esta venta? Si tiene factura en ARCA, se generará una Nota de Crédito automáticamente.")) return;
    setIsFacturando(true);
    try {
      const res = await cancelarVenta(ventaId);
      if (res.success) {
        mostrarMensajeExito(res.message || "Venta anulada correctamente.");
        cargarVentas(fechaDesde, fechaHasta);
      } else {
        alert("Error al anular: " + res.error + (res.details ? "\n" + JSON.stringify(res.details) : ""));
      }
    } catch (e) {
      alert("Ocurrió un error al intentar anular la venta.");
      console.error(e);
    } finally {
      setIsFacturando(false);
    }
  };

  // ─── Refacturación B → A (comprador pide Factura A) ───────────────────────────
  const [ventaParaRefacturar, setVentaParaRefacturar] = useState<any | null>(null);
  const [refacturarCuit, setRefacturarCuit] = useState("");
  const [refacturarPadron, setRefacturarPadron] = useState<any | null>(null);
  const [refacturarBuscando, setRefacturarBuscando] = useState(false);
  const [refacturarProcesando, setRefacturarProcesando] = useState(false);

  const abrirModalRefacturar = (venta: any) => {
    setVentaParaRefacturar(venta);
    setRefacturarCuit("");
    setRefacturarPadron(null);
  };

  const cerrarModalRefacturar = () => {
    if (refacturarProcesando) return;
    setVentaParaRefacturar(null);
    setRefacturarCuit("");
    setRefacturarPadron(null);
  };

  const handleBuscarPadronRefacturar = async () => {
    const cleanCuit = refacturarCuit.replace(/\D/g, "");
    if (cleanCuit.length !== 11) {
      alert("Ingresá un CUIT válido de 11 dígitos.");
      return;
    }
    setRefacturarBuscando(true);
    setRefacturarPadron(null);
    try {
      const res = await consultarPadron(cleanCuit);
      if (res.success) {
        setRefacturarPadron(res);
      } else {
        alert("No se pudo validar el CUIT: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error al consultar el padrón de ARCA.");
    } finally {
      setRefacturarBuscando(false);
    }
  };

  const handleConfirmarRefacturar = async () => {
    if (!ventaParaRefacturar) return;
    const cleanCuit = refacturarCuit.replace(/\D/g, "");
    if (cleanCuit.length !== 11) {
      alert("Ingresá un CUIT válido de 11 dígitos.");
      return;
    }
    if (!refacturarPadron || refacturarPadron.tipoFactura !== 1) {
      alert("El CUIT debe ser Responsable Inscripto para emitir Factura A. Verificá con el botón de validación.");
      return;
    }
    setRefacturarProcesando(true);
    try {
      const res = await refacturarComoA(ventaParaRefacturar.id, cleanCuit);
      if (res.success) {
        mostrarMensajeExito(res.message || "Venta refacturada como Factura A.");
        setVentaParaRefacturar(null);
        setRefacturarCuit("");
        setRefacturarPadron(null);
        cargarVentas(fechaDesde, fechaHasta);
      } else {
        alert("Error al refacturar: " + res.error + (res.details ? "\n" + JSON.stringify(res.details) : ""));
      }
    } catch (e) {
      console.error(e);
      alert("Ocurrió un error al intentar refacturar la venta.");
    } finally {
      setRefacturarProcesando(false);
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
    if (!ventasActivasFiltradas || ventasActivasFiltradas.length === 0) return [];

    const itemCounts: Record<string, { nombre: string; total: number }> = {};

    ventasActivasFiltradas.forEach((venta) => {
      if (venta.items && venta.items.length > 0) {
        venta.items.forEach((item: any) => {
          const nombre = item.nombre || '';
          if (nombre) {
            if (!itemCounts[nombre]) {
              itemCounts[nombre] = { nombre, total: 0 };
            }
            itemCounts[nombre].total += 1;
          }
        });
      }
    });

    return Object.values(itemCounts)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventasActivasFiltradas]);

  // Ventas agrupadas por método de pago
  const ventasPorMetodo = useMemo(() => {
    if (!ventasActivasFiltradas || ventasActivasFiltradas.length === 0) return [];

    const totals: Record<string, number> = {};

    ventasActivasFiltradas.forEach((venta) => {
      const metodo = venta.metodo_pago || 'Desconocido';
      totals[metodo] = (totals[metodo] || 0) + Number(venta.totalFinal || venta.total);
    });

    return Object.entries(totals)
      .map(([metodo, total]) => ({ metodo, total }))
      .sort((a, b) => b.total - a.total);
  }, [ventasActivasFiltradas]);

  const inputSinFlechas = "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <>
      {/* 1. EL TICKET TÉRMICO */}
      <TicketImpresion
        ventaId={ventaParaImprimir ? ventaParaImprimir.id : ""}
        numeroVenta={ventaParaImprimir?.numeroVenta}
        items={ventaParaImprimir ? ventaParaImprimir.items.map((i: { productoId: string; nombre: string; cantidad: number; precio_unit: number; subtotal: number }) => ({ ...i, id: crypto.randomUUID() })) : items}
        total={ventaParaImprimir ? Number(ventaParaImprimir.totalFinal || ventaParaImprimir.total) : totalFinalCalculado}
        cliente={ventaParaImprimir ? (ventaParaImprimir.cliente || ventaParaImprimir.dni) : cliente}
        metodoPago={ventaParaImprimir ? ventaParaImprimir.metodo_pago : (isPagoMixto ? "MIXTO" : metodoPago)}
      />

      {/* 1b. LA FACTURA LEGAL A4 (CAPTURABLE) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '0', pointerEvents: 'none', width: '210mm' }}>
        <div ref={facturaRef}>
          <FacturaA4
            venta={ventaParaFactura}
            config={config}
          />
        </div>
      </div>

      {/* 1c. EL RESUMEN DE VENTA A4 (CAPTURABLE) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '0', pointerEvents: 'none', width: '210mm' }}>
        <div ref={pedidoRef}>
          {ventaParaPedido && (
            <PedidoVentaA4
              venta={ventaParaPedido}
            />
          )}
        </div>
      </div>

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
              <TabsTrigger value="pedidos" className="gap-2 px-6 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-900 border border-transparent data-[state=active]:border-indigo-200">
                <Clock className="h-4 w-4" /> Pedidos de Ventas
              </TabsTrigger>
              <TabsTrigger value="andreani" className="gap-2 px-6 bg-rose-50 text-rose-700 hover:bg-rose-100 data-[state=active]:bg-rose-100 data-[state=active]:text-rose-900 border border-transparent data-[state=active]:border-rose-200">
                <Package className="h-4 w-4" /> Envíos Andreani
              </TabsTrigger>
              <TabsTrigger value="gestion" className="gap-2 px-6 ml-auto bg-amber-50 text-amber-700 hover:bg-amber-100 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 border border-transparent data-[state=active]:border-amber-200">
                <Edit className="h-4 w-4" /> Gestión y Edición
              </TabsTrigger>
            </TabsList>
          </div>

          {/* --- PESTAÑA: REGISTRAR VENTA --- */}
          <TabsContent value="registrar" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">

              <section className="flex-grow flex flex-col min-h-0 gap-4">
                <div className="flex gap-4 items-center flex-wrap">
                  <Button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 rounded-xl w-fit shadow-md flex-shrink-0">
                    <Plus className="h-4 w-4" /> Añadir Artículo ( + )
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setShowNotaInput(v => !v); setNotaTexto(""); }}
                    className="border-amber-200 text-amber-700 hover:bg-amber-50 gap-2 px-5 rounded-xl w-fit shadow-sm flex-shrink-0"
                  >
                    <FileText className="h-4 w-4" /> Agregar Nota
                  </Button>
                  <Button onClick={() => {
                    const nuevoId = "ART-" + Math.random().toString(36).substring(2, 9).toUpperCase();
                    setNewArtData({ ...newArtData, id: nuevoId });
                    setIsCreateArticuloModalOpen(true);
                  }} variant="outline" className="ml-auto border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2 px-6 rounded-xl w-fit shadow-sm flex-shrink-0">
                    <Plus className="h-4 w-4" /> Crear nuevo artículo
                  </Button>
                </div>
                {showNotaInput && (
                  <div className="flex gap-2 items-center bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 shadow-sm">
                    <FileText className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <Input
                      autoFocus
                      placeholder="Escribí la nota (ej: agregar calcos al pedido)..."
                      value={notaTexto}
                      onChange={(e) => setNotaTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && notaTexto.trim()) {
                          setItems(prev => [...prev, {
                            id: crypto.randomUUID(),
                            nombre: notaTexto.trim(),
                            cantidad: 0,
                            precio_unit: 0,
                            subtotal: 0,
                            stock: 0,
                            esNota: true,
                          }]);
                          setNotaTexto("");
                          setShowNotaInput(false);
                        } else if (e.key === "Escape") {
                          setShowNotaInput(false);
                          setNotaTexto("");
                        }
                      }}
                      className="flex-1 h-9 border-amber-200 focus:border-amber-400 bg-white"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!notaTexto.trim()) return;
                        setItems(prev => [...prev, {
                          id: crypto.randomUUID(),
                          nombre: notaTexto.trim(),
                          cantidad: 0,
                          precio_unit: 0,
                          subtotal: 0,
                          stock: 0,
                          esNota: true,
                        }]);
                        setNotaTexto("");
                        setShowNotaInput(false);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 rounded-lg h-9"
                    >
                      Añadir
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowNotaInput(false); setNotaTexto(""); }} className="h-9 px-2 text-slate-400">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

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
                            item.esNota ? (
                              <TableRow key={item.id} className="bg-amber-50/70 hover:bg-amber-50 transition-colors border-l-2 border-l-amber-400">
                                <TableCell colSpan={3} className="py-3">
                                  <div className="flex items-center gap-2 text-amber-800">
                                    <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                    <span className="text-sm font-medium italic">{item.nombre}</span>
                                    <span className="text-[10px] font-black bg-amber-100 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase">Nota</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right py-3 text-slate-300 text-sm">—</TableCell>
                                <TableCell className="py-3 text-center">
                                  <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                                </TableCell>
                              </TableRow>
                            ) : (
                            <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              <TableCell className="font-medium text-slate-700 py-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    {item.esPack && (
                                      <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-1.5 py-0.5 rounded border border-purple-200 uppercase shrink-0">Pack</span>
                                    )}
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
                            )
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
          <TabsContent value="listado" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">
              <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  {/* BLOQUE DE FILTROS */}
                  <div className="flex flex-wrap items-end gap-4 flex-grow lg:flex-grow-0">
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
                        <Button variant="outline" size="icon" onClick={handleCargar} disabled={isLoadingVentas || isLoadingML} title="Recargar" className="rounded-xl border-slate-200 h-10 w-10 text-slate-400 hover:text-blue-600 transition-all">
                          <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Punto de Venta</Label>
                      <Popover className="min-w-[160px]" ref={puntoVentaRef}>
                        <PopoverTrigger
                          onClick={() => setIsPuntoVentaOpen(!isPuntoVentaOpen)}
                          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs focus:outline-none bg-white flex items-center justify-between hover:border-slate-300 transition-all shadow-sm"
                        >
                          <span className="truncate">
                            {filtroPuntoVenta.length === 0
                              ? "Todos los Puntos"
                              : filtroPuntoVenta.length === 1
                                ? puntosVenta?.find(p => p.id === filtroPuntoVenta[0])?.nombre
                                : `${filtroPuntoVenta.length} Seleccionados`}
                          </span>
                          <ChevronDown className="h-3 w-3 text-slate-400 ml-2" />
                        </PopoverTrigger>
                        {isPuntoVentaOpen && (
                          <PopoverContent className="p-2 w-64 shadow-xl border-slate-100 rounded-xl bg-white" align="start">
                            <div className="flex flex-col gap-1">
                              <div
                                className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                                onClick={() => {
                                  setFiltroPuntoVenta([]);
                                  setIsPuntoVentaOpen(false);
                                }}
                              >
                                <div className={`flex items-center justify-center h-4 w-4 rounded border transition-all ${filtroPuntoVenta.length === 0 ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                  {filtroPuntoVenta.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                                </div>
                                <span className={`text-xs font-semibold ${filtroPuntoVenta.length === 0 ? 'text-blue-600' : 'text-slate-600'}`}>Todos los Puntos</span>
                              </div>
                              <div className="h-px bg-slate-100 my-1" />
                              <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-1">
                                {puntosVenta?.map((p: any) => {
                                  const isSelected = filtroPuntoVenta.includes(p.id);
                                  return (
                                    <div
                                      key={p.id}
                                      className={`flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
                                      onClick={() => {
                                        if (isSelected) {
                                          setFiltroPuntoVenta(filtroPuntoVenta.filter(id => id !== p.id));
                                        } else {
                                          setFiltroPuntoVenta([...filtroPuntoVenta, p.id]);
                                        }
                                      }}
                                    >
                                      <div className={`flex items-center justify-center h-4 w-4 rounded border transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                        {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                                      </div>
                                      <span className={`text-xs ${isSelected ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>{p.nombre}</span>
                                      {p.color && <div className="h-2 w-2 rounded-full ml-auto" style={{ backgroundColor: p.color }} />}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        )}
                      </Popover>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtrar por:</Label>
                      <div className="flex items-center shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                        <select
                          value={tipoBusqueda}
                          onChange={(e) => setTipoBusqueda(e.target.value as any)}
                          className="h-10 bg-slate-50 border-r border-slate-200 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 focus:outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          <option value="venta">Venta</option>
                          <option value="cliente">Cliente</option>
                          <option value="mla_venta">Id Venta MLA</option>
                          <option value="mla_envio">Id Envío MLA</option>
                        </select>
                        <div className="relative flex-grow">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <Input
                            placeholder={tipoBusqueda === "venta" ? "N° Venta o ID..." : tipoBusqueda === "cliente" ? "Nombre o DNI/CUIT..." : tipoBusqueda === "mla_venta" ? "ID Venta o Pack ML..." : "ID Envío ML..."}
                            value={filtroBusquedaTexto}
                            onChange={(e) => setFiltroBusquedaTexto(e.target.value)}
                            className="h-10 border-none focus-visible:ring-0 pl-9 text-xs bg-white w-48 shadow-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Método de Pago</Label>
                      <select
                        value={filtroMetodoPago}
                        onChange={(e) => setFiltroMetodoPago(e.target.value)}
                        className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-xs focus:outline-none hover:border-slate-300 transition-all shadow-sm"
                      >
                        <option value="">Todos</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                        <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                        <option value="MercadoLibre">MercadoLibre</option>
                        <option value="MercadoPago">MercadoPago</option>
                        <option value="Cruzada">Cruzada</option>
                        <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                        <option value="Mixto">Mixto</option>
                      </select>
                    </div>

                    <div className="flex items-center space-x-2 bg-slate-50 px-3 h-10 rounded-xl border border-slate-100">
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

                    <Button
                      onClick={handleCargar}
                      disabled={isLoadingVentas || isLoadingML}
                      className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                    >
                      {(isLoadingVentas || isLoadingML) ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando...</>
                      ) : (
                        <><Search className="h-3.5 w-3.5" />Cargar</>
                      )}
                    </Button>
                  </div>

                  {/* BLOQUE DE RESUMEN */}
                  <div className="flex flex-wrap items-start gap-8 justify-end ml-auto">
                    <div className="text-right min-w-[180px]">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Resumen</p>
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xl font-black text-slate-900 tracking-tight">Total: ${ventasActivasFiltradas.reduce((acc, v) => acc + (v.mlIdVenta ? Number(v.total) : Number(v.totalFinal || v.total)), 0).toLocaleString('es-AR')}</p>
                        <p className="text-sm font-bold text-green-600">Ventas: {ventasActivasFiltradas.length}{ventasFiltradas.length !== ventasActivasFiltradas.length && <span className="text-red-400 ml-1 font-medium text-xs">({ventasFiltradas.length - ventasActivasFiltradas.length} anulada/s)</span>}</p>
                        <p className="text-[10px] font-medium text-slate-500">Promedio: ${ventasActivasFiltradas.length > 0 ? Math.round(ventasActivasFiltradas.reduce((acc, v) => acc + (v.mlIdVenta ? Number(v.total) : Number(v.totalFinal || v.total)), 0) / ventasActivasFiltradas.length).toLocaleString('es-AR') : '0'}</p>
                      </div>
                    </div>

                    <div className="text-left flex-shrink-0 min-w-[150px]">
                      {topItemsVentas.length > 0 ? (
                        <>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Top 5 Vendidos</p>
                          <div className="flex flex-col gap-0.5">
                            {topItemsVentas.map((item, index) => (
                              <p key={index} className="text-[10px] text-slate-600 font-medium truncate max-w-[180px]">
                                {index + 1}. {item.nombre} ({item.total})
                              </p>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Sin datos</p>
                      )}
                    </div>

                    <div className="text-left flex-shrink-0 min-w-[150px]">
                      {ventasPorMetodo.length > 0 ? (
                        <>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Por Método</p>
                          <div className="flex flex-col gap-0.5">
                            {ventasPorMetodo.map(({ metodo, total }, index) => (
                              <p key={metodo} className={`text-[10px] font-medium ${metodo === 'Efectivo' ? 'text-red-600' :
                                metodo === 'Cruzada' ? 'text-blue-600' :
                                  metodo === 'Mixto' ? 'text-purple-600' :
                                    'text-blue-600'
                                }`}>
                                {metodo} ${total.toLocaleString('es-AR')}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Sin datos</p>
                      )}
                    </div>
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
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Cupón / De / Id venta MLA</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Trans. / Para / Id envio MLA</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Info Extra</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                        <TableHead className="text-center text-[10px] font-bold uppercase py-3 w-28">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mostrandoGlobal && (
                        <TableRow>
                          <TableCell colSpan={10} className="py-2 px-4 bg-amber-50 border-b border-amber-200">
                            <p className="text-xs text-amber-700 font-semibold">⚠ Resultados fuera del rango de fechas seleccionado — {ventasGlobales!.length} venta/s encontrada/s en el historial completo</p>
                          </TableCell>
                        </TableRow>
                      )}
                      {ventasParaTabla.length === 0 ? (
                        esBusquedaML && filtroBusquedaTexto.length >= 4 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="py-16 text-center space-y-3">
                              <p className="text-slate-400 italic text-sm mb-3">No se encontraron ventas en el rango de fechas seleccionado.</p>
                              <Button
                                onClick={handleBuscarGlobal}
                                disabled={isSearchingGlobal}
                                variant="outline"
                                size="sm"
                                className="border-blue-300 text-blue-600 hover:bg-blue-50"
                              >
                                {isSearchingGlobal
                                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Buscando en todo el historial...</>
                                  : <>Buscar en todas las fechas</>}
                              </Button>
                              {ventasGlobales !== null && ventasGlobales.length === 0 && (
                                <p className="text-xs text-red-500 mt-2">No se encontró esta venta en ningún registro del sistema.</p>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : (
                          <TableRow><TableCell colSpan={10} className="py-20 text-center text-slate-400 italic">No se encontraron ventas con estos filtros</TableCell></TableRow>
                        )
                      ) : (
                        ventasParaTabla.map((v) => {
                          const isExpanded = expandedVentas.has(v.id);
                          const isAnulada = v.estadoPedido === "CANCELADO";
                          return (
                            <React.Fragment key={v.id}>
                              <TableRow className={`align-top transition-colors ${isAnulada ? 'bg-red-50/70 hover:bg-red-50' : v.mlAlerta ? 'bg-orange-50/60 hover:bg-orange-50' : 'hover:bg-slate-50/50'}`}>
                                <TableCell className="py-4">
                                  <div className="flex flex-col gap-1.5">
                                    <span
                                      className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer hover:text-blue-600 transition-colors w-fit"
                                      title={`Click para copiar ID completo: ${v.id}`}
                                      onClick={() => copiarAlPortapapeles(v.id)}
                                    >
                                      {v.numeroVenta || v.id.slice(0, 8)}
                                    </span>
                                    {isAnulada && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-md w-fit">
                                        <X className="h-3 w-3" /> ANULADA
                                      </span>
                                    )}
                                    {v.mlAlerta && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-md w-fit animate-pulse">
                                        <BellRing className="h-3 w-3" /> RECLAMO
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-slate-700 font-bold whitespace-nowrap">{new Date(v.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{new Date(v.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </TableCell>

                                <TableCell className="font-medium text-slate-700 py-4">
                                  {v.cliente}
                                  {v.dni && <div className="text-[10px] text-blue-600 font-bold mt-0.5">DNI/CUIT: {v.dni}</div>}
                                  {v.email && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{v.email}</div>}
                                  {v.puntoVenta && (
                                    <div className="mt-1">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-full uppercase ${v.puntoVenta.nombre.toLowerCase().includes('mercadolibre') ? 'text-slate-900 font-bold' : 'text-white'}`}
                                        style={{ backgroundColor: v.puntoVenta.color || '#10b981' }}
                                      >
                                        {v.puntoVenta.nombre}
                                      </span>
                                    </div>
                                  )}
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
                                    {v.metodo_pago === "mercadopago (ML)" ? "MercadoLibre" : v.metodo_pago}
                                  </span>
                                </TableCell>
                                <TableCell
                                  className="py-4 text-xs font-mono text-slate-600"
                                >
                                  {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (
                                    <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => v.de && copiarAlPortapapeles(v.de)} title="Click para copiar">
                                      {v.de || "-"}
                                    </span>
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => v.cupon && copiarAlPortapapeles(v.cupon)} title="Click para copiar order ID">
                                        {v.cupon || "-"}
                                      </span>
                                      {v.mlPackId && (
                                        <span
                                          className="text-[10px] text-yellow-700 font-bold bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200 cursor-pointer hover:bg-yellow-100 transition-colors w-fit"
                                          onClick={() => copiarAlPortapapeles(v.mlPackId)}
                                          title={`Pack ID: ${v.mlPackId} — Click para copiar`}
                                        >
                                          Pack: {v.mlPackId}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell
                                  className="py-4 text-xs font-mono text-slate-600 cursor-pointer hover:text-blue-600 transition-colors"
                                  onClick={() => {
                                    const val = (v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.para || "") : (v.transaccionId || "");
                                    if (val) copiarAlPortapapeles(val);
                                  }}
                                  title="Click para copiar"
                                >
                                  {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? renderParaDisplay(v.para) : (v.transaccionId || "-")}
                                </TableCell>
                                <TableCell
                                  className="py-4 text-xs text-slate-500 max-w-[200px] cursor-pointer hover:text-blue-600 transition-colors"
                                  title={v.info ? `Click para copiar: ${v.info}` : ""}
                                  onClick={() => v.info && copiarAlPortapapeles(v.info)}
                                >
                                  {v.mlIdVenta ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-orange-500 font-bold whitespace-nowrap">Bruto: $ {Number(v.totalFinal || v.total).toLocaleString('es-AR')}</span>
                                      {v.info && <span className="text-[10px] opacity-70">{v.info}</span>}
                                    </div>
                                  ) : (
                                    v.info || "-"
                                  )}
                                </TableCell>
                                <TableCell className="text-right py-4">
                                  <span className={`font-black ${isAnulada ? 'text-red-400 line-through' : 'text-slate-900'}`}>
                                    $ {(v.mlIdVenta ? Number(v.total) : Number(v.totalFinal || v.total)).toLocaleString('es-AR')}
                                  </span>
                                </TableCell>
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
                                      onClick={(e) => { e.stopPropagation(); handleVerResumenPDF(v); }}
                                      className="p-2 rounded-xl transition-all text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent"
                                      title="Ver Resumen PDF"
                                    >
                                      {isGeneratingPDF && ventaParaPedido?.id === v.id ? (
                                        <RefreshCcw className="h-5 w-5 animate-spin" />
                                      ) : (
                                        <span className="font-bold text-lg">X</span>
                                      )}
                                    </button>
                                    {!v.cae ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleGenerarFactura(v.id); }}
                                        disabled={isFacturando}
                                        className="p-2 rounded-xl text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-all border border-transparent"
                                        title="Generar Factura ARCA"
                                      >
                                        {isFacturando ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <button
                                          disabled={isGeneratingPDF}
                                          onClick={(e) => { e.stopPropagation(); handleImprimirFactura(v); }}
                                          className={`p-2 rounded-xl border transition-all ${isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100'}`}
                                          title={`Imprimir ${[3, 8, 13].includes(v.tipoComprobante) ? 'Nota de Crédito' : 'Factura'} Legal A4 - CAE: ${v.cae}`}
                                        >
                                          {isGeneratingPDF && ventaParaFactura?.id === v.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
                                        </button>
                                        {v.tipoComprobante === 6 && !v.info?.includes("REFACTURADA") && !v.info?.includes("ANULADA CON NC") && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); abrirModalRefacturar(v); }}
                                            className="p-2 rounded-xl text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition-all border border-transparent"
                                            title="Refacturar como Factura A (genera NC de la B y emite Factura A con CUIT)"
                                          >
                                            <ArrowRightLeft className="h-5 w-5" />
                                          </button>
                                        )}
                                        <div className="p-2 text-green-600 bg-green-50 rounded-xl border border-green-100" title={`Facturado - CAE: ${v.cae}`}>
                                          <ShieldCheck className="h-5 w-5" />
                                        </div>
                                      </div>
                                    )}
                                    {v.mlIdEnvio && (() => {
                                      const tieneFoto = enviosConFoto.has(v.mlIdEnvio);
                                      return (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); if (tieneFoto) handleVerFotosVenta(v); }}
                                          disabled={!tieneFoto || loadingFotosVentaId === v.id}
                                          className={`p-2 rounded-xl transition-all border border-transparent ${tieneFoto ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-slate-200 cursor-not-allowed'}`}
                                          title={tieneFoto ? "Ver foto de preparación / auditoría" : "Sin foto de preparación cargada"}
                                        >
                                          {loadingFotosVentaId === v.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                                        </button>
                                      );
                                    })()}
                                    {/* Foto de preparación de Pedido de Venta (auditoría por ventaId) */}
                                    {pedidosConFoto[v.id] && (() => {
                                      const estado = pedidosConFoto[v.id];
                                      const color = estado === 'AUDITADO' ? 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50'
                                        : estado === 'RECHAZADO' ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                                        : 'text-amber-500 hover:text-amber-600 hover:bg-amber-50';
                                      return (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleVerFotosPedido(v); }}
                                          disabled={loadingFotosVentaId === v.id}
                                          className={`p-2 rounded-xl transition-all border border-transparent ${color}`}
                                          title={`Foto de preparación del pedido — ${estado}`}
                                        >
                                          {loadingFotosVentaId === v.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                                        </button>
                                      );
                                    })()}
                                    {v.mlIdVenta && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); abrirAlertaML(v); }}
                                        className={`p-2 rounded-xl transition-all border ${v.mlAlerta ? 'text-orange-500 bg-orange-50 border-orange-200 hover:bg-orange-100' : 'text-slate-400 hover:text-orange-500 hover:bg-orange-50 border-transparent'}`}
                                        title={v.mlAlerta ? `Alerta activa: ${v.mlObservacion || ''}` : "Agregar alerta / reclamo ML"}
                                      >
                                        {v.mlAlerta ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); abrirModalEliminacion(v); }}
                                      className="p-2 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 transition-all border border-transparent"
                                      title={v.cae && !v.info?.includes("ANULADA CON NC") ? "Anular venta (genera NC en ARCA)" : "Eliminar venta"}
                                    >
                                      <Trash2 className="h-5 w-5" />
                                    </button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow className="bg-slate-50/30 border-b-2 border-slate-200">
                                  <TableCell colSpan={3} className="py-0">
                                    <div className="p-3 bg-white border-b border-slate-200">
                                      {v.mlAlerta && (
                                        <div className="flex items-start gap-2 mb-3 p-3 bg-orange-50 border border-orange-300 rounded-lg">
                                          <BellRing className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-black text-orange-700 uppercase tracking-wide">Alerta de Reclamo</span>
                                            {v.mlObservacion && <span className="text-xs text-orange-600">{v.mlObservacion}</span>}
                                          </div>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); abrirAlertaML(v); }}
                                            className="ml-auto text-orange-400 hover:text-orange-600 transition-colors"
                                            title="Editar alerta"
                                          >
                                            <Edit className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
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

          {/* --- PESTAÑA: PEDIDOS DE VENTAS --- */}
          <TabsContent value="pedidos" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full bg-white">
            <div className="flex-grow overflow-auto">
              <PedidosVentaEdicionClient />
            </div>
          </TabsContent>

          {/* --- PESTAÑA: GESTIÓN Y EDICIÓN --- */}
          <TabsContent value="gestion" className="flex-grow overflow-hidden m-0 select-text data-[state=active]:flex data-[state=active]:flex-col h-full">
            <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full gap-4 overflow-hidden h-full">
              <div className="flex flex-col gap-4 bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm flex-shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  {/* BLOQUE DE FILTROS */}
                  <div className="flex flex-wrap items-end gap-4 flex-grow lg:flex-grow-0">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Filtrar por Fecha</Label>
                      <div className="flex items-center gap-2">
                        <DateRangeCalendar
                          fechaDesde={fechaDesde}
                          fechaHasta={fechaHasta}
                          setFechaDesde={(date) => { setFechaDesde(date); cargarVentas(date, fechaHasta); }}
                          setFechaHasta={(date) => { setFechaHasta(date); cargarVentas(fechaDesde, date); }}
                          onApply={() => { }}
                        />
                        <Button variant="outline" size="icon" onClick={handleCargar} disabled={isLoadingVentas || isLoadingML} title="Recargar" className="rounded-xl border-amber-200 h-10 w-10 text-amber-500 hover:text-amber-700 hover:bg-white transition-all">
                          <RefreshCcw className={`h-4 w-4 ${isLoadingVentas ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Punto de Venta</Label>
                      <Popover className="min-w-[160px]" ref={puntoVentaGestionRef}>
                        <PopoverTrigger
                          onClick={() => setIsPuntoVentaOpenGestion(!isPuntoVentaOpenGestion)}
                          className="h-10 w-full rounded-xl border border-amber-200 px-3 text-xs focus:outline-none bg-white flex items-center justify-between hover:border-amber-300 transition-all shadow-sm"
                        >
                          <span className="truncate">
                            {filtroPuntoVenta.length === 0
                              ? "Todos los Puntos"
                              : filtroPuntoVenta.length === 1
                                ? puntosVenta?.find(p => p.id === filtroPuntoVenta[0])?.nombre
                                : `${filtroPuntoVenta.length} Seleccionados`}
                          </span>
                          <ChevronDown className="h-3 w-3 text-amber-400 ml-2" />
                        </PopoverTrigger>
                        {isPuntoVentaOpenGestion && (
                          <PopoverContent className="p-2 w-64 shadow-xl border-amber-100 rounded-xl bg-white" align="start">
                            <div className="flex flex-col gap-1">
                              <div
                                className="flex items-center space-x-2 p-2 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                                onClick={() => {
                                  setFiltroPuntoVenta([]);
                                  setIsPuntoVentaOpenGestion(false);
                                }}
                              >
                                <div className={`flex items-center justify-center h-4 w-4 rounded border transition-all ${filtroPuntoVenta.length === 0 ? 'bg-amber-600 border-amber-600' : 'border-amber-200'}`}>
                                  {filtroPuntoVenta.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                                </div>
                                <span className={`text-xs font-semibold ${filtroPuntoVenta.length === 0 ? 'text-amber-600' : 'text-amber-700'}`}>Todos los Puntos</span>
                              </div>
                              <div className="h-px bg-amber-100 my-1" />
                              <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-1">
                                {puntosVenta?.map((p: any) => {
                                  const isSelected = filtroPuntoVenta.includes(p.id);
                                  return (
                                    <div
                                      key={p.id}
                                      className={`flex items-center space-x-2 p-2 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-amber-50' : ''}`}
                                      onClick={() => {
                                        if (isSelected) {
                                          setFiltroPuntoVenta(filtroPuntoVenta.filter(id => id !== p.id));
                                        } else {
                                          setFiltroPuntoVenta([...filtroPuntoVenta, p.id]);
                                        }
                                      }}
                                    >
                                      <div className={`flex items-center justify-center h-4 w-4 rounded border transition-all ${isSelected ? 'bg-amber-600 border-amber-600' : 'border-amber-200'}`}>
                                        {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                                      </div>
                                      <span className={`text-xs ${isSelected ? 'text-amber-800 font-medium' : 'text-amber-700'}`}>{p.nombre}</span>
                                      {p.color && <div className="h-2 w-2 rounded-full ml-auto" style={{ backgroundColor: p.color }} />}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        )}
                      </Popover>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Filtrar por:</Label>
                      <div className="flex items-center shadow-sm rounded-xl overflow-hidden border border-amber-200 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400 transition-all">
                        <select
                          value={tipoBusqueda}
                          onChange={(e) => setTipoBusqueda(e.target.value as any)}
                          className="h-10 bg-amber-50/50 border-r border-amber-200 px-3 text-[10px] font-bold uppercase tracking-wider text-amber-600 focus:outline-none cursor-pointer hover:bg-amber-100/50 transition-colors"
                        >
                          <option value="venta">Venta</option>
                          <option value="cliente">Cliente</option>
                          <option value="mla_venta">Id Venta MLA</option>
                          <option value="mla_envio">Id Envío MLA</option>
                        </select>
                        <div className="relative flex-grow">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-amber-400" />
                          <Input
                            placeholder={tipoBusqueda === "venta" ? "N° Venta o ID..." : tipoBusqueda === "cliente" ? "Nombre o DNI/CUIT..." : tipoBusqueda === "mla_venta" ? "ID Venta o Pack ML..." : "ID Envío ML..."}
                            value={filtroBusquedaTexto}
                            onChange={(e) => setFiltroBusquedaTexto(e.target.value)}
                            className="h-10 border-none focus-visible:ring-0 pl-9 text-xs bg-white w-48 shadow-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BLOQUE DE ALERTA */}
                  <div className="text-right ml-auto">
                    <p className="text-xs text-amber-700 font-bold flex items-center gap-2 justify-end"><AlertTriangle className="h-4 w-4" /> Área de Modificaciones</p>
                    <p className="text-[10px] text-amber-600">Las ediciones quedarán registradas en el historial.</p>
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
                        <TableHead className="text-[10px] font-bold uppercase py-3">Método</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Cupón / De / Id venta MLA</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Trans. / Para / Id envio MLA</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-slate-600">Info Extra</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Total Final</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Vendedor</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase py-3">Acciones Administrativas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mostrandoGlobal && (
                        <TableRow>
                          <TableCell colSpan={10} className="py-2 px-4 bg-amber-50 border-b border-amber-200">
                            <p className="text-xs text-amber-700 font-semibold">⚠ Resultados fuera del rango de fechas seleccionado — {ventasGlobales!.length} venta/s encontrada/s en el historial completo</p>
                          </TableCell>
                        </TableRow>
                      )}
                      {ventasParaTabla.length === 0 ? (
                        esBusquedaML && filtroBusquedaTexto.length >= 4 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="py-16 text-center space-y-3">
                              <p className="text-slate-400 italic text-sm mb-3">No se encontraron ventas en el rango de fechas seleccionado.</p>
                              <Button
                                onClick={handleBuscarGlobal}
                                disabled={isSearchingGlobal}
                                variant="outline"
                                size="sm"
                                className="border-blue-300 text-blue-600 hover:bg-blue-50"
                              >
                                {isSearchingGlobal
                                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Buscando en todo el historial...</>
                                  : <>Buscar en todas las fechas</>}
                              </Button>
                              {ventasGlobales !== null && ventasGlobales.length === 0 && (
                                <p className="text-xs text-red-500 mt-2">No se encontró esta venta en ningún registro del sistema.</p>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : (
                          <TableRow><TableCell colSpan={10} className="py-20 text-center text-slate-400 italic">No se encontraron ventas con estos filtros</TableCell></TableRow>
                        )
                      ) : (
                        ventasParaTabla.map((v) => (
                          <TableRow key={v.id} className="hover:bg-slate-50/50">
                            <TableCell className="py-4">
                              <span
                                className="text-xs font-mono text-slate-700 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-pointer hover:text-blue-600 transition-colors"
                                title={`Click para copiar ID completo: ${v.id}`}
                                onClick={() => copiarAlPortapapeles(v.id)}
                              >
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
                              {v.dni && <div className="text-[10px] text-blue-600 font-bold mt-0.5">DNI/CUIT: {v.dni}</div>}
                              {v.puntoVenta && (
                                <div className="mt-1">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full uppercase ${v.puntoVenta.nombre.toLowerCase().includes('mercadolibre') ? 'text-slate-900 font-bold' : 'text-white'}`}
                                    style={{ backgroundColor: v.puntoVenta.color || '#10b981' }}
                                  >
                                    {v.puntoVenta.nombre}
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${v.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' : v.metodo_pago === 'Mixto' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {v.metodo_pago}
                              </span>
                            </TableCell>
                            <TableCell
                              className="py-4 text-xs font-mono text-slate-600 cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => {
                                const val = (v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.de || "") : (v.cupon || "");
                                if (val) copiarAlPortapapeles(val);
                              }}
                              title="Click para copiar"
                            >
                              {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.de || "-") : (v.cupon || "-")}
                            </TableCell>
                            <TableCell
                              className="py-4 text-xs font-mono text-slate-600 cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => {
                                const val = (v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? (v.para || "") : (v.transaccionId || "");
                                if (val) copiarAlPortapapeles(val);
                              }}
                              title="Click para copiar"
                            >
                              {(v.metodo_pago === 'Cruzada' || v.metodo_pago === 'Mixto') ? renderParaDisplay(v.para) : (v.transaccionId || "-")}
                            </TableCell>
                            <TableCell
                              className="py-4 text-xs text-slate-500 max-w-[200px] cursor-pointer hover:text-blue-600 transition-colors"
                              title={v.info ? `Click para copiar: ${v.info}` : ""}
                              onClick={() => v.info && copiarAlPortapapeles(v.info)}
                            >
                              {v.mlIdVenta ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-orange-500 font-bold whitespace-nowrap">Bruto: $ {Number(v.totalFinal || v.total).toLocaleString('es-AR')}</span>
                                  {v.info && <span className="text-[10px] opacity-70">{v.info}</span>}
                                </div>
                              ) : (
                                v.info || "-"
                              )}
                            </TableCell>
                            <TableCell className="font-black text-slate-900 py-4">$ {(v.mlIdVenta ? Number(v.total) : Number(v.totalFinal || v.total)).toLocaleString('es-AR')}</TableCell>
                            <TableCell className="text-xs text-slate-500 py-4">{v.vendedor}</TableCell>
                            <TableCell className="py-4 text-right space-x-2 whitespace-nowrap">
                              {!v.info?.includes("ANULADA CON NC") && v.estadoPedido !== "CANCELADO" && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => abrirModalEdicion(v)} className="border-amber-200 text-amber-700 hover:bg-amber-50">
                                    <Edit className="h-4 w-4 mr-2" /> Editar Venta
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleAnularConNC(v.id)}
                                    disabled={isFacturando || !v.cae}
                                    className="bg-rose-100 text-rose-700 hover:bg-rose-200 hover:text-rose-800 border border-rose-300 disabled:opacity-50 disabled:grayscale"
                                  >
                                    <AlertTriangle className="h-4 w-4 mr-2" /> Anular (NC)
                                  </Button>
                                </>
                              )}
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
          {/* --- PESTAÑA: ENVÍOS ANDREANI --- */}
          <TabsContent value="andreani" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <EnviosAndreaniTab />
          </TabsContent>
        </Tabs>

        {/* --- MODALES COMUNES --- */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
            <div className="p-6 bg-white border-b relative">
              <div className="flex items-center justify-between mb-3">
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2"><Search className="h-4 w-4 text-blue-600" /> Buscador Instantáneo</DialogTitle>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={expandirPacks}
                    onCheckedChange={(v) => setExpandirPacks(!!v)}
                    className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  />
                  <span className="text-xs font-semibold text-slate-500">Detallar artículos del pack</span>
                </label>
              </div>
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
          <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
            <div className="max-h-[95vh] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
              <DialogHeader><DialogTitle className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-600" /> Detalles del Cobro</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase">CUIT / DNI (Padrón A13)</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1" ref={searchSujetoRef}>
                        <Input
                          value={cuitBusqueda}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCuitBusqueda(val);
                            handleSearchSujetos(val);
                            if (!val.trim()) {
                              setCliente("Consumidor Final");
                              setDocNro("");
                              setCondicionIva(5);
                              setTipoFacturaSugerida(6);
                              setSujetoId(null);
                            }
                          }}
                          onFocus={() => {
                            if (cuitBusqueda.trim() && sujetosEncontrados.length > 0) {
                              setShowSujetoList(true);
                            }
                          }}
                          placeholder="CUIT o DNI..."
                          className="h-10 bg-slate-50 border-slate-200 pl-9"
                        />
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

                        {showSujetoList && sujetosEncontrados.length > 0 && (
                          <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                            {sujetosEncontrados.map(s => (
                              <div
                                key={s.id}
                                className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"
                                onClick={() => handleSelectSujeto(s)}
                              >
                                <p className="font-bold text-slate-800">{s.razonSocial}</p>
                                <p className="text-[10px] text-slate-400">{s.cuit} - {s.condicionIva === 1 ? 'RI' : 'Cons. Final'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleBuscarPadron}
                        disabled={isSearchingPadron}
                        className="rounded-xl h-10 px-3 shrink-0 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100"
                        title="Buscar en Padrón AFIP"
                      >
                        {isSearchingPadron ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { setCuitBusqueda(""); setCliente("Consumidor Final"); setSujetoId(null); setDocNro(""); setDocTipo(99); setCondicionIva(5); }}
                        className="rounded-xl h-10 px-3 shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-100"
                        title="Limpiar y volver a Consumidor Final"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Cliente / Razón Social</Label>
                    <div className="relative">
                      <Input value={cliente} onChange={(e) => setCliente(e.target.value)} className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white transition-colors" />
                      <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    </div>
                    {docNro && (
                      <div className="mt-2 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-top-1">
                        <div className="grid grid-cols-1 gap-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <Label className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Razón Social Encontrada</Label>
                              <p className="text-sm font-black text-emerald-900">{cliente}</p>
                            </div>
                            <Badge className={`${condicionIva === 1 ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              condicionIva === 6 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                'bg-slate-100 text-slate-600 border-slate-200'
                              } font-black text-[9px] border shadow-none`}>
                              {condicionIva === 1 ? 'RESP. INSCRIPTO' : condicionIva === 6 ? 'MONOTRIBUTISTA' : 'CONSUMIDOR FINAL'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 border-t border-emerald-100/50 pt-2">
                            <span className="text-[10px] text-emerald-600 font-bold uppercase">
                              {docTipo === 80 ? 'CUIT' : 'DNI'}: <span className="text-emerald-900 font-black">{docNro}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center space-x-3 bg-amber-50 p-3 rounded-xl border border-amber-200 flex-1">
                    <input
                      type="checkbox"
                      id="solicitarFactura"
                      checked={solicitarFactura}
                      onChange={(e) => setSolicitarFactura(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                    />
                    <Label htmlFor="solicitarFactura" className="text-sm font-bold text-amber-700 cursor-pointer flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Generar Factura AFIP
                    </Label>
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
                        <OpcionesMetodoPago incluirAConfirmar={false} />
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
                        <OpcionesMetodoPago />
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
                      <OpcionesMetodoPago />
                    </select>
                    {esTarjetaCreditoUnica && (
                      <div className="space-y-2 pt-1 animate-in fade-in">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Procesador / Entidad</Label>
                        <select value={procesadorTarjeta} onChange={(e) => setProcesadorTarjeta(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:outline-none">
                          <option value="Posnet Intercap" style={{ backgroundColor: "#dbeafe" }}>🏦 Posnet Intercap</option>
                          <option value="Go Cuotas" style={{ backgroundColor: "#fef9c3" }}>📅 Go Cuotas</option>
                          <option value="Posnet Mercadopago" style={{ backgroundColor: "#e0e7ff" }}>🔵 Posnet Mercadopago</option>
                        </select>
                      </div>
                    )}
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

                {requiereMercadoLibre && (
                  <div className="grid grid-cols-2 gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 animate-in fade-in">
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Id Venta <span className="text-red-500">*</span></Label><Input value={mlIdVenta} onChange={(e) => setMlIdVenta(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Id Envío <span className="text-red-500">*</span></Label><Input value={mlIdEnvio} onChange={(e) => setMlIdEnvio(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">MLA <span className="text-red-500">*</span></Label><Input value={mlMla} onChange={(e) => setMlMla(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Dni <span className="text-slate-400">(Opcional)</span></Label><Input value={mlDni} onChange={(e) => setMlDni(e.target.value)} className="bg-white border-indigo-200" placeholder="DNI del cliente" /></div>
                  </div>
                )}

                {requiereMercadoPago && (
                  <div className="grid grid-cols-1 gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 animate-in fade-in">
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Id de pago <span className="text-red-500">*</span></Label><Input value={mlIdVenta} onChange={(e) => setMlIdVenta(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                  </div>
                )}

                {requiereCruzada && !isPagoMixto && (
                  <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border border-amber-100 animate-in fade-in">
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs font-bold text-amber-700">Pago Cruzada: Detalle de Proveedores</Label>
                      {proveedoresCruzada.length < 4 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] font-bold border-amber-300 text-amber-700 hover:bg-amber-100"
                          onClick={agregarProveedorCruzada}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Añadir Persona
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-amber-600 uppercase">Origen (De)</Label>
                        <Input
                          value={deCruzada}
                          onChange={(e) => setDeCruzada(e.target.value)}
                          className="h-9 bg-white border-amber-200"
                          placeholder="¿Quién envía el dinero?"
                        />
                      </div>

                      {proveedoresCruzada.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-start bg-white/50 p-2 rounded-lg border border-amber-100/50 relative">
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Proveedor {idx + 1}</Label>
                            <div className="relative">
                              <Input
                                value={item.razonSocial}
                                onChange={(e) => {
                                  actualizarProveedorCruzada(idx, 'razonSocial', e.target.value);
                                  setShowProvListMulti(idx);
                                }}
                                onFocus={() => setShowProvListMulti(idx)}
                                className="h-9 bg-white border-amber-200 text-xs"
                                placeholder="Buscar..."
                              />
                              {showProvListMulti === idx && proveedores.length > 0 && (
                                <div className="absolute z-[110] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                  {proveedores
                                    .filter(p => p.razonSocial.toLowerCase().includes(item.razonSocial.toLowerCase()) || p.cuit.includes(item.razonSocial))
                                    .map(p => (
                                      <div
                                        key={p.id}
                                        className="p-2 hover:bg-amber-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          actualizarProveedorCruzadaMultiple(idx, {
                                            razonSocial: p.razonSocial,
                                            id: p.id
                                          });
                                          setShowProvListMulti(null);
                                        }}
                                      >
                                        <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                        <p className="text-[9px] text-slate-400">{p.cuit}</p>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="w-28 space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Monto</Label>
                            <Input
                              type="number"
                              value={item.monto}
                              onChange={(e) => actualizarProveedorCruzada(idx, 'monto', Number(e.target.value))}
                              className="h-9 bg-white border-amber-200 text-xs font-bold text-amber-900"
                            />
                          </div>

                          {proveedoresCruzada.length > 1 && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 mt-5 text-red-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => eliminarProveedorCruzada(idx)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center p-2 bg-amber-100/50 rounded-lg border border-amber-200 mt-2">
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Suma Total Cruzada:</span>
                      <span className={`text-sm font-black ${Math.abs(proveedoresCruzada.reduce((acc, curr) => acc + curr.monto, 0) - totalFinalCalculado) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                        $ {proveedoresCruzada.reduce((acc, curr) => acc + curr.monto, 0).toLocaleString('es-AR')} / $ {totalFinalCalculado.toLocaleString('es-AR')}
                      </span>
                    </div>
                    {Math.abs(proveedoresCruzada.reduce((acc, curr) => acc + curr.monto, 0) - totalFinalCalculado) >= 0.01 && (
                      <p className="text-[10px] text-red-500 font-bold text-center">La suma debe coincidir con el total de la venta.</p>
                    )}
                  </div>
                )}

                {/* MIXTO: Cruzada + Cuenta Corriente — dos secciones separadas */}
                {esMixtoCruzadaCC && (
                  <div className="space-y-3 animate-in fade-in">
                    {/* Sección Cruzada */}
                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold text-amber-800 uppercase">Pago Cruzada</Label>
                        <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                          $ {(metodoPago === "Cruzada" ? final1 : final2).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-amber-700 uppercase">Quien Envía (De) <span className="text-red-500">*</span></Label>
                          <Input
                            value={deCruzada}
                            onChange={(e) => setDeCruzada(e.target.value)}
                            className="bg-white border-amber-200 h-9 text-sm"
                            placeholder="Nombre de quien envía..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-amber-700 uppercase">Proveedor (Para) <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <Input
                              value={paraCruzada}
                              onChange={(e) => { setParaCruzada(e.target.value); setShowProvList(true); }}
                              onFocus={() => setShowProvList(true)}
                              className="bg-white border-amber-200 h-9 text-sm"
                              placeholder="Buscar proveedor..."
                            />
                            {showProvList && proveedores.length > 0 && (
                              <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                {proveedores
                                  .filter(p => p.razonSocial.toLowerCase().includes(paraCruzada.toLowerCase()) || p.cuit.includes(paraCruzada))
                                  .map(p => (
                                    <div key={p.id} className="p-2 hover:bg-amber-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setParaCruzada(p.razonSocial); setShowProvList(false); }}>
                                      <div className="flex justify-between items-start">
                                        <div><p className="font-bold text-slate-800">{p.razonSocial}</p><p className="text-[9px] text-slate-400">{p.cuit}</p></div>
                                        <p className={`text-xs font-bold ${p.total < 0 ? 'text-red-500' : p.total > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>$ {Number(p.total).toLocaleString('es-AR')}</p>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sección Cuenta Corriente */}
                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold text-emerald-800 uppercase">Cuenta Corriente</Label>
                        <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                          $ {(metodoPago === "A Cuenta Corriente" ? final1 : final2).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-emerald-700 uppercase">Proveedor / Cuenta <span className="text-red-500">*</span></Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={paraCuentaCorriente}
                              onChange={(e) => { setParaCuentaCorriente(e.target.value); setShowProvListCC(true); }}
                              onFocus={() => setShowProvListCC(true)}
                              className="bg-white border-emerald-200 h-9 text-sm"
                              placeholder="Buscar proveedor..."
                            />
                            {showProvListCC && proveedores.length > 0 && (
                              <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                {proveedores
                                  .filter(p => p.razonSocial.toLowerCase().includes(paraCuentaCorriente.toLowerCase()) || p.cuit.includes(paraCuentaCorriente))
                                  .map(p => (
                                    <div key={p.id} className="p-2 hover:bg-emerald-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setParaCuentaCorriente(p.razonSocial); setShowProvListCC(false); }}>
                                      <div className="flex justify-between items-start">
                                        <div><p className="font-bold text-slate-800">{p.razonSocial}</p><p className="text-[9px] text-slate-400">{p.cuit}</p></div>
                                        <div className="text-right">
                                          <p className={`text-xs font-bold ${p.total < 0 ? 'text-red-500' : p.total > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>$ {Number(p.total).toLocaleString('es-AR')}</p>
                                          <p className="text-[8px] text-slate-400 uppercase font-bold">Saldo</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                          <Button type="button" size="icon" variant="outline"
                            className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 h-9 w-9 shrink-0"
                            onClick={() => setIsAddProveedorModalOpen(true)} title="Nuevo Proveedor">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mixto con solo Cruzada, o solo Cuenta Corriente (sin el otro) */}
                {((requiereCruzada && isPagoMixto && !esMixtoCruzadaCC) || (requiereCuentaCorriente && !esMixtoCruzadaCC)) && (
                  <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-100 animate-in fade-in">
                    {requiereCruzada && (
                      <div className="space-y-2"><Label className="text-xs font-bold text-amber-700">De <span className="text-red-500">*</span></Label><Input value={deCruzada} onChange={(e) => setDeCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Origen" /></div>
                    )}
                    <div className={`space-y-2 relative ${!requiereCruzada ? 'col-span-2' : ''}`}>
                      <Label className="text-xs font-bold text-amber-700">{requiereCuentaCorriente ? "Cuenta / Proveedor" : "Para"} <span className="text-red-500">*</span></Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={paraCruzada}
                            onChange={(e) => { setParaCruzada(e.target.value); setShowProvList(true); }}
                            onFocus={() => setShowProvList(true)}
                            className="bg-white border-amber-200"
                            placeholder="Buscar proveedor..."
                          />
                          {showProvList && proveedores.length > 0 && (
                            <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                              {proveedores
                                .filter(p => p.razonSocial.toLowerCase().includes(paraCruzada.toLowerCase()) || p.cuit.includes(paraCruzada))
                                .map(p => (
                                  <div
                                    key={p.id}
                                    className="p-2 hover:bg-amber-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setParaCruzada(p.razonSocial);
                                      setShowProvList(false);
                                    }}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                        <p className="text-[10px] text-slate-400">{p.cuit}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className={`text-xs font-bold ${p.total < 0 ? 'text-red-500' : p.total > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                                          $ {Number(p.total).toLocaleString('es-AR')}
                                        </p>
                                        <p className="text-[8px] text-slate-400 uppercase font-bold">Saldo</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="border-amber-200 text-amber-600 hover:bg-amber-50 h-10 w-10 shrink-0"
                          onClick={() => setIsAddProveedorModalOpen(true)}
                          title="Nuevo Proveedor"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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



                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Observaciones / Datos de Envío (Dirección, Teléfono, etc.)</Label>
                  <Textarea value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Dirección, referencias, método de entrega, observaciones adicionales..." className="min-h-[80px]" />
                  {sujetoId && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-500">Para: <span className="font-semibold text-slate-700">{cliente}</span></span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSavingObsProveedor}
                        onClick={async () => {
                          setIsSavingObsProveedor(true);
                          const res = await actualizarObservacionesProveedor(sujetoId, info.trim());
                          setIsSavingObsProveedor(false);
                          if (!res.success) alert("No se pudieron guardar las observaciones.");
                        }}
                        className="h-7 text-xs px-3 border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        {isSavingObsProveedor ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                        Guardar en cliente
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4 mb-2">
                <Label className="text-xs font-bold text-slate-600 uppercase block mb-3 text-center">Acción Final</Label>
                <div className="flex flex-col gap-5">
                  {requiereFiscalizacionOpcional ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Button
                        onClick={() => handleFinalizarVenta(false, false)}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold w-full"
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-5 w-5 mr-2" /> Registrar sin fiscalizar</>}
                      </Button>
                      <Button
                        onClick={() => handleFinalizarVenta(false, true)}
                        disabled={isSubmitting}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white h-12 rounded-xl font-bold w-full"
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-5 w-5 mr-2" /> Registrar y fiscalizar</>}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleFinalizarVenta(false)}
                      disabled={isSubmitting}
                      className="bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold w-full"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-5 w-5 mr-2" /> Registrar venta</>}
                    </Button>
                  )}
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
            </div>
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
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">CUIT / DNI (Padrón A4)</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={editCuitBusqueda}
                          onChange={(e) => setEditCuitBusqueda(e.target.value)}
                          placeholder="CUIT o DNI..."
                          className="h-10 bg-slate-50 border-slate-200 pl-9"
                        />
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleBuscarPadronEdit}
                        disabled={isSearchingPadronEdit}
                        className="rounded-xl h-10 px-3 shrink-0 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100"
                        title="Buscar en Padrón AFIP"
                      >
                        {isSearchingPadronEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5 flex-grow min-w-[200px]">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Cliente / Razón Social</Label>
                    <Input value={editCliente} onChange={(e) => setEditCliente(e.target.value)} className="bg-slate-50 h-10" />
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

                {editDocNro && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-top-1 mb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <Label className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Datos Fiscales</Label>
                        <p className="text-sm font-black text-emerald-900">{editCliente}</p>
                        <p className="text-[10px] text-emerald-600 font-bold uppercase mt-1">
                          {editDocTipo === 80 ? 'CUIT' : 'DNI'}: <span className="text-emerald-900 font-black">{editDocNro}</span>
                        </p>
                      </div>
                      <Badge className={`${editCondicionIva === 1 ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        editCondicionIva === 6 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        } font-black text-[9px] border shadow-none`}>
                        {editCondicionIva === 1 ? 'RESP. INSCRIPTO' : editCondicionIva === 6 ? 'MONOTRIBUTISTA' : 'CONSUMIDOR FINAL'}
                      </Badge>
                    </div>
                  </div>
                )}

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
                          <OpcionesMetodoPago incluirAConfirmar={false} />
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
                          <OpcionesMetodoPago incluirAConfirmar={false} />
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
                        <OpcionesMetodoPago incluirAConfirmar={false} />
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

                {requiereMercadoLibreEdit && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 animate-in fade-in">
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Id Venta <span className="text-red-500">*</span></Label><Input value={editMlIdVenta} onChange={(e) => setEditMlIdVenta(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Id Envío <span className="text-red-500">*</span></Label><Input value={editMlIdEnvio} onChange={(e) => setEditMlIdEnvio(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">MLA <span className="text-red-500">*</span></Label><Input value={editMlMla} onChange={(e) => setEditMlMla(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Dni <span className="text-slate-400">(Opcional)</span></Label><Input value={editMlDni} onChange={(e) => setEditMlDni(e.target.value)} className="bg-white border-indigo-200" placeholder="DNI del cliente" /></div>
                  </div>
                )}

                {requiereMercadoPagoEdit && (
                  <div className="grid grid-cols-1 gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 animate-in fade-in">
                    <div className="space-y-2"><Label className="text-xs font-bold text-indigo-700">Id de pago <span className="text-red-500">*</span></Label><Input value={editMlIdVenta} onChange={(e) => setEditMlIdVenta(e.target.value)} className="bg-white border-indigo-200" placeholder="Obligatorio" /></div>
                  </div>
                )}

                {/* EDICIÓN MIXTO: Cruzada + Cuenta Corriente — dos secciones separadas */}
                {esMixtoCruzadaCCEdit && (
                  <div className="space-y-3 animate-in fade-in">
                    {/* Sección Cruzada */}
                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold text-amber-800 uppercase">Pago Cruzada</Label>
                        <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                          $ {(editMetodoPago === "Cruzada" ? editFinal1 : editFinal2).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-amber-700 uppercase">Quien Envía (De) <span className="text-red-500">*</span></Label>
                          <Input value={editDeCruzada} onChange={(e) => setEditDeCruzada(e.target.value)} className="bg-white border-amber-200 h-9 text-sm" placeholder="Nombre de quien envía..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-amber-700 uppercase">Proveedor (Para) <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <Input
                              value={editParaCruzada}
                              onChange={(e) => { setEditParaCruzada(e.target.value); setShowProvListEdit(true); }}
                              onFocus={() => setShowProvListEdit(true)}
                              className="bg-white border-amber-200 h-9 text-sm"
                              placeholder="Buscar proveedor..."
                            />
                            {showProvListEdit && proveedores.length > 0 && (
                              <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                {proveedores
                                  .filter(p => p.razonSocial.toLowerCase().includes(editParaCruzada.toLowerCase()) || p.cuit.includes(editParaCruzada))
                                  .map(p => (
                                    <div key={p.id} className="p-2 hover:bg-amber-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditParaCruzada(p.razonSocial); setShowProvListEdit(false); }}>
                                      <div className="flex justify-between items-start">
                                        <div><p className="font-bold text-slate-800">{p.razonSocial}</p><p className="text-[9px] text-slate-400">{p.cuit}</p></div>
                                        <p className={`text-xs font-bold ${p.total < 0 ? 'text-red-500' : p.total > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>{formatCurrency(p.total)}</p>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sección Cuenta Corriente */}
                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold text-emerald-800 uppercase">Cuenta Corriente</Label>
                        <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                          $ {(editMetodoPago === "A Cuenta Corriente" ? editFinal1 : editFinal2).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-emerald-700 uppercase">Proveedor / Cuenta <span className="text-red-500">*</span></Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={editParaCuentaCorriente}
                              onChange={(e) => { setEditParaCuentaCorriente(e.target.value); setShowProvListCCEdit(true); }}
                              onFocus={() => setShowProvListCCEdit(true)}
                              className="bg-white border-emerald-200 h-9 text-sm"
                              placeholder="Buscar proveedor..."
                            />
                            {showProvListCCEdit && proveedores.length > 0 && (
                              <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                {proveedores
                                  .filter(p => p.razonSocial.toLowerCase().includes(editParaCuentaCorriente.toLowerCase()) || p.cuit.includes(editParaCuentaCorriente))
                                  .map(p => (
                                    <div key={p.id} className="p-2 hover:bg-emerald-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditParaCuentaCorriente(p.razonSocial); setShowProvListCCEdit(false); }}>
                                      <div className="flex justify-between items-start">
                                        <div><p className="font-bold text-slate-800">{p.razonSocial}</p><p className="text-[9px] text-slate-400">{p.cuit}</p></div>
                                        <div className="text-right">
                                          <p className={`text-xs font-bold ${p.total < 0 ? 'text-red-500' : p.total > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>{formatCurrency(p.total)}</p>
                                          <p className="text-[8px] text-slate-400 uppercase font-bold">Saldo</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                          <Button type="button" size="icon" variant="outline"
                            className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 h-9 w-9 shrink-0"
                            onClick={() => setIsAddProveedorModalOpen(true)} title="Nuevo Proveedor">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cruzada simple o CC simple (sin el otro) */}
                {(requiereCruzadaEdit || requiereCuentaCorrienteEdit) && !esMixtoCruzadaCCEdit && (
                  <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200 animate-in fade-in">
                    {requiereCruzadaEdit && (
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-amber-800">De <span className="text-red-500">*</span></Label>
                        <Input value={editDeCruzada} onChange={(e) => setEditDeCruzada(e.target.value)} className="bg-white border-amber-200" placeholder="Origen" />
                      </div>
                    )}
                    <div className={`space-y-2 relative ${!requiereCruzadaEdit ? 'col-span-2' : ''}`}>
                      <Label className="text-xs font-bold text-amber-800">{requiereCuentaCorrienteEdit ? "Cuenta / Proveedor" : "Para"} <span className="text-red-500">*</span></Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={editParaCruzada}
                            onChange={(e) => { setEditParaCruzada(e.target.value); setShowProvListEdit(true); }}
                            onFocus={() => setShowProvListEdit(true)}
                            className="bg-white border-amber-200"
                            placeholder="Buscar proveedor..."
                          />
                          {showProvListEdit && proveedores.length > 0 && (
                            <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                              {proveedores
                                .filter(p => p.razonSocial.toLowerCase().includes(editParaCruzada.toLowerCase()) || p.cuit.includes(editParaCruzada))
                                .map(p => (
                                  <div
                                    key={p.id}
                                    className="p-2 hover:bg-amber-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditParaCruzada(p.razonSocial);
                                      setShowProvListEdit(false);
                                    }}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                        <p className="text-[10px] text-slate-400">{p.cuit}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className={`text-xs font-bold ${p.total < 0 ? 'text-red-500' : p.total > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                                          {formatCurrency(p.total)}
                                        </p>
                                        <p className="text-[8px] text-slate-400 uppercase font-bold">Saldo</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              <div
                                className="p-2 text-center text-xs text-indigo-600 font-bold hover:bg-indigo-50 cursor-pointer sticky bottom-0 bg-white border-t border-slate-100"
                                onClick={() => setShowProvListEdit(false)}
                              >
                                Cerrar lista
                              </div>
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="border-amber-200 text-amber-600 hover:bg-amber-50 h-10 w-10 shrink-0"
                          onClick={() => setIsAddProveedorModalOpen(true)}
                          title="Nuevo Proveedor"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
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

        {/* --- MODAL ALERTA ML --- */}
        <Dialog open={isAlertaMLOpen} onOpenChange={setIsAlertaMLOpen}>
          <DialogContent className="sm:max-w-[440px] rounded-3xl p-6 border-2 border-orange-300 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-orange-900">
                <BellRing className="h-5 w-5 text-orange-500" />
                Alerta de Reclamo ML
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-sm">
                Venta #{ventaParaAlerta?.numeroVenta} — Order: {ventaParaAlerta?.mlIdVenta}
                {ventaParaAlerta?.mlPackId && <span className="ml-2 text-yellow-600 font-medium">Pack: {ventaParaAlerta.mlPackId}</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div
                onClick={() => setAlertaActiva(!alertaActiva)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${alertaActiva ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
              >
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${alertaActiva ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                  {alertaActiva && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
                <div>
                  <p className={`text-sm font-bold ${alertaActiva ? 'text-orange-700' : 'text-slate-500'}`}>
                    {alertaActiva ? 'Alerta activa' : 'Sin alerta'}
                  </p>
                  <p className="text-[11px] text-slate-400">Activá para marcar esta venta como reclamada</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Observación</Label>
                <Textarea
                  value={alertaObservacion}
                  onChange={(e) => setAlertaObservacion(e.target.value)}
                  placeholder='Ej: "El comprador usó el producto antes de devolverlo"'
                  className="resize-none rounded-xl border-slate-200 text-sm min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsAlertaMLOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button
                onClick={guardarAlertaML}
                disabled={isGuardandoAlerta}
                className={`rounded-xl font-bold ${alertaActiva ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-600 hover:bg-slate-700'}`}
              >
                {isGuardandoAlerta ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- MODAL VISUALIZACIÓN DE FOTOS DE AUDITORÍA (Mercado Libre) --- */}
        <Dialog open={!!fotosVenta} onOpenChange={(open) => { if (!open) { setFotosVenta(null); setFotoExpandida(null); } }}>
          <DialogContent className="sm:max-w-[640px] rounded-3xl p-6 border-2 border-indigo-200 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
                <Camera className="h-5 w-5 text-indigo-500" />
                Fotos de Preparación
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-sm">
                Venta #{fotosVenta?.venta?.numeroVenta}{fotosVenta?.venta?.mlIdEnvio ? ` — Envío: ${fotosVenta.venta.mlIdEnvio}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              {fotosVenta && fotosVenta.fotos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                  {fotosVenta.fotos.map((foto: any, i: number) => (
                    <div
                      key={foto.id || i}
                      className="relative aspect-square bg-slate-50 border border-slate-200 rounded-xl overflow-hidden cursor-zoom-in group"
                      onClick={() => setFotoExpandida(foto.url)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        {i + 1}/{fotosVenta.fotos.length}
                        <Maximize2 className="h-3 w-3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 py-12 text-center">
                  <ImageOff className="h-12 w-12 mb-3 opacity-30" />
                  <p className="font-medium text-sm">No hay fotos cargadas para este envío</p>
                  <p className="text-xs text-slate-400 mt-1">No se registró ninguna foto en la preparación / auditoría.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setFotosVenta(null); setFotoExpandida(null); }} className="rounded-xl">Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Visor a pantalla completa de la foto seleccionada */}
        {fotoExpandida && (
          <div
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setFotoExpandida(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white z-50 bg-black/50 rounded-full p-1"
              onClick={(e) => { e.stopPropagation(); setFotoExpandida(null); }}
            >
              <X className="h-8 w-8" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoExpandida} alt="Foto ampliada" className="max-w-full max-h-full object-contain rounded shadow-2xl" />
          </div>
        )}

        {/* --- MODAL ALERTA PREVIA A ANULACIÓN --- */}
        <Dialog open={isAlertaAnulacionOpen} onOpenChange={setIsAlertaAnulacionOpen}>
          <DialogContent className="sm:max-w-[440px] rounded-3xl p-6 border-2 border-orange-400 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-orange-900">
                <BellRing className="h-5 w-5 text-orange-500" />
                Esta venta tiene una alerta de reclamo
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-sm">
                Venta #{ventaAEliminar?.numeroVenta} — {ventaAEliminar?.cliente}
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <div className="p-4 bg-orange-50 rounded-xl border border-orange-300 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-bold text-orange-800">Verificar el estado del reclamo antes de anular</p>
                  {ventaAEliminar?.mlObservacion && (
                    <p className="text-xs text-orange-700 italic">"{ventaAEliminar.mlObservacion}"</p>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => setIsAlertaAnulacionOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                onClick={() => { setIsAlertaAnulacionOpen(false); setIsEliminarModalOpen(true); }}
                className="rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white"
              >
                Entendido, continuar con la anulación
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE VENTA --- */}
        <Dialog open={isEliminarModalOpen} onOpenChange={setIsEliminarModalOpen}>
          <DialogContent className={`sm:max-w-[450px] rounded-3xl p-6 border-2 shadow-2xl ${ventaAEliminar?.cae && !ventaAEliminar?.info?.includes("ANULADA CON NC") ? 'border-rose-400' : 'border-red-400'}`}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-900">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                {ventaAEliminar?.cae && !ventaAEliminar?.info?.includes("ANULADA CON NC")
                  ? "Anular Venta con Nota de Crédito"
                  : "Confirmar Eliminación de Venta"}
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                {ventaAEliminar?.cae && !ventaAEliminar?.info?.includes("ANULADA CON NC")
                  ? "Esta venta tiene una factura ARCA. Se generará una Nota de Crédito y se revertirán todos los efectos."
                  : "Esta acción eliminará permanentemente la venta y todos sus datos relacionados."}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {ventaAEliminar?.cae && !ventaAEliminar?.info?.includes("ANULADA CON NC") ? (
                <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-grow">
                    <p className="text-sm font-bold text-rose-900 mb-1">Venta con Factura ARCA</p>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Se ejecutará el siguiente flujo:
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>Generación de <b>Nota de Crédito</b> en ARCA</li>
                        <li>Devolución de stock de todos los artículos</li>
                        <li>Reversión de cuenta corriente / cruzada si aplica</li>
                        <li>La venta quedará registrada como <b>CANCELADA</b></li>
                      </ul>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50/50 rounded-xl border border-red-200 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-grow">
                    <p className="text-sm font-bold text-red-900 mb-1">⚠️ ¡ATENCIÓN!</p>
                    <p className="text-xs text-red-700 leading-relaxed">
                      Esta acción es <b>irreversible</b>. Se ejecutará:
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>Devolución de stock de todos los artículos</li>
                        <li>Reversión de cuenta corriente / cruzada si aplica</li>
                        <li>Eliminación permanente del registro de venta</li>
                      </ul>
                    </p>
                  </div>
                </div>
              )}

              {/* Información de la venta a eliminar */}
              {ventaAEliminar && (
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Venta a {ventaAEliminar.cae && !ventaAEliminar.info?.includes("ANULADA CON NC") ? "Anular" : "Eliminar"}</p>
                  <p className="text-sm font-medium text-slate-900">{ventaAEliminar.cliente}</p>
                  <p className="text-xs text-slate-500 mt-1">ID: {ventaAEliminar.id}</p>
                  {ventaAEliminar.cae && (
                    <p className="text-xs text-blue-600 font-bold mt-1">CAE: {ventaAEliminar.cae}</p>
                  )}
                  <p className="text-sm font-bold text-slate-700 mt-2">Total: ${ventaAEliminar.totalFinal?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-500 mt-1">Fecha: {new Date(ventaAEliminar.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-3 mt-2">
              <Button variant="outline" onClick={() => setIsEliminarModalOpen(false)} disabled={isEliminando} className="border-slate-300 text-slate-700 hover:bg-slate-100">
                Cancelar
              </Button>
              <Button onClick={handleEliminarVenta} disabled={isEliminando} className={`text-white rounded-xl font-bold px-6 shadow-md ${ventaAEliminar?.cae && !ventaAEliminar?.info?.includes("ANULADA CON NC") ? 'bg-rose-600 hover:bg-rose-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {isEliminando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                ) : ventaAEliminar?.cae && !ventaAEliminar?.info?.includes("ANULADA CON NC") ? (
                  <><AlertTriangle className="h-4 w-4 mr-2" /> Anular con NC</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" /> Eliminar Venta</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- MODAL: REFACTURAR B → A (comprador pide Factura A) --- */}
        <Dialog open={!!ventaParaRefacturar} onOpenChange={(o) => { if (!o) cerrarModalRefacturar(); }}>
          <DialogContent className="sm:max-w-[480px] rounded-3xl p-6 border-2 border-violet-400 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-violet-900">
                <ArrowRightLeft className="h-5 w-5 text-violet-600" /> Refacturar como Factura A
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Se generará una <b>Nota de Crédito</b> de la Factura B y se emitirá una <b>Factura A</b> con el CUIT del comprador, por el mismo importe. No se modifica el stock ni el estado de la venta.
              </DialogDescription>
            </DialogHeader>

            {ventaParaRefacturar && (
              <div className="py-2 space-y-4">
                <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 flex flex-col gap-1">
                  <p className="text-[10px] text-violet-700 font-bold uppercase tracking-wider">Factura B a anular</p>
                  <p className="text-sm font-bold text-slate-900">
                    N° {(ventaParaRefacturar.facturaNumero || 0).toString().padStart(8, '0')} · PV {(ventaParaRefacturar.facturaPuntoVenta || 9).toString().padStart(4, '0')}
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    Total: ${Number(ventaParaRefacturar.totalFinal || ventaParaRefacturar.total).toLocaleString('es-AR')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">CUIT del comprador (Responsable Inscripto)</Label>
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      placeholder="30-12345678-9"
                      value={refacturarCuit}
                      onChange={(e) => { setRefacturarCuit(e.target.value); setRefacturarPadron(null); }}
                      className="font-mono h-11 border-violet-200 focus-visible:ring-violet-500"
                    />
                    <Button
                      type="button"
                      onClick={handleBuscarPadronRefacturar}
                      disabled={refacturarBuscando}
                      className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold px-4 shrink-0"
                    >
                      {refacturarBuscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {refacturarPadron && (
                  refacturarPadron.tipoFactura === 1 ? (
                    <div className="p-3 bg-green-50 rounded-xl border border-green-200 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black text-green-700 uppercase tracking-wide">Responsable Inscripto ✓</span>
                        <span className="text-sm font-bold text-slate-900">{refacturarPadron.nombre}</span>
                        {refacturarPadron.domicilio && <span className="text-xs text-slate-500">{refacturarPadron.domicilio}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black text-rose-700 uppercase tracking-wide">No es Responsable Inscripto</span>
                        <span className="text-sm font-bold text-slate-900">{refacturarPadron.nombre}</span>
                        <span className="text-xs text-rose-600">No corresponde emitir Factura A para este CUIT.</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={cerrarModalRefacturar} disabled={refacturarProcesando} className="border-slate-300 text-slate-700 hover:bg-slate-100">
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmarRefacturar}
                disabled={refacturarProcesando || !refacturarPadron || refacturarPadron.tipoFactura !== 1}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold px-6 shadow-md disabled:opacity-50"
              >
                {refacturarProcesando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                ) : (
                  <><ArrowRightLeft className="h-4 w-4 mr-2" /> Emitir Factura A</>
                )}
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

        {/* MODAL NUEVO PROVEEDOR RAPIDO */}
        <Dialog open={isAddProveedorModalOpen} onOpenChange={setIsAddProveedorModalOpen}>
          <DialogContent className="sm:max-w-[400px] rounded-3xl p-6 border-2 border-amber-100 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-900">
                <Plus className="h-5 w-5 text-amber-600" /> Nuevo Proveedor
              </DialogTitle>
              <DialogDescription>Crea un proveedor rápidamente para esta transferencia.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">CUIT / DNI *</Label>
                <div className="flex gap-2">
                  <Input value={newProvData.cuit} onChange={(e) => setNewProvData({ ...newProvData, cuit: e.target.value })} placeholder="20-XXXXXXXX-X" className="flex-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleBuscarPadronProv}
                    disabled={isSearchingPadron}
                    className="border-amber-200 text-amber-600 hover:bg-amber-50"
                  >
                    {isSearchingPadron ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Razón Social *</Label>
                <Input value={newProvData.razonSocial} onChange={(e) => setNewProvData({ ...newProvData, razonSocial: e.target.value })} placeholder="Nombre de la empresa" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsAddProveedorModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleCrearProveedorRapido} disabled={isCreatingProveedor} className="bg-amber-600 hover:bg-amber-700">
                {isCreatingProveedor ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar Proveedor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL DE CREACIÓN DE ARTÍCULO RÁPIDO */}
        <Dialog open={isCreateArticuloModalOpen} onOpenChange={setIsCreateArticuloModalOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-2 border-indigo-100 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
                <Plus className="h-5 w-5 text-indigo-600" /> Crear Nuevo Artículo
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
                    onChange={(e) => setNewArtData({ ...newArtData, stock: Number(e.target.value) })}
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción</Label>
                <Input
                  value={newArtData.nombre}
                  onChange={(e) => setNewArtData({ ...newArtData, nombre: e.target.value })}
                  className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
                  <Input
                    type="number"
                    value={newArtData.costo}
                    onChange={(e) => handleCostoArtChange(Number(e.target.value))}
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
                  <Input
                    type="number"
                    value={newArtData.margenGanancia}
                    onChange={(e) => handleMargenArtChange(Number(e.target.value))}
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <Label className="text-xs font-bold text-indigo-600 uppercase mb-2 block">Precio Final Resultante</Label>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-indigo-900">$</span>
                  <Input
                    type="number"
                    value={newArtData.precio}
                    onChange={(e) => setNewArtData({ ...newArtData, precio: Number(e.target.value) })}
                    className="font-black text-2xl bg-white border-indigo-200 text-indigo-700 focus-visible:ring-indigo-500 h-12"
                  />
                </div>
                <p className="text-[10px] text-indigo-400 mt-2 font-medium italic">* El valor se calcula automáticamente pero puede editarse manualmente.</p>
              </div>
            </div>



            <DialogFooter className="gap-3 mt-4">
              <Button variant="ghost" onClick={() => setIsCreateArticuloModalOpen(false)} className="text-slate-500 hover:text-slate-700">
                Cancelar
              </Button>
              <Button
                onClick={handleCrearNuevoArticulo}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 shadow-md"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Crear e Incluir
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

  if (!mounted || !ventaId) return null;

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
        <tbody>
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

function FacturaA4({ venta, config }: { venta: any, config?: any }) {
  if (!venta) return null;

  const logoUrl = transformDriveLink(config?.logoUrl) || "/logo-revolucion.png";

  const isNC = [3, 8, 13].includes(venta.tipoComprobante);
  const isTypeC = [11, 13].includes(venta.tipoComprobante);
  const tipoCbte = (venta.tipoComprobante === 1 || venta.tipoComprobante === 3) ? 'A' :
    (venta.tipoComprobante === 6 || venta.tipoComprobante === 8) ? 'B' : 'C';
  const codCbte = (venta.tipoComprobante || 6).toString().padStart(2, '0');
  const tituloComprobante = isNC ? "Nota de Crédito" : "Factura";

  const items = venta.items || [];
  const total = Number(venta.totalFinal || venta.total);
  const neto = isTypeC ? total : parseFloat((total / 1.21).toFixed(2));
  const iva = isTypeC ? 0 : parseFloat((total - neto).toFixed(2));
  // Para ventas ML los items almacenan el neto ML, no el bruto; escalar proporcionalmente
  const mlFactor = venta.mlIdVenta && Number(venta.total) > 0
    ? Number(venta.totalFinal) / Number(venta.total)
    : 1;

  const fechaFactura = new Date(venta.createdAt).toLocaleDateString('es-AR');
  const nroFactura = (venta.facturaNumero || 0).toString().padStart(8, '0');
  const ptoVenta = (venta.facturaPuntoVenta || 9).toString().padStart(4, '0');


  // Lógica de QR AFIP
  const generateQR = () => {
    try {
      const docTipo = Number(venta.docTipo || 99);
      const docNroRaw = (venta.docNro || "0").replace(/\D/g, '');
      const docNro = docTipo === 99 ? 0 : (Number(docNroRaw) || 0);

      const nroCmp = Number(venta.facturaNumero) || 0;
      const codAut = Number(venta.cae) || 0;

      const qrData = {
        ver: 1,
        fecha: new Date(venta.createdAt).toISOString().split('T')[0],
        cuit: 20269957361,
        ptoVta: Number(venta.facturaPuntoVenta || 9),
        tipoCmp: Number(venta.tipoComprobante || 6),
        nroCmp: nroCmp,
        importe: parseFloat(total.toFixed(2)),
        moneda: "PES",
        ctz: 1,
        tipoDocRec: docTipo,
        nroDocRec: docNro,
        tipoCodAut: "E",
        codAut: codAut
      };

      const jsonStr = JSON.stringify(qrData);
      const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
      return `https://quickchart.io/qr?text=${encodeURIComponent(`https://www.afip.gob.ar/fe/qr/?p=${base64}`)}&size=200`;
    } catch (e) {
      console.error("Error generando QR:", e);
      return "";
    }
  };

  const qrUrl = generateQR();

  return (
    <div className="w-[210mm] h-[297mm] bg-white text-black p-10 font-sans text-[11px] leading-normal flex flex-col">
      <style type="text/css" media="print">
        {`
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .border-black { border: 1px solid black !important; }
        `}
      </style>

      <div className="flex-grow">
        {/* HEADER CONTENEDOR */}
        <div className="border-black mb-0 flex relative min-h-[140px]">
          {/* LADO IZQUIERDO: EMISOR */}
          <div className="w-1/2 p-4 border-r border-black relative">
            <div className="flex flex-col items-center mb-2">
              {logoUrl && !logoUrl.includes('googleusercontent') ? (
                <img src={logoUrl} alt="Logo" className="h-12 mb-1" crossOrigin="anonymous" onError={(e) => e.currentTarget.style.display = 'none'} />
              ) : (
                <h1 className="text-sm font-bold">REVOLUCIÓN MOTOS</h1>
              )}
              <p className="text-[9px] text-center font-bold">de Oliva Peirone Jose Luis</p>
            </div>
            <div className="text-[9px]">
              <p>Revolución de Mayo 1605 - D° 5 - (5000) Córdoba</p>
              <p>Tel: 3512404003 | Email: revolucionmotos@gmail.com</p>
              <p className="font-bold">I.V.A. RESPONSABLE INSCRIPTO</p>
            </div>
          </div>

          {/* CENTRO: TIPO COMPROBANTE */}
          <div className="absolute left-1/2 -translate-x-1/2 top-8 w-12 h-14 bg-white border-black flex flex-col items-center justify-center z-10">
            <span className="text-2xl font-black">{tipoCbte}</span>
            <span className="text-[8px]">COD. {codCbte}</span>
          </div>

          {/* LADO DERECHO: DATOS FACTURA */}
          <div className="w-1/2 p-6 flex flex-col justify-center items-end">
            <div className="text-right">
              <h2 className="text-xl font-bold mb-1">{tituloComprobante}</h2>
              <p className="font-bold text-sm">N°: {ptoVenta}-{nroFactura}</p>
              <p className="font-bold text-sm">Fecha: {fechaFactura}</p>
            </div>
            <div className="mt-4 text-[10px] text-right space-y-0.5">
              <p><span className="font-bold">CUIT:</span> 20-26995736-1</p>
              <p><span className="font-bold">Ing. Brutos:</span> 280244775</p>
              <p><span className="font-bold">Inicio de Actividad:</span> 01/04/2010</p>
            </div>
          </div>
        </div>

        {/* DATOS DEL CLIENTE */}
        <div className="border-black border-t-0 p-3 grid grid-cols-2 gap-y-1">
          <p><span className="font-bold">Razón Social:</span> {venta.cliente && venta.cliente !== "0" ? venta.cliente : "Consumidor Final"}</p>
          <p><span className="font-bold">I.V.A.:</span> {venta.condicionIva === 1 ? 'Responsable Inscripto' : venta.condicionIva === 6 ? 'Monotributo' : 'Consumidor Final'}</p>
          <p><span className="font-bold">Domicilio:</span> {venta.domicilio || '-'}</p>
          <p><span className="font-bold">CUIT/DNI:</span> {(venta.docNro && venta.docNro !== "0") ? venta.docNro : '-'}</p>
          <p><span className="font-bold">Localidad:</span> {venta.localidad || 'Córdoba - CORDOBA CAPITAL'}</p>
          <p><span className="font-bold">Vendedor:</span> {venta.vendedor}</p>
        </div>

        {/* TABLA DE ARTÍCULOS */}
        <table className="w-full border-black border-t-0 border-collapse mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-black p-2 text-left w-16">Cantidad</th>
              <th className="border-black p-2 text-left">Descripción</th>
              <th className="border-black p-2 text-center w-16">% IVA</th>
              <th className="border-black p-2 text-right w-24">P. Unit.</th>
              <th className="border-black p-2 text-right w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => (
              <tr key={i}>
                <td className="border-black p-2 text-center">{item.cantidad} Un</td>
                <td className="border-black p-2">{item.nombre}</td>
                <td className="border-black p-2 text-center">{isTypeC ? '-' : '21,00'}</td>
                <td className="border-black p-2 text-right">{(Number(item.precio_unit) * mlFactor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="border-black p-2 text-right">{(Number(item.subtotal) * mlFactor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER DE TOTALES EN EL PIE */}
      <div className="flex justify-between items-end border-t border-black pt-4 mt-auto">
        {/* QR Y CAE */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <img src={qrUrl} alt="QR AFIP" className="w-24 h-24 border border-gray-200" crossOrigin="anonymous" onError={(e) => e.currentTarget.style.display = 'none'} />
            <div>
              <img
                src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgNDAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiIHJ4PSI0IiBmaWxsPSIjMDA1QzlCIi8+PHRleHQgeD0iMTAiIHk9IjI4IiBmaWxsPSIjRkZGIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmb250LXNpemU9IjIwIj5BRklQPC90ZXh0Pjwvc3ZnPg=="
                alt="AFIP"
                className="h-7 mb-1"
              />
              <p className="font-bold text-[10px] leading-tight">Comprobante Autorizado</p>
              <p><span className="font-bold">C.A.E. N°:</span> {venta.cae}</p>
              <p><span className="font-bold">Vto. C.A.E.:</span> {venta.vencimientoCae ? new Date(venta.vencimientoCae).toLocaleDateString('es-AR') : '-'}</p>
            </div>
          </div>
        </div>

        {/* TABLA DE TOTALES */}
        <div className="w-1/3 border-black p-0">
          {!isTypeC && (
            <>
              <div className="flex justify-between border-b border-black p-1 px-2">
                <span className="font-bold uppercase">Subtotal:</span>
                <span>$ {neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-b border-black p-1 px-2">
                <span className="font-bold uppercase">IVA 21%:</span>
                <span>$ {iva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            </>
          )}
          <div className="flex justify-between bg-gray-100 p-2 px-2 text-sm">
            <span className="font-bold uppercase">Total:</span>
            <span className="font-black">$ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// COMPONENTE PARA EL FORMATO A4 DEL PEDIDO (SIMILAR A LA FACTURA)
function PedidoVentaA4({ venta }: { venta: any }) {
  const items = venta.items || [];
  const total = Number(venta.totalFinal || venta.total || 0);

  // Datos estáticos o calculados
  const fechaFactura = new Date(venta.createdAt).toLocaleDateString('es-AR');
  const nroPedido = (venta.numeroVenta || venta.id.slice(0, 8)).toString().padStart(8, '0');

  return (
    <div className="w-[210mm] h-[297mm] bg-white text-black p-10 font-sans text-[11px] leading-normal flex flex-col">
      <style type="text/css" media="print">
        {`
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .border-black { border: 1px solid black !important; }
        `}
      </style>

      <div className="flex-grow">
        {/* HEADER CONTENEDOR */}
        <div className="border-black mb-0 flex relative min-h-[140px]">
          {/* LADO IZQUIERDO: EMISOR */}
          <div className="w-1/2 p-4 border-r border-black relative">
            <div className="flex flex-col items-center mb-2">
              <h1 className="text-sm font-bold">REVOLUCIÓN MOTOS</h1>
              <p className="text-[9px] text-center font-bold">de Oliva Peirone Jose Luis</p>
            </div>
            <div className="text-[9px]">
              <p>Revolución de Mayo 1605 - D° 5 - (5000) Córdoba</p>
              <p>Tel: 3512404003 | Email: revolucionmotos@gmail.com</p>
              <p className="font-bold">I.V.A. RESPONSABLE INSCRIPTO</p>
            </div>
          </div>

          {/* CENTRO: TIPO COMPROBANTE (X para pedidos) */}
          <div className="absolute left-1/2 -translate-x-1/2 top-8 w-12 h-14 bg-white border-black flex flex-col items-center justify-center z-10">
            <span className="text-2xl font-black">X</span>
            <span className="text-[8px]">PEDIDO</span>
          </div>

          {/* LADO DERECHO: DATOS COMPROBANTE */}
          <div className="w-1/2 p-6 flex flex-col justify-center items-end">
            <div className="text-right">
              <h2 className="text-xl font-bold mb-1 uppercase text-blue-700">Resumen de Venta</h2>
              <p className="font-bold text-sm">N°: 0001-{nroPedido}</p>
              <p className="font-bold text-sm">Fecha: {fechaFactura}</p>
            </div>
            <div className="mt-4 text-[10px] text-right space-y-0.5">
              <p><span className="font-bold">CUIT:</span> 20-26995736-1</p>
              <p><span className="font-bold">Ing. Brutos:</span> 280244775</p>
              <p><span className="font-bold">Inicio de Actividad:</span> 01/04/2010</p>
            </div>
          </div>
        </div>

        {/* DATOS DEL CLIENTE */}
        <div className="border-black border-t-0 p-3 grid grid-cols-2 gap-y-1">
          <p><span className="font-bold">Razón Social:</span> {venta.cliente && venta.cliente !== "0" ? venta.cliente : "Consumidor Final"}</p>
          <p><span className="font-bold">I.V.A.:</span> Consumidor Final</p>
          <p><span className="font-bold">CUIT/DNI:</span> {(venta.dni || venta.docNro) && (venta.dni !== "0" && venta.docNro !== "0") ? (venta.dni || venta.docNro) : '-'}</p>
          <p><span className="font-bold">Vendedor:</span> {venta.vendedor}</p>
          <p className="col-span-2"><span className="font-bold">Obs:</span> {venta.info || '-'}</p>
        </div>

        {/* TABLA DE ARTÍCULOS */}
        <table className="w-full border-black border-t-0 border-collapse mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-black p-2 text-left w-16">Cantidad</th>
              <th className="border-black p-2 text-left">Descripción</th>
              <th className="border-black p-2 text-right w-24">P. Unit.</th>
              <th className="border-black p-2 text-right w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => (
              <tr key={i}>
                <td className="border-black p-2 text-center">{item.cantidad} Un</td>
                <td className="border-black p-2">{item.nombre}</td>
                <td className="border-black p-2 text-right">{(Number(item.precio_unit)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td className="border-black p-2 text-right">{(Number(item.subtotal)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER DE TOTALES EN EL PIE */}
      <div className="flex justify-between items-end border-t border-black pt-4 mt-auto">
        <div className="flex flex-col gap-2">
          <div className="p-4 border border-dashed border-gray-300 rounded-lg">
            <p className="text-[10px] text-gray-500 italic">Documento no válido como factura.</p>
            <p className="text-[10px] text-gray-500 italic">Reserva de mercadería sujeta a confirmación.</p>
          </div>
        </div>

        {/* TABLA DE TOTALES */}
        <div className="w-1/3 border-black p-0">
          <div className="flex justify-between bg-blue-50 p-2 px-2 text-sm border border-blue-200">
            <span className="font-bold uppercase text-blue-900">Total:</span>
            <span className="font-black text-blue-900">$ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
