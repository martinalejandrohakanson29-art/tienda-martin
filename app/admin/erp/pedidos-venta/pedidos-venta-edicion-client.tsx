"use client";

import React, { useEffect, useState, useMemo } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Loader2,
  Trash2,
  Edit,
  RefreshCcw,
  ChevronDown,
  Eye,
  Upload,
  Download,
  File,
  FileText,
  FileX,
  ArrowLeft,
  Printer,
  Plus,
  Search,
  X,
  Minus,
  Copy,
  User,
  CreditCard,
  Percent,
  Save,
} from "lucide-react";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosVenta,
  confirmarPedidoVenta,
  eliminarPedidoVenta,
  actualizarEstadoPedido,
  obtenerPedidoPorId,
  actualizarPedidoVenta,
  subirPDFPedido,
  obtenerURLDescargaPDF,
  subirPDFLote,
  eliminarPDFPedido,
  actualizarTipoEnvioPedido,
  obtenerTodosLosArticulos,
} from "@/app/actions/ventas-mostrador";
import { obtenerProveedores, crearProveedor } from "@/app/actions/listas";
import { consultarPadron } from "@/app/actions/afip";
import PDFPreview from "./pdf-preview";

type ItemVenta = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  esNota?: boolean;
};

type Venta = {
  id: string;
  cliente: string;
  vendedor: string;
  total: number;
  interes: number;
  totalFinal: number;
  metodo_pago: string;
  createdAt: string;
  tipoVenta: string;
  items: ItemVenta[];
  dni?: string | null;
  telefono?: string | null;
  info?: string | null;
  cupon?: string | null;
  transaccionId?: string | null;
  de?: string | null;
  para?: string | null;
  email?: string | null;
  eventoOffline?: boolean;
  puntoVentaId?: string | null;
  estadoPedido?: string | null;
  pdfUrl?: string | null;
  numeroVenta?: number;
  mlIdVenta?: string | null;
  mlIdEnvio?: string | null;
  mlMla?: string | null;
  mlDni?: string | null;
  tipoEnvio?: string;
};

export default function PedidosVentaEdicionClient() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split("T")[0]);
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isEliminarDialogOpen, setIsEliminarDialogOpen] = useState(false);
  const [ventaParaEliminar, setVentaParaEliminar] = useState<Venta | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [ventaParaPDF, setVentaParaPDF] = useState<Venta | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [ventaParaEditar, setVentaParaEditar] = useState<Venta | null>(null);
  const [editingVenta, setEditingVenta] = useState<Venta | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [selectedVentaIds, setSelectedVentaIds] = useState<Set<string>>(new Set());
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingEliminarPDF, setPendingEliminarPDF] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [ventaParaFactura, setVentaParaFactura] = useState<Venta | null>(null);
  const facturaRef = React.useRef<HTMLDivElement>(null);

  // Estados para búsqueda de artículos
  const [articulos, setArticulos] = useState<any[]>([]);
  const [busquedaArticulo, setBusquedaArticulo] = useState("");
  const [showNotaInputEdit, setShowNotaInputEdit] = useState(false);
  const [notaTextoEdit, setNotaTextoEdit] = useState("");

  // Estados para búsqueda de proveedores
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [resultadosProveedores, setResultadosProveedores] = useState<any[]>([]);

  // Estados para pago mixto
  const [metodo1, setMetodo1] = useState("Efectivo");
  const [monto1, setMonto1] = useState(0);
  const [metodo2, setMetodo2] = useState("Tarjeta de Crédito");
  const [monto2, setMonto2] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados para búsqueda en Padrón ARCA
  const [isSearchingPadron, setIsSearchingPadron] = useState(false);

  // Estados para buscador unificado de cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any | null>(null);
  const [resultadosCliente, setResultadosCliente] = useState<any[]>([]);
  const [padronResultado, setPadronResultado] = useState<{ nombre: string; cuit: string } | null>(null);
  const [isCreatingFromPadron, setIsCreatingFromPadron] = useState(false);

  // Estados para creación rápida de proveedor
  const [isAddProvModalOpen, setIsAddProvModalOpen] = useState(false);
  const [isCreatingProv, setIsCreatingProv] = useState(false);
  const [newProvData, setNewProvData] = useState({
    razonSocial: "",
    cuit: "",
    nombreFantasia: "",
    email: "",
    telefono: ""
  });

  const handleCopyInfo = (id: string, info: string) => {
    navigator.clipboard.writeText(info);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Cargar artículos y proveedores al inicio
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const arts = await obtenerTodosLosArticulos();
        setArticulos(arts);

        const provs = await obtenerProveedores();
        if (provs && provs.success && 'data' in provs) {
          setProveedores(provs.data as any[]);
        }
      } catch (error) {
        console.error("Error al cargar datos iniciales:", error);
      }
    };
    cargarDatos();
  }, []);

  const resultadosBusqueda = useMemo(() => {
    if (busquedaArticulo.trim().length < 2) return [];
    const queryWords = busquedaArticulo.toLowerCase().trim().split(/\s+/);
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
  }, [busquedaArticulo, articulos]);

  // Filtrar proveedores según búsqueda
  useEffect(() => {
    if (busquedaProveedor.length > 1) {
      const query = busquedaProveedor.toLowerCase();
      const filtrados = proveedores.filter(p =>
        p.razonSocial.toLowerCase().includes(query) ||
        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(query)) ||
        (p.cuit && p.cuit.includes(query))
      ).slice(0, 10);
      setResultadosProveedores(filtrados);
    } else {
      setResultadosProveedores([]);
    }
  }, [busquedaProveedor, proveedores]);

  // Inicializar cliente seleccionado al abrir el diálogo de edición
  useEffect(() => {
    if (!editingVenta) {
      setClienteSeleccionado(null);
      setBusquedaCliente("");
      setPadronResultado(null);
      return;
    }
    if (editingVenta.dni && proveedores.length > 0) {
      const cleanDni = editingVenta.dni.replace(/\D/g, '');
      const match = proveedores.find(p => p.cuit && p.cuit.replace(/\D/g, '') === cleanDni);
      if (match) setClienteSeleccionado(match);
    }
  }, [editingVenta?.id]);

  // Filtrar proveedores para el buscador de cliente
  useEffect(() => {
    if (busquedaCliente.length > 1) {
      const query = busquedaCliente.toLowerCase();
      const filtrados = proveedores.filter(p =>
        p.razonSocial.toLowerCase().includes(query) ||
        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(query)) ||
        (p.cuit && p.cuit.includes(query))
      ).slice(0, 8);
      setResultadosCliente(filtrados);
    } else {
      setResultadosCliente([]);
    }
    setPadronResultado(null);
  }, [busquedaCliente, proveedores]);

  // Auto-poblar "para" si cambia el método a CC y ya hay cliente seleccionado
  useEffect(() => {
    if (!editingVenta || !clienteSeleccionado) return;
    if (editingVenta.metodo_pago === "A Cuenta Corriente" && !editingVenta.para) {
      setEditingVenta(prev => prev ? { ...prev, para: clienteSeleccionado.razonSocial } : null);
      setBusquedaProveedor(clienteSeleccionado.razonSocial);
    }
  }, [editingVenta?.metodo_pago]);

  const handleSeleccionarCliente = (prov: any) => {
    setClienteSeleccionado(prov);
    setBusquedaCliente("");
    setResultadosCliente([]);
    setPadronResultado(null);
    if (!editingVenta) return;
    const updates: Partial<Venta> = {
      cliente: prov.razonSocial,
      dni: prov.cuit || "",
    };
    if (editingVenta.metodo_pago === "A Cuenta Corriente") {
      updates.para = prov.razonSocial;
      setBusquedaProveedor(prov.razonSocial);
    }
    setEditingVenta({ ...editingVenta, ...updates });
  };

  const handleBuscarEnPadron = async () => {
    const clean = busquedaCliente.replace(/\D/g, '');
    if (!clean || clean.length < 7) return;
    setIsSearchingPadron(true);
    setPadronResultado(null);
    try {
      const res = await consultarPadron(clean);
      if (res.success) {
        setPadronResultado({ nombre: res.nombre || "Sin Nombre", cuit: res.cuit || clean });
      } else {
        alert(res.error || "No se encontraron datos en el padrón");
      }
    } catch {
      alert("Error al consultar el padrón ARCA");
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleCrearDesdePadron = async () => {
    if (!padronResultado || !editingVenta) return;
    setIsCreatingFromPadron(true);
    try {
      const res = await crearProveedor({ razonSocial: padronResultado.nombre, cuit: padronResultado.cuit });
      if (res.success && res.data) {
        const nuevo = res.data as any;
        setProveedores(prev => [nuevo, ...prev]);
        handleSeleccionarCliente(nuevo);
      } else {
        alert("Error al crear proveedor: " + (res.error || "Error desconocido"));
      }
    } catch {
      alert("Error al conectar con el servidor");
    } finally {
      setIsCreatingFromPadron(false);
    }
  };

  const handleLimpiarCliente = () => {
    setClienteSeleccionado(null);
    setBusquedaCliente("");
    setPadronResultado(null);
    if (!editingVenta) return;
    setEditingVenta({ ...editingVenta, cliente: "Consumidor Final", dni: "" });
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
      } else {
        alert(res.error || "No se encontró el CUIT");
      }
    } catch (e) {
      alert("Error al consultar padrón");
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleCrearProveedorRapido = async () => {
    if (!newProvData.razonSocial || !newProvData.cuit) {
      alert("Razón Social y CUIT son obligatorios");
      return;
    }
    setIsCreatingProv(true);
    try {
      const res = await crearProveedor(newProvData);
      if (res.success && res.data && editingVenta) {
        const nuevo = res.data as any;
        setProveedores(prev => [nuevo, ...prev]);
        setEditingVenta({ ...editingVenta, para: nuevo.razonSocial });
        setIsAddProvModalOpen(false);
        setNewProvData({ razonSocial: "", cuit: "", nombreFantasia: "", email: "", telefono: "" });
      } else {
        alert("Error al crear proveedor: " + (res.error || "Error desconocido"));
      }
    } catch (error) {
      alert("Error al conectar con el servidor");
    } finally {
      setIsCreatingProv(false);
    }
  };

  // Efecto para sincronizar campos mixtos cuando se selecciona Mixto o cambia el total
  useEffect(() => {
    if (editingVenta?.metodo_pago === "Mixto") {
      const info = editingVenta.info || "";
      try {
        // Intentar parsear como JSON
        if (info.trim().startsWith('{')) {
          const infoObj = JSON.parse(info);
          setMetodo1(infoObj.metodo1 || "Efectivo");
          setMonto1(Number(infoObj.monto1) || editingVenta.totalFinal / 2);
          setMetodo2(infoObj.metodo2 || "Tarjeta de Crédito");
          setMonto2(editingVenta.totalFinal - (Number(infoObj.monto1) || editingVenta.totalFinal / 2));
        } else {
          // Intentar parsear formato brackets: [Mixto -> Metodo1: $1.000 | Metodo2: $2.000]
          const extractMonto = (label: string) => {
            const regex = new RegExp(`${label}:\\s*\\$?([0-9.,]+)`, "i");
            const match = info.match(regex);
            if (match && match[1]) {
              let valStr = match[1];
              // Lógica segura para es-AR
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
            if (info.includes(`${m}:`)) {
              foundMethods.push(m);
            }
          }

          if (foundMethods.length >= 1) m1 = foundMethods[0];
          if (foundMethods.length >= 2) m2 = foundMethods[1];

          const v1 = extractMonto(m1);
          setMetodo1(m1);
          setMonto1(v1 || editingVenta.totalFinal / 2);
          setMetodo2(m2);
          setMonto2(editingVenta.totalFinal - (v1 || editingVenta.totalFinal / 2));
        }
      } catch (e) {
        console.error("Error al parsear info mixta:", e);
        setMetodo1("Efectivo");
        setMonto1(editingVenta.totalFinal / 2);
        setMetodo2("Tarjeta de Crédito");
        setMonto2(editingVenta.totalFinal / 2);
      }
    }
  }, [editingVenta?.metodo_pago, editingVenta?.id]);

  // Efecto para recalcular monto2 cuando cambia monto1 o totalFinal
  useEffect(() => {
    if (editingVenta?.metodo_pago === "Mixto") {
      setMonto2(editingVenta.totalFinal - monto1);
    }
  }, [monto1, editingVenta?.totalFinal]);

  // Efecto para actualizar info en editingVenta cuando cambian los campos mixtos
  useEffect(() => {
    if (editingVenta?.metodo_pago === "Mixto") {
      const nuevoInfo = JSON.stringify({
        metodo1,
        monto1,
        metodo2,
        monto2: editingVenta.totalFinal - monto1
      });
      if (editingVenta.info !== nuevoInfo) {
        setEditingVenta(prev => prev ? { ...prev, info: nuevoInfo } : null);
      }
    }
  }, [metodo1, monto1, metodo2, editingVenta?.totalFinal]);

  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidosVenta(fechaDesde, fechaHasta, filtroEstado ? filtroEstado.toUpperCase() : undefined);
      setVentas(data);
    } catch (err) {
      console.error("Error al cargar pedidos:", err);
      setError("No se pudieron cargar los pedidos de venta");
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmarPedido = (venta: Venta) => {
    setVentaSeleccionada(venta);
    setIsConfirmDialogOpen(true);
  };

  const handleEliminarPedido = (venta: Venta) => {
    setVentaParaEliminar(venta);
    setIsEliminarDialogOpen(true);
  };

  const handleVerPDF = async (venta: Venta) => {
    setVentaParaFactura(venta);
    setIsGeneratingPDF(true);

    // Aumentamos el tiempo para permitir el renderizado
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

          const blob = pdf.output("blob");
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
        } catch (error) {
          console.error("Error al generar PDF:", error);
          alert("No se pudo generar el PDF del pedido.");
        } finally {
          setIsGeneratingPDF(false);
        }
      }
    }, 1500);
  };

  const handleEditarPedido = async (venta: Venta) => {
    setVentaParaEditar(venta);
    setIsEditDialogOpen(true);
    setIsProcessing(true);
    try {
      const ventaData = await obtenerPedidoPorId(venta.id);
      if (ventaData) {
        setEditingVenta(ventaData);
      }
    } catch (err) {
      console.error("Error al cargar venta para editar:", err);
      alert("Error al cargar los datos del pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Helpers para gestión de items ---
  const recalcularTotales = (items: ItemVenta[], interes: number = 0) => {
    const subtotal = items.filter(i => !i.esNota).reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precio_unit)), 0);
    const totalFinal = subtotal + interes;
    return { total: subtotal, totalFinal };
  };

  const agregarArticulo = (articulo: any) => {
    if (!editingVenta) return;

    const existingItem = editingVenta.items.find(i => i.productoId === articulo.id);
    let newItems;

    if (existingItem) {
      newItems = editingVenta.items.map(i =>
        i.productoId === articulo.id
          ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unit }
          : i
      );
    } else {
      newItems = [
        ...editingVenta.items,
        {
          productoId: articulo.id,
          nombre: articulo.nombre,
          cantidad: 1,
          precio_unit: articulo.precio,
          subtotal: articulo.precio
        }
      ];
    }

    const { total, totalFinal } = recalcularTotales(newItems, editingVenta.interes || 0);
    setEditingVenta({ ...editingVenta, items: newItems, total, totalFinal });
    setBusquedaArticulo("");
  };

  const eliminarArticulo = (index: number) => {
    if (!editingVenta) return;
    const newItems = [...editingVenta.items];
    newItems.splice(index, 1);
    const { total, totalFinal } = recalcularTotales(newItems, editingVenta.interes || 0);
    setEditingVenta({ ...editingVenta, items: newItems, total, totalFinal });
  };

  const actualizarItem = (index: number, field: string, value: any) => {
    if (!editingVenta) return;
    const newItems = [...editingVenta.items];
    const item = { ...newItems[index], [field]: value };

    if (field === 'cantidad' || field === 'precio_unit') {
      item.subtotal = Number(item.cantidad) * Number(item.precio_unit);
    }

    newItems[index] = item;
    const { total, totalFinal } = recalcularTotales(newItems, editingVenta.interes || 0);
    setEditingVenta({ ...editingVenta, items: newItems, total, totalFinal });
  };

  const handleInteresChange = (val: number) => {
    if (!editingVenta) return;
    const { totalFinal } = recalcularTotales(editingVenta.items, val);
    setEditingVenta({ ...editingVenta, interes: val, totalFinal });
  };

  const confirmarEdicion = async () => {
    if (!editingVenta || !ventaParaEditar) return;

    // Validar campos según método de pago
    if (editingVenta.metodo_pago === "Cruzada") {
      if (!editingVenta.de || !editingVenta.para) {
        alert("Los campos 'De' y 'Para' son obligatorios para ventas cruzadas. Debes buscar y seleccionar un proveedor.");
        return;
      }
    }

    if (editingVenta.metodo_pago === "A Cuenta Corriente") {
      if (!editingVenta.para) {
        alert("Debes buscar y seleccionar un proveedor para ventas a Cuenta Corriente.");
        return;
      }
    }

    if (editingVenta.metodo_pago === "Mixto") {
      const requiereProv =
        metodo1 === "Cruzada" || metodo1 === "A Cuenta Corriente" ||
        metodo2 === "Cruzada" || metodo2 === "A Cuenta Corriente";

      if (requiereProv && !editingVenta.para) {
        alert("Uno de los métodos de pago requiere seleccionar un proveedor para el impacto en Cuenta Corriente.");
        return;
      }
    }

    let infoParaEnviar = editingVenta.info;
    if (editingVenta.metodo_pago === "Mixto") {
      infoParaEnviar = JSON.stringify({
        metodo1,
        monto1,
        metodo2,
        monto2: editingVenta.totalFinal - monto1
      });
    }

    try {
      setIsProcessing(true);
      const usuario = "Admin"; // TODO: Obtener usuario actual
      const detalleCambios = "Pedido editado desde la pestaña de Edición y Registro";
      const result = await actualizarPedidoVenta(
        ventaParaEditar.id,
        {
          ...editingVenta,
          info: infoParaEnviar,
          items: editingVenta.items.map(item => ({
            productoId: item.productoId,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio_unit: item.precio_unit,
            subtotal: item.subtotal
          }))
        },
        usuario,
        detalleCambios
      );

      if (result.success) {
        setEditingVenta(null);
        setVentaParaEditar(null);
        setIsEditDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al actualizar el pedido");
      }
    } catch (err) {
      console.error("Error al confirmar edición:", err);
      alert("Error al actualizar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmarPedido = async () => {
    if (!ventaSeleccionada) return;

    try {
      setIsProcessing(true);
      await confirmarPedidoVenta(ventaSeleccionada.id);
      setVentaSeleccionada(null);
      setIsConfirmDialogOpen(false);
      cargarPedidos();
    } catch (err) {
      console.error("Error al confirmar pedido:", err);
      alert("Error al confirmar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const eliminarPedido = async () => {
    if (!ventaParaEliminar) return;

    try {
      setIsProcessing(true);
      await eliminarPedidoVenta(ventaParaEliminar.id);
      setVentaParaEliminar(null);
      setIsEliminarDialogOpen(false);
      cargarPedidos();
    } catch (err) {
      console.error("Error al eliminar pedido:", err);
      alert("Error al eliminar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarEstado = async (ventaId: string, nuevoEstado: string) => {
    setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, estadoPedido: nuevoEstado } : v));
    setProcessingIds(prev => new Set(Array.from(prev).concat(ventaId)));
    try {
      await actualizarEstadoPedido(ventaId, nuevoEstado);
      await cargarPedidos();
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado. Intente nuevamente.");
      await cargarPedidos();
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(ventaId); return next; });
    }
  };

  const handleActualizarTipoEnvio = async (ventaId: string, nuevoTipo: string) => {
    setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, tipoEnvio: nuevoTipo } : v));
    setProcessingIds(prev => new Set(Array.from(prev).concat(ventaId)));
    try {
      await actualizarTipoEnvioPedido(ventaId, nuevoTipo);
      await cargarPedidos();
    } catch (err) {
      console.error("Error al actualizar tipo de envío:", err);
      alert("Error al actualizar el tipo de envío. Intente nuevamente.");
      await cargarPedidos();
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(ventaId); return next; });
    }
  };

  const handleUploadPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !editingVenta) return;

    const file = e.target.files[0];
    if (file.type !== "application/pdf") {
      alert("Solo se permiten archivos PDF");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const result = await subirPDFPedido(editingVenta.id, formData);

      if (result.success) {
        setEditingVenta({ ...editingVenta, pdfUrl: result.url });
        alert("PDF subido correctamente");
        cargarPedidos();
      } else {
        alert(result.error || "Error al subir el PDF");
      }
    } catch (err) {
      console.error("Error al subir PDF:", err);
      alert("Error al procesar la subida del archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedVentaIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedVentaIds(newSelected);
  };

  const handleToggleSelectAll = () => {
    if (selectedVentaIds.size === ventasFiltradas.length && ventasFiltradas.length > 0) {
      setSelectedVentaIds(new Set());
    } else {
      setSelectedVentaIds(new Set(ventasFiltradas.map(v => v.id)));
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || selectedVentaIds.size === 0) return;

    const file = e.target.files[0];
    if (file.type !== "application/pdf") {
      alert("Solo se permiten archivos PDF");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const result = await subirPDFLote(Array.from(selectedVentaIds), formData);

      if (result.success) {
        alert(`PDF subido correctamente a ${selectedVentaIds.size} pedidos`);
        setSelectedVentaIds(new Set());
        setIsBatchDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al subir el PDF por lotes");
      }
    } catch (err) {
      console.error("Error al subir PDF por lotes:", err);
      alert("Error al procesar la subida por lotes");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEliminarPDF = (ventaId: string) => {
    setPendingEliminarPDF(ventaId);
  };

  const handleEliminarPDFConfirm = async () => {
    if (!pendingEliminarPDF) return;
    const ventaId = pendingEliminarPDF;
    setPendingEliminarPDF(null);
    try {
      setIsProcessing(true);
      const result = await eliminarPDFPedido(ventaId);
      if (result.success) {
        alert("PDF eliminado correctamente");
        cargarPedidos();
      } else {
        alert(result.error || "Error al eliminar el PDF");
      }
    } catch (err) {
      console.error("Error al eliminar PDF:", err);
      alert("Error al procesar la eliminación");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPDF = async (ventaId: string) => {
    try {
      setIsProcessing(true);
      const result = await obtenerURLDescargaPDF(ventaId);
      if (result.success && result.url) {
        window.open(result.url, '_blank');
      } else {
        alert(result.error || "Error al obtener el enlace de descarga");
      }
    } catch (err) {
      console.error("Error al descargar PDF:", err);
      alert("Error al procesar la descarga");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = (venta: Venta) => {
    window.print();
  };

  const ventasFiltradas = useMemo(() => {
    if (!filtroEstado) return ventas;
    return ventas.filter(v => v.estadoPedido === filtroEstado);
  }, [ventas, filtroEstado]);

  const ventasPorVendedor = useMemo(() => {
    const ventasPorVendedorMap = new Map<string, { total: number; count: number }>();
    ventas.forEach((venta) => {
      const vendedor = venta.vendedor;
      if (!ventasPorVendedorMap.has(vendedor)) {
        ventasPorVendedorMap.set(vendedor, { total: 0, count: 0 });
      }
      const vendedorData = ventasPorVendedorMap.get(vendedor)!;
      vendedorData.total += venta.totalFinal;
      vendedorData.count += 1;
    });
    return Array.from(ventasPorVendedorMap.entries())
      .map(([vendedor, data]) => ({ vendedor, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [ventas]);

  useEffect(() => {
    cargarPedidos();
  }, [fechaDesde, fechaHasta]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/admin/erp"
              className="flex items-center gap-2 p-2 h-auto text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
              title="Volver al ERP"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Atrás</span>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-600" />
            Edición y Registro de Pedidos
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión completa de pedidos de venta: editar, registrar y eliminar
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Fecha Desde
              </Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="border-slate-300"
              />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Fecha Hasta
              </Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="border-slate-300"
              />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Filtrar por Estado
              </Label>
              <select
                value={filtroEstado === "" ? "" : filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value === "TODOS" ? "" : e.target.value.toUpperCase())}
                className="w-full border-slate-300 rounded-lg px-3 py-2"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="LISTO_PARA_PREPARAR">Listo p/ Preparar</option>
                <option value="IMPRESO">Impreso</option>
                <option value="PREPARADO">Preparado</option>
                <option value="DESPACHADO">Despachado</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={cargarPedidos}
                disabled={cargando}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6"
              >
                {cargando ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Filtrar
                  </>
                )}
              </Button>
              {selectedVentaIds.size > 0 && (
                <Button
                  onClick={() => setIsBatchDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white animate-in fade-in slide-in-from-bottom-2"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Subir PDF Lote ({selectedVentaIds.size})
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">Total Pedidos</p>
            <p className="text-2xl font-bold text-slate-900">{ventas.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">Pendientes</p>
            <p className="text-2xl font-bold text-amber-600">
              {ventas.filter(v => v.estadoPedido === 'PENDIENTE').length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">Preparados</p>
            <p className="text-2xl font-bold text-blue-600">
              {ventas.filter(v => v.estadoPedido === 'PREPARADO').length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">Registrados</p>
            <p className="text-2xl font-bold text-green-600">
              {ventas.filter(v => v.estadoPedido === 'DESPACHADO').length}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : ventasFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">
                No hay pedidos de venta en este período
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 border-b-2 border-slate-200">
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedVentaIds.size === ventasFiltradas.length && ventasFiltradas.length > 0}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </TableHead>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead className="text-right">Total Final</TableHead>
                  <TableHead className="text-right">Fecha</TableHead>
                  <TableHead className="text-center">Tipo Envío</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasFiltradas.map((venta) => {
                  const isExpanded = expandedVentas.has(venta.id);
                  return (
                    <React.Fragment key={venta.id}>
                      <TableRow className={`hover:bg-slate-50 align-top ${selectedVentaIds.has(venta.id) ? 'bg-blue-50/50' : ''}`}>
                        <TableCell className="py-4">
                          <input
                            type="checkbox"
                            checked={selectedVentaIds.has(venta.id)}
                            onChange={() => handleToggleSelect(venta.id)}
                            className="rounded border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-500 py-4">
                          {venta.numeroVenta || venta.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 py-4">
                          {venta.cliente || "Sin cliente"}
                        </TableCell>
                        <TableCell className="text-slate-700 py-4">
                          {venta.vendedor}
                        </TableCell>
                        <TableCell className="py-4">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg" onClick={() => {
                            const newExpanded = new Set(expandedVentas);
                            if (isExpanded) newExpanded.delete(venta.id);
                            else newExpanded.add(venta.id);
                            setExpandedVentas(newExpanded);
                          }}>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            <span className="ml-1 text-xs">Ver ({venta.items?.length || 0})</span>
                          </Button>
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-900 py-4">
                          {formatPrice(venta.totalFinal)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 py-4">
                          {new Date(venta.createdAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <select
                            value={(venta.tipoEnvio || "andreani").toLowerCase()}
                            onChange={(e) => handleActualizarTipoEnvio(venta.id, e.target.value)}
                            disabled={processingIds.has(venta.id)}
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer transition-colors ${(venta.tipoEnvio || "andreani").toLowerCase() === 'andreani' ? 'bg-red-100 text-red-700 border-red-200' :
                              (venta.tipoEnvio || '').toLowerCase() === 'via cargo' ? 'bg-green-100 text-green-700 border-green-200' :
                                (venta.tipoEnvio || '').toLowerCase() === 'retiran aca' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                  'bg-white border-slate-200'
                              }`}
                          >
                            <option value="andreani">Andreani</option>
                            <option value="via cargo">Via Cargo</option>
                            <option value="retiran aca">Retiran aca</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <select
                            value={venta.estadoPedido || "PENDIENTE"}
                            onChange={(e) => handleActualizarEstado(venta.id, e.target.value)}
                            disabled={processingIds.has(venta.id)}
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer ${venta.estadoPedido === 'DESPACHADO' ? 'bg-green-100 text-green-700 border-green-200' :
                              venta.estadoPedido === 'PREPARADO' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                venta.estadoPedido === 'IMPRESO' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                  venta.estadoPedido === 'LISTO_PARA_PREPARAR' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                    'bg-amber-100 text-amber-700 border-amber-200'
                              }`}
                          >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="LISTO_PARA_PREPARAR">Listo p/ Preparar</option>
                            <option value="IMPRESO">Impreso</option>
                            <option value="PREPARADO">Preparado</option>
                            <option value="DESPACHADO">Despachado</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditarPedido(venta)}
                              className="border-amber-600 text-amber-700 hover:bg-amber-50"
                              title="Editar Pedido"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerPDF(venta)}
                              className="border-blue-600 text-blue-700 hover:bg-blue-50"
                              title="Ver PDF del Pedido"
                              disabled={isGeneratingPDF}
                            >
                              {isGeneratingPDF && ventaParaFactura?.id === venta.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmarPedido(venta)}
                              className="border-green-600 text-green-700 hover:bg-green-50"
                              title="Registrar Venta"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEliminarPedido(venta)}
                              className="border-red-600 text-red-700 hover:bg-red-50"
                              title="Eliminar Pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-slate-50/50">
                          <TableCell colSpan={8} className="py-3 px-6">
                            {venta.info && (
                              <div className="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-bold text-amber-800 uppercase">Observaciones / Datos de Envío:</p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100/50 gap-1 text-[10px] font-bold uppercase transition-all"
                                    onClick={() => handleCopyInfo(venta.id, venta.info || "")}
                                  >
                                    {copiedId === venta.id ? (
                                      <>
                                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                                        Copiado
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3" />
                                        Copiar
                                      </>
                                    )}
                                  </Button>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{venta.info}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              {venta.items?.length > 0 ? (
                                venta.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                    <div>
                                      <span className="font-semibold text-slate-700 uppercase">{item.nombre}</span>
                                      <span className="text-[10px] text-slate-400 ml-2 font-mono uppercase">ID: {item.productoId || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">x{item.cantidad}</span>
                                      <span className="font-bold text-slate-700">{formatPrice(item.subtotal)}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-slate-400 italic">Sin artículos</p>
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
          )}
        </div>
      </div>

      {/* Batch Upload Dialog */}
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl border-blue-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-900">
              <Upload className="h-5 w-5" />
              Subir PDF por Lotes
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <div className="bg-blue-50 p-6 rounded-2xl border-2 border-dashed border-blue-200 mb-4">
              <Upload className="h-12 w-12 text-blue-400 mx-auto mb-4" />
              <p className="text-sm text-blue-800 font-medium mb-2">
                Se subirán el PDF a {selectedVentaIds.size} pedidos seleccionados
              </p>
              <input
                type="file"
                accept=".pdf"
                onChange={handleBatchUpload}
                className="hidden"
                id="batch-pdf-upload"
                disabled={isUploading}
              />
              <Button
                asChild
                disabled={isUploading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <label htmlFor="batch-pdf-upload" className="cursor-pointer">
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <File className="h-4 w-4 mr-2" />
                      Seleccionar Archivo PDF
                    </>
                  )}
                </label>
              </Button>
            </div>
            <p className="text-xs text-slate-500 italic">
              El mismo archivo se asociará a todos los pedidos marcados.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsBatchDialogOpen(false)}
              disabled={isUploading}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl border-amber-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900">
              <Clock className="h-5 w-5" />
              Confirmar Pedido de Venta
            </DialogTitle>
          </DialogHeader>
          {ventaSeleccionada && (
            <div className="mt-4 space-y-4">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-800">
                  <strong>Cliente:</strong> {ventaSeleccionada.cliente || "Sin cliente"}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Total:</strong> {formatPrice(ventaSeleccionada.total)}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Total Final:</strong>{" "}
                  {formatPrice(ventaSeleccionada.totalFinal)}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Fecha:</strong>{" "}
                  {new Date(ventaSeleccionada.createdAt).toLocaleDateString(
                    "es-AR"
                  )}
                </p>
              </div>
              <p className="text-sm text-slate-600">
                ¿Desea registrar este pedido como una venta completada? Se descontará el stock correspondiente y el pedido desaparecerá de esta lista para pasar a Ventas Realizadas.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarPedido}
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Registrar Venta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminate Dialog */}
      <Dialog open={isEliminarDialogOpen} onOpenChange={setIsEliminarDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl border-red-200">
          <DialogHeader>
            <DialogTitle className="text-red-900">
              Eliminar Pedido de Venta
            </DialogTitle>
          </DialogHeader>
          {ventaParaEliminar && (
            <div className="mt-4">
              <p className="text-sm text-slate-600">
                ¿Desea eliminar definitivamente este pedido de venta? Esta acción
                no se puede deshacer.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsEliminarDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={eliminarPedido}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Pedido
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={isPDFPreviewOpen} onOpenChange={setIsPDFPreviewOpen}>
        <DialogContent className="max-w-5xl w-full h-[90vh] p-0 rounded-2xl border-0">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Eye className="h-5 w-5" />
              Vista Previa del Pedido
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPDFPreviewOpen(false)}
              className="text-slate-500 hover:text-slate-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-[calc(90vh-80px)] overflow-y-auto">
            {ventaParaPDF && <PDFPreview venta={{ ...ventaParaPDF, id: ventaParaPDF.id, info: ventaParaPDF.info }} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[1200px] w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl border-2 border-amber-200 shadow-2xl">
          <DialogHeader className="p-6 bg-amber-50 border-b border-amber-100 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-amber-900">
                  <Edit className="h-6 w-6" />
                  Editar Pedido de Venta
                </DialogTitle>
                <div className="text-amber-700 font-medium text-sm mt-1">
                  Modifica los artículos, el cliente, la forma de pago o los datos de envío.
                </div>
              </div>
              {editingVenta && (
                <div className="flex gap-4">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-amber-600 uppercase block">ID Pedido</span>
                    <span className="text-sm font-mono font-bold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-200">
                      {editingVenta.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-amber-600 uppercase block">Fecha</span>
                    <span className="text-sm font-bold text-amber-900">
                      {new Date(editingVenta.createdAt).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </DialogHeader>

          {isProcessing ? (
            <div className="flex-grow flex flex-col items-center justify-center bg-white">
              <Loader2 className="h-12 w-12 animate-spin text-amber-600 mb-4" />
              <p className="text-slate-600 font-medium text-lg">Cargando datos del pedido...</p>
            </div>
          ) : editingVenta ? (
            <div className="flex-grow overflow-hidden flex flex-col md:flex-row bg-slate-50/30">
              {/* Columna Izquierda: Artículos y Búsqueda */}
              <div className="flex-[1.8] flex flex-col p-6 overflow-hidden border-r border-slate-100 bg-white">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-amber-600" />
                      Añadir Artículos al Pedido
                    </Label>
                    <button
                      type="button"
                      onClick={() => { setShowNotaInputEdit(v => !v); setNotaTextoEdit(""); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" /> Agregar Nota
                    </button>
                  </div>
                  {showNotaInputEdit && (
                    <div className="flex gap-2 items-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 shadow-sm">
                      <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <Input
                        autoFocus
                        placeholder="Escribí la nota..."
                        value={notaTextoEdit}
                        onChange={(e) => setNotaTextoEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && notaTextoEdit.trim() && editingVenta) {
                            const newItems = [...editingVenta.items, {
                              productoId: null,
                              nombre: notaTextoEdit.trim(),
                              cantidad: 0,
                              precio_unit: 0,
                              subtotal: 0,
                              esNota: true,
                            }];
                            const { total, totalFinal } = recalcularTotales(newItems, editingVenta.interes || 0);
                            setEditingVenta({ ...editingVenta, items: newItems, total, totalFinal });
                            setNotaTextoEdit("");
                            setShowNotaInputEdit(false);
                          } else if (e.key === "Escape") {
                            setShowNotaInputEdit(false);
                            setNotaTextoEdit("");
                          }
                        }}
                        className="flex-1 h-8 text-sm border-amber-200 focus:border-amber-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!notaTextoEdit.trim() || !editingVenta) return;
                          const newItems = [...editingVenta.items, {
                            productoId: null,
                            nombre: notaTextoEdit.trim(),
                            cantidad: 0,
                            precio_unit: 0,
                            subtotal: 0,
                            esNota: true,
                          }];
                          const { total, totalFinal } = recalcularTotales(newItems, editingVenta.interes || 0);
                          setEditingVenta({ ...editingVenta, items: newItems, total, totalFinal });
                          setNotaTextoEdit("");
                          setShowNotaInputEdit(false);
                        }}
                        className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Añadir
                      </button>
                      <button type="button" onClick={() => { setShowNotaInputEdit(false); setNotaTextoEdit(""); }} className="text-slate-400 hover:text-slate-600 p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      placeholder="Buscar artículo por nombre, ID o código..."
                      value={busquedaArticulo}
                      onChange={(e) => setBusquedaArticulo(e.target.value)}
                      className="pl-12 h-12 text-base border-slate-200 rounded-2xl focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-sm"
                    />
                    {busquedaArticulo && (
                      <button
                        onClick={() => setBusquedaArticulo("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}

                    {resultadosBusqueda.length > 0 && (
                      <div className="absolute z-[100] w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[350px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {resultadosBusqueda.map((art) => (
                          <button
                            key={art.id}
                            onClick={() => agregarArticulo(art)}
                            className="w-full flex items-center justify-between p-4 hover:bg-amber-50 border-b border-slate-50 last:border-0 transition-colors text-left group"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {art.esPack && <span className="bg-purple-100 text-purple-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-purple-200 uppercase">Pack</span>}
                                <span className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">{art.nombre}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${art.stock <= 0
                                  ? 'bg-red-50 text-red-600 border-red-100'
                                  : art.stock <= 5
                                    ? 'bg-orange-50 text-orange-600 border-orange-100'
                                    : 'bg-green-50 text-green-600 border-green-100'
                                  }`}>
                                  STOCK: {art.stock}
                                </span>
                                <span className="text-xs text-slate-400 font-mono">ID: {art.id}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-bold text-slate-900">{formatPrice(art.precio)}</span>
                              <div className="bg-amber-100 text-amber-600 p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                                <Plus className="h-4 w-4" />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-grow flex flex-col border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-y-auto flex-grow h-full bg-white">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="text-[10px] uppercase font-black py-4 pl-6 tracking-widest text-slate-500">Artículo</TableHead>
                          <TableHead className="text-[10px] uppercase font-black py-4 text-center w-28 tracking-widest text-slate-500">Cantidad</TableHead>
                          <TableHead className="text-[10px] uppercase font-black py-4 text-right w-40 tracking-widest text-slate-500">Precio Unit.</TableHead>
                          <TableHead className="text-[10px] uppercase font-black py-4 text-right w-40 tracking-widest text-slate-500">Subtotal</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingVenta.items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-24">
                              <div className="flex flex-col items-center gap-3 opacity-30">
                                <Plus className="h-12 w-12" />
                                <p className="text-lg italic font-medium">No hay artículos cargados</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          editingVenta.items.map((item, idx) => (
                            item.esNota ? (
                              <TableRow key={idx} className="bg-amber-50/60 hover:bg-amber-50 transition-colors border-l-2 border-l-amber-400 group">
                                <TableCell colSpan={3} className="py-3 pl-6">
                                  <div className="flex items-center gap-2 text-amber-800">
                                    <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                    <span className="text-sm font-medium italic">{item.nombre}</span>
                                    <span className="text-[10px] font-black bg-amber-100 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase">Nota</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 text-right pr-4 text-slate-300">—</TableCell>
                                <TableCell className="py-3 text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => eliminarArticulo(idx)}
                                    className="h-10 w-10 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ) : (
                            <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors group">
                              <TableCell className="py-4 pl-6">
                                <div className="flex flex-col gap-1">
                                  <p className="text-sm font-bold text-slate-800 line-clamp-2">{item.nombre}</p>
                                  <p className="text-[9px] text-slate-400 font-mono uppercase tracking-tighter">
                                    {item.productoId || "N/A"}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex justify-center">
                                  <Input
                                    type="number"
                                    value={item.cantidad}
                                    onChange={(e) => actualizarItem(idx, 'cantidad', Number(e.target.value))}
                                    className="h-9 w-20 text-center font-bold text-slate-900 border-slate-200 bg-slate-50/50 focus:bg-white transition-all rounded-lg"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="py-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xs text-slate-400">$</span>
                                  <Input
                                    type="number"
                                    value={item.precio_unit}
                                    onChange={(e) => actualizarItem(idx, 'precio_unit', Number(e.target.value))}
                                    className="h-9 w-32 text-right font-bold text-slate-900 border-slate-200 bg-slate-50/50 focus:bg-white transition-all rounded-lg"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="py-4 text-right pr-4">
                                <span className="text-base font-black text-slate-900">
                                  {formatPrice(item.subtotal)}
                                </span>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => eliminarArticulo(idx)}
                                  className="h-10 w-10 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            )
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Datos de Cliente, Pago y Envío */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Sección Cliente */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center gap-2">
                    <User className="h-4 w-4" /> Datos del Cliente
                  </h3>
                  <div className="grid gap-4">
                    {/* Buscador unificado de cliente */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Cliente</Label>
                      {clienteSeleccionado ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                          <User className="h-4 w-4 text-amber-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{clienteSeleccionado.razonSocial}</p>
                            {clienteSeleccionado.nombreFantasia && (
                              <p className="text-[10px] text-slate-500 truncate">{clienteSeleccionado.nombreFantasia}</p>
                            )}
                            <p className="text-[10px] text-slate-400 font-mono">{clienteSeleccionado.cuit}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleLimpiarCliente}
                            className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="flex items-center gap-2 h-11 px-3 border border-slate-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500 transition-all">
                            <Search className="h-4 w-4 text-slate-400 shrink-0" />
                            <input
                              value={busquedaCliente}
                              onChange={(e) => setBusquedaCliente(e.target.value)}
                              placeholder="Nombre, nombre fantasía, DNI o CUIT..."
                              className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
                            />
                            {busquedaCliente && (
                              <button
                                type="button"
                                onClick={() => { setBusquedaCliente(""); setResultadosCliente([]); setPadronResultado(null); }}
                              >
                                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                              </button>
                            )}
                          </div>

                          {!busquedaCliente && (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-semibold">
                                <User className="h-2.5 w-2.5" /> Consumidor Final
                              </span>
                            </div>
                          )}

                          {(resultadosCliente.length > 0 || busquedaCliente.replace(/\D/g, '').length >= 7) && busquedaCliente.length > 1 && (
                            <div className="absolute z-[110] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-[220px] overflow-y-auto">
                              {resultadosCliente.map(prov => (
                                <button
                                  key={prov.id}
                                  type="button"
                                  onClick={() => handleSeleccionarCliente(prov)}
                                  className="w-full flex items-center justify-between p-3 hover:bg-amber-50 border-b border-slate-50 last:border-0 transition-colors text-left"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-slate-900 truncate">{prov.razonSocial}</span>
                                    {prov.nombreFantasia && (
                                      <span className="text-[10px] text-slate-500 truncate">{prov.nombreFantasia}</span>
                                    )}
                                    <span className="text-[9px] text-slate-400 font-mono">{prov.cuit}</span>
                                  </div>
                                  <span className="text-[9px] text-slate-300 shrink-0 ml-2 bg-slate-100 px-1.5 py-0.5 rounded-full">DB</span>
                                </button>
                              ))}
                              {busquedaCliente.replace(/\D/g, '').length >= 7 && (
                                <button
                                  type="button"
                                  onClick={handleBuscarEnPadron}
                                  disabled={isSearchingPadron}
                                  className="w-full flex items-center gap-2 p-3 hover:bg-blue-50 text-blue-600 border-t border-slate-100 transition-colors disabled:opacity-60"
                                >
                                  {isSearchingPadron ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                  <span className="text-xs font-semibold">Buscar en Padrón A13</span>
                                </button>
                              )}
                            </div>
                          )}

                          {padronResultado && (
                            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                              <div>
                                <p className="text-xs font-bold text-blue-900">{padronResultado.nombre}</p>
                                <p className="text-[10px] text-blue-600 font-mono">{padronResultado.cuit}</p>
                              </div>
                              <button
                                type="button"
                                onClick={handleCrearDesdePadron}
                                disabled={isCreatingFromPadron}
                                className="w-full h-8 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-60"
                              >
                                {isCreatingFromPadron ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                Crear proveedor y asignar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Vendedor</Label>
                      <Input
                        value={editingVenta.vendedor}
                        onChange={(e) => setEditingVenta({ ...editingVenta, vendedor: e.target.value })}
                        className="h-10 border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Sección Pago */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Pago y Facturación
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Método de Pago</Label>
                      <select
                        value={editingVenta.metodo_pago}
                        onChange={(e) => setEditingVenta({ ...editingVenta, metodo_pago: e.target.value })}
                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all appearance-none cursor-pointer"
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                        <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                        <option value="MercadoLibre">MercadoLibre</option>
                        <option value="MercadoPago">MercadoPago</option>
                        <option value="Cruzada">Cruzada</option>
                        <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                        <option value="Mixto">Mixto</option>
                        <option value="A Confirmar">A Confirmar</option>
                      </select>
                    </div>

                    {/* Campos condicionales según método */}
                    {(editingVenta.metodo_pago === "Tarjeta de Crédito" || editingVenta.metodo_pago === "Tarjeta de Débito") && (
                      <div className="grid grid-cols-2 gap-3 bg-blue-50/30 p-4 rounded-2xl border border-blue-100 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[10px] font-bold text-blue-700 uppercase">Interés aplicado</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              value={editingVenta.interes}
                              onChange={(e) => handleInteresChange(Number(e.target.value))}
                              className="h-10 pl-8 font-black text-blue-700 border-blue-200 bg-white"
                            />
                            <Percent className="absolute left-2.5 top-3 h-4 w-4 text-blue-400" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-blue-700 uppercase">N° Cupón</Label>
                          <Input value={editingVenta.cupon || ""} onChange={(e) => setEditingVenta({ ...editingVenta, cupon: e.target.value })} className="h-9 bg-white border-blue-200" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-blue-700 uppercase">Transacción</Label>
                          <Input value={editingVenta.transaccionId || ""} onChange={(e) => setEditingVenta({ ...editingVenta, transaccionId: e.target.value })} className="h-9 bg-white border-blue-200" />
                        </div>
                      </div>
                    )}

                    {(editingVenta.metodo_pago === "MercadoLibre" || editingVenta.metodo_pago === "mercadopago (ML)") && (
                      <div className="grid grid-cols-2 gap-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-1.5"><Label className="text-[10px] font-bold text-indigo-700 uppercase">ID Venta ML</Label><Input value={editingVenta.mlIdVenta || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlIdVenta: e.target.value })} className="h-9 bg-white border-indigo-200 font-mono text-[10px]" /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] font-bold text-indigo-700 uppercase">ID Envío ML</Label><Input value={editingVenta.mlIdEnvio || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlIdEnvio: e.target.value })} className="h-9 bg-white border-indigo-200 font-mono text-[10px]" /></div>
                        <div className="space-y-1.5 col-span-2"><Label className="text-[10px] font-bold text-indigo-700 uppercase">MLA</Label><Input value={editingVenta.mlMla || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlMla: e.target.value })} className="h-9 bg-white border-indigo-200 font-mono text-[10px]" /></div>
                      </div>
                    )}

                    {editingVenta.metodo_pago === "Mixto" && (
                      <div className="space-y-4 bg-purple-50/30 p-4 rounded-2xl border border-purple-100 animate-in fade-in zoom-in-95 duration-200">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-purple-700 uppercase">Pago 1</Label>
                            <select value={metodo1} onChange={(e) => setMetodo1(e.target.value)} className="w-full h-9 rounded-lg border border-purple-200 bg-white px-2 text-xs">
                              <option value="Efectivo">Efectivo</option>
                              <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                              <option value="Mercado Pago">Mercado Pago</option>
                            </select>
                            <Input type="number" value={monto1} onChange={(e) => setMonto1(Number(e.target.value))} className="h-9 font-bold text-purple-900 border-purple-200" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-purple-700 uppercase">Pago 2</Label>
                            <select value={metodo2} onChange={(e) => setMetodo2(e.target.value)} className="w-full h-9 rounded-lg border border-purple-200 bg-white px-2 text-xs">
                              <option value="Efectivo">Efectivo</option>
                              <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                              <option value="Mercado Pago">Mercado Pago</option>
                            </select>
                            <div className="h-9 flex items-center px-3 bg-purple-100 rounded-lg text-xs font-black text-purple-900">
                              {formatPrice(monto2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {(editingVenta.metodo_pago === "Cruzada" || editingVenta.metodo_pago === "A Cuenta Corriente") && (
                      <div className="space-y-3 bg-amber-50/30 p-4 rounded-2xl border border-amber-100 animate-in fade-in zoom-in-95 duration-200">
                        {editingVenta.metodo_pago === "Cruzada" && (
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold text-amber-700 uppercase">Origen (De)</Label>
                            <Input value={editingVenta.de || ""} onChange={(e) => setEditingVenta({ ...editingVenta, de: e.target.value })} className="h-9 bg-white border-amber-200" />
                          </div>
                        )}
                        <div className="space-y-1.5 relative">
                          <Label className="text-[10px] font-bold text-amber-700 uppercase">Destino / Proveedor (Para)</Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                value={busquedaProveedor || editingVenta.para || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setBusquedaProveedor(val);
                                  if (val !== editingVenta.para) setEditingVenta({ ...editingVenta, para: "" });
                                }}
                                className="h-10 bg-white border-amber-200"
                                placeholder="Escribe para buscar proveedor..."
                              />
                              {resultadosProveedores.length > 0 && (
                                <div className="absolute z-[110] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-[150px] overflow-y-auto bottom-full">
                                  {resultadosProveedores.map((prov) => (
                                    <button
                                      key={prov.id}
                                      type="button"
                                      onClick={() => {
                                        setEditingVenta({ ...editingVenta, para: prov.razonSocial });
                                        setBusquedaProveedor(prov.razonSocial);
                                        setResultadosProveedores([]);
                                      }}
                                      className="w-full flex items-center justify-between p-3 hover:bg-amber-50 border-b border-slate-50 last:border-0 transition-colors text-left"
                                    >
                                      <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-900">{prov.razonSocial}</span>
                                        <span className="text-[9px] text-slate-400">{prov.cuit}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              type="button"
                              onClick={() => setIsAddProvModalOpen(true)}
                              className="h-10 w-10 shrink-0 border-amber-200 hover:bg-amber-100 hover:text-amber-700 transition-all rounded-xl bg-white shadow-sm"
                              title="Nuevo Proveedor"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sección Envío y Notas */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Envío y Observaciones
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Tipo de Envío</Label>
                      <select
                        value={(editingVenta.tipoEnvio || "andreani").toLowerCase()}
                        onChange={(e) => setEditingVenta({ ...editingVenta, tipoEnvio: e.target.value })}
                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 transition-all appearance-none cursor-pointer"
                      >
                        <option value="andreani">Andreani</option>
                        <option value="via cargo">Via Cargo</option>
                        <option value="retiran aca">Retiran aca</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Notas del Pedido</Label>
                      <Textarea
                        value={editingVenta.info || ""}
                        onChange={(e) => setEditingVenta({ ...editingVenta, info: e.target.value })}
                        placeholder="Dirección, referencias, detalles de entrega..."
                        className="min-h-[100px] border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Sección PDF */}
                <div className="bg-slate-900 p-5 rounded-2xl shadow-lg space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-3 flex items-center gap-2">
                    <Upload className="h-4 w-4 text-amber-500" /> Comprobante PDF
                  </h3>
                  {editingVenta.pdfUrl ? (
                    <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <File className="h-5 w-5 text-green-500" />
                        </div>
                        <span className="text-xs text-slate-300 truncate font-medium max-w-[150px]">
                          PDF Adjunto
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-slate-400 hover:text-white hover:bg-slate-700"
                          onClick={() => window.open(editingVenta.pdfUrl!, '_blank')}
                        >
                          <Eye className="h-5 w-5" />
                        </Button>
                        <Label
                          htmlFor="pdf-upload"
                          className="h-9 w-9 flex items-center justify-center text-amber-500 hover:text-amber-400 hover:bg-slate-700 cursor-pointer rounded-lg border border-slate-700 transition-all"
                        >
                          <RefreshCcw className="h-5 w-5" />
                        </Label>
                      </div>
                    </div>
                  ) : (
                    <Label
                      htmlFor="pdf-upload"
                      className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-2xl cursor-pointer hover:bg-slate-800 hover:border-amber-500/50 transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex flex-col items-center justify-center pt-4 pb-4">
                        {isUploading ? (
                          <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-2" />
                        ) : (
                          <Upload className="h-8 w-8 text-slate-600 mb-2" />
                        )}
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          {isUploading ? "Subiendo..." : "Subir Comprobante PDF"}
                        </p>
                      </div>
                      <input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={handleUploadPDF} disabled={isUploading} />
                    </Label>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="p-6 bg-white border-t border-slate-100 flex-shrink-0">
            <div className="flex flex-col md:flex-row items-center justify-between w-full gap-6">
              <div className="flex items-center gap-8">
                <div className="text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-widest">Subtotal Artículos</span>
                  <div className="text-xl font-bold text-slate-600">$ {editingVenta?.total.toLocaleString('es-AR')}</div>
                </div>
                <div className="h-10 w-px bg-slate-100"></div>
                <div className="text-left">
                  <span className="text-[10px] font-bold text-amber-600 uppercase block tracking-widest">Total Final a Cobrar</span>
                  <div className="text-3xl font-black text-slate-900 tracking-tighter">$ {editingVenta?.totalFinal.toLocaleString('es-AR')}</div>
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setVentaParaEditar(null);
                  }}
                  className="flex-1 md:flex-none h-14 px-8 rounded-2xl border-slate-200 text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmarEdicion}
                  disabled={isProcessing}
                  size="lg"
                  className="flex-1 md:flex-none h-14 px-12 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xl shadow-amber-600/20 transition-all hover:shadow-amber-600/30 active:scale-95"
                >
                  {isProcessing ? (
                    <><Loader2 className="h-5 w-5 mr-3 animate-spin" /> Guardando...</>
                  ) : (
                    <><Save className="h-5 w-5 mr-3" /> Guardar Cambios</>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nuevo Proveedor */}
      <Dialog open={isAddProvModalOpen} onOpenChange={setIsAddProvModalOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <div className="bg-amber-100 p-2 rounded-xl">
                <User className="h-5 w-5 text-amber-600" />
              </div>
              Nuevo Proveedor
            </DialogTitle>
            <DialogDescription>
              Crea un nuevo proveedor rápidamente. Puedes buscar los datos por CUIT en el padrón ARCA.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CUIT / DNI</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <CreditCard className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    value={newProvData.cuit}
                    onChange={(e) => setNewProvData({ ...newProvData, cuit: e.target.value })}
                    placeholder="20-XXXXXXXX-X"
                    className="h-10 pl-9 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBuscarPadronProv}
                  disabled={isSearchingPadron}
                  className="h-10 w-10 shrink-0 border-slate-200 hover:bg-amber-50 hover:text-amber-600 transition-all rounded-xl"
                  title="Buscar en Padrón ARCA"
                >
                  {isSearchingPadron ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Razón Social</Label>
              <Input
                value={newProvData.razonSocial}
                onChange={(e) => setNewProvData({ ...newProvData, razonSocial: e.target.value })}
                className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all font-bold"
                placeholder="Nombre de la empresa"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Fantasía</Label>
              <Input
                value={newProvData.nombreFantasia}
                onChange={(e) => setNewProvData({ ...newProvData, nombreFantasia: e.target.value })}
                className="h-10 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                placeholder="Nombre comercial"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono</Label>
                <Input
                  value={newProvData.telefono}
                  onChange={(e) => setNewProvData({ ...newProvData, telefono: e.target.value })}
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                  placeholder="Ej: 11 1234 5678"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</Label>
                <Input
                  value={newProvData.email}
                  onChange={(e) => setNewProvData({ ...newProvData, email: e.target.value })}
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 focus:bg-white transition-all"
                  placeholder="proveedor@empresa.com"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsAddProvModalOpen(false)} className="rounded-xl font-bold">Cancelar</Button>
            <Button
              onClick={handleCrearProveedorRapido}
              disabled={isCreatingProv}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-8 font-black shadow-lg shadow-amber-200 transition-all active:scale-95"
            >
              {isCreatingProv ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar Proveedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RENDER OCULTO PARA CAPTURA DE PDF */}
      <div style={{ position: 'absolute', left: '-9999px', top: '0', pointerEvents: 'none', width: '210mm' }}>
        <div ref={facturaRef}>
          {ventaParaFactura && (
            <PedidoVentaA4
              venta={ventaParaFactura}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingEliminarPDF !== null}
        onOpenChange={(open) => { if (!open) setPendingEliminarPDF(null); }}
        title="Eliminar PDF"
        description="¿Está seguro que desea eliminar el PDF de este pedido?"
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleEliminarPDFConfirm}
      />
    </div>
  );
}

// COMPONENTE PARA EL FORMATO A4 DEL PEDIDO (SIMILAR A LA FACTURA)
function PedidoVentaA4({ venta }: { venta: any }) {
  const items = venta.items || [];
  const total = Number(venta.totalFinal || venta.total || 0);
  const iva = total - (total / 1.21);

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
              <h2 className="text-xl font-bold mb-1 uppercase text-blue-700">Pedido de Venta</h2>
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
