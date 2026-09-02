"use client";

import React, { useEffect, useState, useMemo } from "react";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle2,
  Loader2,
  Trash2,
  Edit,
  RefreshCcw,
  ChevronDown,
  Eye,
  Upload,
  File,
  FileX,
  ArrowLeft,
  Printer,
  Search,
  X,
  Copy,
  FileDown,
  AlertTriangle,
  Package,
  Truck,
  TrendingUp,
  Filter,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Camera,
  FileText,
} from "lucide-react";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosVenta,
  confirmarPedidoVenta,
  eliminarPedidoVenta,
  actualizarEstadoPedido,
  obtenerPedidoPorId,
  subirPDFPedido,
  obtenerURLDescargaPDF,
  subirPDFLote,
  eliminarPDFPedido,
  actualizarTipoEnvioPedido,
  obtenerTodosLosArticulos,
  exportarPedidosVentaParaExcel,
} from "@/app/actions/ventas-mostrador";
import { obtenerPuntosVenta } from "@/app/actions/puntos-venta";
import { generarPedidoVentaPdf } from "@/app/admin/ventas-mostrador/components/print/generar-pedido-pdf";
import { TicketImpresion } from "@/app/admin/ventas-mostrador/components/print/ticket-impresion";
import { FotosAuditoriaModal } from "@/app/admin/ventas-mostrador/components/modals/fotos-auditoria-modal";
import {
  obtenerPedidosConFoto,
  obtenerFotosPedido,
} from "@/app/actions/preparacion-pedidos";

type ItemVenta = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  esNota?: boolean;
};

export type Venta = {
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
  mlPackId?: string | null;
  tipoEnvio?: string;
  docTipo?: number | null;
  docNro?: string | null;
  condicionIva?: number | null;
  tipoComprobante?: number | null;
};

interface Props {
  onEditarPedido?: (venta: Venta) => void;
  onImprimirTicket?: (venta: Venta) => void;
}

const ITEMS_PER_PAGE = 50;

export default function PedidosVentaEdicionClient({
  onEditarPedido,
  onImprimirTicket,
}: Props = {}) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");
  const [filtroTipoEnvio, setFiltroTipoEnvio] = useState<string>("TODOS");
  const [filtroVendedor, setFiltroVendedor] = useState<string>("TODOS");
  const [filtroSoloHoy, setFiltroSoloHoy] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Selección y procesamiento
  const [selectedVentaIds, setSelectedVentaIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modales
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [ventaParaEliminar, setVentaParaEliminar] = useState<Venta | null>(null);
  const [isEliminarDialogOpen, setIsEliminarDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Impresión y Fotos
  const [ventaParaTicket, setVentaParaTicket] = useState<Venta | null>(null);
  const [pedidosConFoto, setPedidosConFoto] = useState<Record<string, string>>({});
  const [fotosPedido, setFotosPedido] = useState<{ venta: any; fotos: any[] } | null>(null);
  const [loadingFotoId, setLoadingFotoId] = useState<string | null>(null);

  // Exportación Excel
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDesde, setExportDesde] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [exportHasta, setExportHasta] = useState(new Date().toISOString().split("T")[0]);
  const [exportPuntosVenta, setExportPuntosVenta] = useState<
    { id: string; nombre: string; color?: string | null }[]
  >([]);
  const [exportPuntosSeleccionados, setExportPuntosSeleccionados] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Stock de artículos
  const [articulos, setArticulos] = useState<any[]>([]);

  // Cargar pedidos y stock de artículos
  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidosVenta(
        undefined,
        undefined,
        filtroEstado && filtroEstado !== "TODOS" ? filtroEstado : undefined
      );
      setVentas(data);

      const ids = data.map((v: any) => v.id);
      if (ids.length > 0) {
        obtenerPedidosConFoto(ids).then((res) => {
          if (res.success) setPedidosConFoto(res.estados);
        });
      }
    } catch (err) {
      console.error("Error al cargar pedidos:", err);
      setError("No se pudieron cargar los pedidos de venta");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const [arts] = await Promise.all([obtenerTodosLosArticulos(), cargarPedidos()]);
        setArticulos(arts);
      } catch (err) {
        console.error("Error al cargar artículos:", err);
      }
    };
    cargarDatosIniciales();
  }, []);

  // Mapa de stock indexado por ID de producto
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const art of articulos) {
      map.set(art.id, Number(art.stock || 0));
    }
    return map;
  }, [articulos]);

  // Set de IDs de artículos que son servicios (no controlan stock)
  const serviciosSet = useMemo(() => {
    const set = new Set<string>();
    for (const art of articulos) {
      if (art.esServicio) set.add(art.id);
    }
    return set;
  }, [articulos]);

  // Copiar datos de envío al portapapeles
  const handleCopyInfo = (id: string, info: string) => {
    navigator.clipboard.writeText(info);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtrado compuesto con debounce visual
  const ventasFiltradas = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const hoyStr = new Date().toISOString().split("T")[0];

    return ventas.filter((v) => {
      // Filtro Estado
      if (filtroEstado !== "TODOS" && v.estadoPedido !== filtroEstado) {
        return false;
      }

      // Filtro Tipo de Envío
      if (filtroTipoEnvio !== "TODOS") {
        const tipo = (v.tipoEnvio || "andreani").toLowerCase();
        if (tipo !== filtroTipoEnvio.toLowerCase()) return false;
      }

      // Filtro Vendedor / Canal
      if (filtroVendedor !== "TODOS") {
        if (filtroVendedor === "Mayorista Web" && v.vendedor !== "Mayorista Web") return false;
        if (filtroVendedor === "Mostrador" && v.vendedor === "Mayorista Web") return false;
      }

      // Filtro Solo Hoy
      if (filtroSoloHoy) {
        const vFecha = new Date(v.createdAt).toISOString().split("T")[0];
        if (vFecha !== hoyStr) return false;
      }

      // Filtro Buscador
      if (term) {
        const nroStr = v.numeroVenta ? v.numeroVenta.toString() : "";
        const idStr = v.id.toLowerCase();
        const clienteStr = (v.cliente || "").toLowerCase();
        const dniStr = (v.dni || v.docNro || "").toLowerCase();
        const vendedorStr = (v.vendedor || "").toLowerCase();
        const itemsStr = (v.items || [])
          .map((i) => `${i.nombre} ${i.productoId || ""}`)
          .join(" ")
          .toLowerCase();

        const match =
          nroStr.includes(term) ||
          idStr.includes(term) ||
          clienteStr.includes(term) ||
          dniStr.includes(term) ||
          vendedorStr.includes(term) ||
          itemsStr.includes(term);

        if (!match) return false;
      }

      return true;
    });
  }, [ventas, searchTerm, filtroEstado, filtroTipoEnvio, filtroVendedor, filtroSoloHoy]);

  // Reset de página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filtroEstado, filtroTipoEnvio, filtroVendedor, filtroSoloHoy]);

  // Paginación
  const totalPages = Math.ceil(ventasFiltradas.length / ITEMS_PER_PAGE) || 1;
  const paginatedVentas = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return ventasFiltradas.slice(start, start + ITEMS_PER_PAGE);
  }, [ventasFiltradas, currentPage]);

  // Métricas y KPIs
  const metricas = useMemo(() => {
    let montoPendiente = 0;
    let pendientesCount = 0;
    let listosPrepararCount = 0;
    let preparadosCount = 0;
    let despachadosCount = 0;
    let conFaltaStockCount = 0;

    for (const v of ventas) {
      const estado = v.estadoPedido || "PENDIENTE";
      if (estado === "PENDIENTE" || estado === "LISTO_PARA_PREPARAR") {
        montoPendiente += Number(v.totalFinal || v.total || 0);
      }
      if (estado === "PENDIENTE") pendientesCount++;
      if (estado === "LISTO_PARA_PREPARAR") listosPrepararCount++;
      if (estado === "PREPARADO") preparadosCount++;
      if (estado === "DESPACHADO") despachadosCount++;

      // Verificar si tiene falta de stock
      const tieneFalta = (v.items || []).some((item) => {
        if (!item.productoId || item.esNota) return false;
        if (serviciosSet.has(item.productoId)) return false;
        const disp = stockMap.get(item.productoId);
        return disp !== undefined && disp < item.cantidad;
      });
      if (tieneFalta && estado !== "DESPACHADO") {
        conFaltaStockCount++;
      }
    }

    return {
      total: ventas.length,
      montoPendiente,
      pendientesCount,
      listosPrepararCount,
      preparadosCount,
      despachadosCount,
      conFaltaStockCount,
    };
  }, [ventas, stockMap, serviciosSet]);

  // Actualizar Estado
  const handleActualizarEstado = async (ventaId: string, nuevoEstado: string) => {
    setVentas((prev) =>
      prev.map((v) => (v.id === ventaId ? { ...v, estadoPedido: nuevoEstado } : v))
    );
    setProcessingIds((prev) => new Set(prev).add(ventaId));
    try {
      await actualizarEstadoPedido(ventaId, nuevoEstado);
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado");
      cargarPedidos();
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(ventaId);
        return next;
      });
    }
  };

  // Actualizar Tipo de Envío
  const handleActualizarTipoEnvio = async (ventaId: string, nuevoTipo: string) => {
    setVentas((prev) =>
      prev.map((v) => (v.id === ventaId ? { ...v, tipoEnvio: nuevoTipo } : v))
    );
    setProcessingIds((prev) => new Set(prev).add(ventaId));
    try {
      await actualizarTipoEnvioPedido(ventaId, nuevoTipo);
    } catch (err) {
      console.error("Error al actualizar tipo de envío:", err);
      alert("Error al actualizar el tipo de envío");
      cargarPedidos();
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(ventaId);
        return next;
      });
    }
  };

  // Confirmar y Registrar Venta
  const confirmarPedido = async () => {
    if (!ventaSeleccionada) return;
    try {
      setIsProcessing(true);
      await confirmarPedidoVenta(ventaSeleccionada.id);
      setVentaSeleccionada(null);
      setIsConfirmDialogOpen(false);
      await cargarPedidos();
    } catch (err) {
      console.error("Error al confirmar pedido:", err);
      alert("Error al confirmar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Eliminar Pedido
  const eliminarPedido = async () => {
    if (!ventaParaEliminar) return;
    try {
      setIsProcessing(true);
      await eliminarPedidoVenta(ventaParaEliminar.id);
      setVentaParaEliminar(null);
      setIsEliminarDialogOpen(false);
      await cargarPedidos();
    } catch (err) {
      console.error("Error al eliminar pedido:", err);
      alert("Error al eliminar el pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  // Editar Pedido en POS Cart
  const handleEditarPedido = async (venta: Venta) => {
    if (onEditarPedido) {
      setIsProcessing(true);
      try {
        const ventaData = await obtenerPedidoPorId(venta.id);
        if (ventaData) {
          onEditarPedido(ventaData);
        } else {
          alert("Error al cargar los datos del pedido");
        }
      } catch (err) {
        console.error("Error al cargar pedido para editar:", err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Subir PDF
  const handleUploadPDFRow = async (
    ventaId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Solo se permiten archivos PDF");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      const result = await subirPDFPedido(ventaId, formData);
      if (result.success) {
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

  // Eliminar PDF
  const handleEliminarPDF = async (ventaId: string) => {
    if (!confirm("¿Desea eliminar el comprobante PDF adjunto?")) return;
    try {
      setIsProcessing(true);
      const result = await eliminarPDFPedido(ventaId);
      if (result.success) {
        cargarPedidos();
      } else {
        alert(result.error || "Error al eliminar el PDF");
      }
    } catch (err) {
      console.error("Error al eliminar PDF:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Descargar PDF
  const handleDownloadPDF = async (ventaId: string) => {
    try {
      setIsProcessing(true);
      const result = await obtenerURLDescargaPDF(ventaId);
      if (result.success && result.url) {
        window.open(result.url, "_blank");
      } else {
        alert(result.error || "Error al obtener el enlace");
      }
    } catch (err) {
      console.error("Error al descargar PDF:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Selección múltiple
  const handleToggleSelect = (id: string) => {
    setSelectedVentaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedVentaIds.size === paginatedVentas.length && paginatedVentas.length > 0) {
      setSelectedVentaIds(new Set());
    } else {
      setSelectedVentaIds(new Set(paginatedVentas.map((v) => v.id)));
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
        alert(`PDF subido a ${selectedVentaIds.size} pedidos`);
        setSelectedVentaIds(new Set());
        setIsBatchDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al subir el PDF por lote");
      }
    } catch (err) {
      console.error("Error en subida por lote:", err);
    } finally {
      setIsUploading(false);
    }
  };

  // Abrir PDF puro en nueva pestaña para visualizar / descargar en Chrome
  const handleAbrirPdfEnNuevaPestana = async (venta: Venta) => {
    if (!venta) return;

    // Abrir pestaña previa para evitar bloqueos de popups en el navegador
    const newWindow = window.open("about:blank", "_blank");

    try {
      const doc = generarPedidoVentaPdf(venta);
      const pdfBlob = doc.output("blob");

      const nroPedido = (venta.numeroVenta || venta.id.slice(0, 8))
        .toString()
        .padStart(8, "0");
      const clienteSanitizado = (venta.cliente || "Consumidor_Final")
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .slice(0, 30);
      const fileName = `Pedido_${nroPedido}_${clienteSanitizado}.pdf`;

      const formData = new FormData();
      formData.append("pdf", pdfBlob, fileName);

      const res = await fetch("/api/ventas-mostrador/resumen-pdf", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const { id } = await res.json();
        const targetUrl = `/api/ventas-mostrador/resumen-pdf/${id}/${encodeURIComponent(fileName)}`;
        if (newWindow) {
          newWindow.location.href = targetUrl;
        } else {
          window.open(targetUrl, "_blank");
        }
      } else {
        const blobUrl = URL.createObjectURL(pdfBlob);
        if (newWindow) {
          newWindow.location.href = blobUrl;
        } else {
          window.open(blobUrl, "_blank");
        }
      }
    } catch (err) {
      if (newWindow) newWindow.close();
      console.error("Error al generar PDF del pedido:", err);
      alert("Error al generar el PDF del pedido");
    }
  };

  // Imprimir Ticket Térmico
  const handleImprimirTicket = (venta: Venta) => {
    if (onImprimirTicket) {
      onImprimirTicket(venta);
    } else {
      setVentaParaTicket(venta);
      setTimeout(() => window.print(), 300);
    }
  };

  // Ver fotos de preparación del pedido
  const handleVerFotosPedido = async (venta: Venta) => {
    setLoadingFotoId(venta.id);
    try {
      const res = await obtenerFotosPedido(venta.id);
      if (res.success) {
        setFotosPedido({ venta, fotos: res.fotos });
      } else {
        alert("No se pudieron cargar las fotos del pedido.");
      }
    } catch (e) {
      console.error("Error al cargar fotos:", e);
      alert("Error de conexión al cargar fotos.");
    } finally {
      setLoadingFotoId(null);
    }
  };

  // Exportar Excel dinámico
  const abrirModalExport = async () => {
    setIsExportModalOpen(true);
    if (exportPuntosVenta.length === 0) {
      const res = await obtenerPuntosVenta();
      if (res.success && res.data) setExportPuntosVenta(res.data as any[]);
    }
  };

  const handleExportarExcel = async () => {
    setIsExporting(true);
    try {
      const XLSX = await import("xlsx");
      const datos = await exportarPedidosVentaParaExcel(
        exportDesde,
        exportHasta,
        exportPuntosSeleccionados.length > 0 ? exportPuntosSeleccionados : undefined
      );

      const filas: any[] = [];
      for (const venta of datos) {
        const fecha = new Date(venta.createdAt).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "America/Argentina/Buenos_Aires",
        });
        venta.items.forEach((item, idx) => {
          filas.push({
            "N° Venta": venta.numeroVenta ?? "",
            Fecha: fecha,
            Cliente: venta.cliente,
            Artículo: item.nombre,
            Cantidad: item.cantidad,
            "Precio Unit.": item.precio_unit,
            "Método de Pago": idx === 0 ? venta.metodo_pago : "",
            "Total Venta": idx === 0 ? venta.totalFinal : "",
            "Punto de Venta": idx === 0 ? venta.puntoVenta ?? "" : "",
          });
        });
      }

      const ws = XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [
        { wch: 10 },
        { wch: 14 },
        { wch: 28 },
        { wch: 45 },
        { wch: 10 },
        { wch: 14 },
        { wch: 22 },
        { wch: 14 },
        { wch: 20 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pedidos de Venta");

      const nombreArchivo = `pedidos-venta_${exportDesde}_${exportHasta}.xlsx`;
      XLSX.writeFile(wb, nombreArchivo);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error("Error al exportar:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 space-y-5">
      {/* Header y Accesos */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/erp"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
            title="Volver al ERP"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Pedidos de Venta Pendientes
            </h1>
            <p className="text-xs text-slate-500">
              Control de preparación, logística, stock disponible y facturación directa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={cargarPedidos}
            disabled={cargando}
            variant="outline"
            className="rounded-xl h-9 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </Button>

          <Button
            variant="outline"
            onClick={abrirModalExport}
            className="rounded-xl h-9 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <FileDown className="h-3.5 w-3.5 mr-1.5" />
            Exportar Excel
          </Button>

          {selectedVentaIds.size > 0 && (
            <Button
              onClick={() => setIsBatchDialogOpen(true)}
              className="rounded-xl h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Subir PDF ({selectedVentaIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards Superiores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-blue-600" />
            Total Pedidos
          </span>
          <p className="text-xl font-black text-slate-900 mt-1">{metricas.total}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 uppercase flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-amber-600" />
            Total a Cobrar
          </span>
          <p className="text-xl font-black text-amber-600 mt-1">
            $ {metricas.montoPendiente.toLocaleString("es-AR")}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-amber-600 uppercase flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pendientes
          </span>
          <p className="text-xl font-black text-amber-700 mt-1">{metricas.pendientesCount}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-purple-700 uppercase flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Listo p/ Preparar
          </span>
          <p className="text-xl font-black text-purple-700 mt-1">
            {metricas.listosPrepararCount}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Despachados
          </span>
          <p className="text-xl font-black text-emerald-700 mt-1">{metricas.despachadosCount}</p>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-xs ${
            metricas.conFaltaStockCount > 0
              ? "bg-rose-50 border-rose-200"
              : "bg-white border-slate-200"
          }`}
        >
          <span
            className={`text-[11px] font-bold uppercase flex items-center gap-1.5 ${
              metricas.conFaltaStockCount > 0 ? "text-rose-700" : "text-slate-500"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            Alerta Stock
          </span>
          <p
            className={`text-xl font-black mt-1 ${
              metricas.conFaltaStockCount > 0 ? "text-rose-700" : "text-slate-900"
            }`}
          >
            {metricas.conFaltaStockCount}
          </p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Buscador de texto libre */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por N°, Cliente, DNI, Vendedor o Artículo..."
              className="h-10 pl-9 text-xs rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filtro Estado */}
          <div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 outline-none focus:bg-white cursor-pointer"
            >
              <option value="TODOS">Todos los estados</option>
              <option value="PENDIENTE">⏳ Pendiente</option>
              <option value="LISTO_PARA_PREPARAR">📦 Listo p/ Preparar</option>
              <option value="IMPRESO">🖨️ Impreso</option>
              <option value="PREPARADO">✅ Preparado</option>
              <option value="DESPACHADO">🚚 Despachado</option>
            </select>
          </div>

          {/* Filtro Tipo de Envío */}
          <div>
            <select
              value={filtroTipoEnvio}
              onChange={(e) => setFiltroTipoEnvio(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 outline-none focus:bg-white cursor-pointer"
            >
              <option value="TODOS">Toda Logística</option>
              <option value="andreani">🔴 Andreani</option>
              <option value="via cargo">🟢 Vía Cargo</option>
              <option value="retiran aca">🟡 Retiran Acá</option>
            </select>
          </div>

          {/* Filtro Canal / Vendedor */}
          <div className="flex gap-2">
            <select
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 outline-none focus:bg-white cursor-pointer"
            >
              <option value="TODOS">Todos los Canales</option>
              <option value="Mayorista Web">🌐 Mayorista Web</option>
              <option value="Mostrador">🏬 Mostrador</option>
            </select>

            <Button
              type="button"
              variant={filtroSoloHoy ? "default" : "outline"}
              onClick={() => setFiltroSoloHoy((prev) => !prev)}
              className={`h-10 px-3 rounded-xl text-xs font-bold shrink-0 ${
                filtroSoloHoy
                  ? "bg-blue-600 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Solo Hoy
            </Button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Tabla Principal */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-xs font-semibold">Cargando pedidos de venta...</p>
          </div>
        ) : paginatedVentas.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Clock className="h-10 w-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">
              No se encontraron pedidos con los filtros aplicados
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Prueba modificando los filtros de búsqueda o fecha.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-10 text-center py-3">
                    <input
                      type="checkbox"
                      checked={
                        selectedVentaIds.size === paginatedVentas.length &&
                        paginatedVentas.length > 0
                      }
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3">
                    N° / ID
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3">
                    Cliente / Razón Social
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3">
                    Canal / Vendedor
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3">
                    Artículos
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3 text-right">
                    Total
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3 text-center">
                    Fecha
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3 text-center">
                    Logística
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3 text-center">
                    Estado
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 py-3 text-center">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedVentas.map((venta) => {
                  const isExpanded = expandedVentas.has(venta.id);
                  const isSaving = processingIds.has(venta.id);
                  const isSelected = selectedVentaIds.has(venta.id);

                  // Alerta de stock insuficiente
                  const articulosFaltantes = (venta.items || []).filter((item) => {
                    if (!item.productoId || item.esNota) return false;
                    if (serviciosSet.has(item.productoId)) return false;
                    const disp = stockMap.get(item.productoId);
                    return disp !== undefined && disp < item.cantidad;
                  });
                  const tieneFaltaStock =
                    articulosFaltantes.length > 0 && venta.estadoPedido !== "DESPACHADO";

                  return (
                    <React.Fragment key={venta.id}>
                      <TableRow
                        className={`transition-colors border-b border-slate-100 hover:bg-slate-50/80 ${
                          isSelected ? "bg-blue-50/40" : ""
                        }`}
                      >
                        <TableCell className="text-center py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(venta.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                        </TableCell>

                        <TableCell className="py-3">
                          <span
                            className="font-mono text-xs font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 cursor-pointer hover:text-blue-600"
                            onClick={() => handleCopyInfo(venta.id, venta.id)}
                            title="Copiar ID completo"
                          >
                            {venta.numeroVenta ? `#${venta.numeroVenta}` : venta.id.slice(0, 8)}
                          </span>
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900">
                              {venta.cliente || "Consumidor Final"}
                            </span>
                            {(venta.dni || venta.docNro) && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {venta.docTipo === 80 ? "CUIT" : "DNI"}:{" "}
                                {venta.dni || venta.docNro}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="py-3">
                          {venta.vendedor === "Mayorista Web" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                              Mayorista Web
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-700">
                              {venta.vendedor || "Mostrador"}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg gap-1"
                              onClick={() => {
                                setExpandedVentas((prev) => {
                                  const next = new Set(prev);
                                  if (isExpanded) next.delete(venta.id);
                                  else next.add(venta.id);
                                  return next;
                                });
                              }}
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                              {venta.items?.length || 0} ítems
                            </Button>

                            {tieneFaltaStock && (
                              <Badge
                                variant="destructive"
                                className="h-5 px-1.5 text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-300 shadow-none"
                                title={`Falta stock en ${articulosFaltantes.length} artículo(s)`}
                              >
                                <AlertTriangle className="h-3 w-3 mr-0.5" /> Stock
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="py-3 text-right">
                          <span className="text-sm font-black text-slate-900">
                            $ {Number(venta.totalFinal || venta.total).toLocaleString("es-AR")}
                          </span>
                        </TableCell>

                        <TableCell className="py-3 text-center text-xs text-slate-500">
                          {new Date(venta.createdAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>

                        {/* Tipo de Envío */}
                        <TableCell className="py-3 text-center">
                          <div className="relative inline-block">
                            <select
                              value={(venta.tipoEnvio || "andreani").toLowerCase()}
                              onChange={(e) =>
                                handleActualizarTipoEnvio(venta.id, e.target.value)
                              }
                              disabled={isSaving}
                              className={`text-[10px] uppercase font-bold rounded-lg px-2.5 py-1 border outline-none cursor-pointer transition-all shadow-xs ${
                                (venta.tipoEnvio || "andreani").toLowerCase() === "andreani"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : (venta.tipoEnvio || "").toLowerCase() === "via cargo"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : (venta.tipoEnvio || "").toLowerCase() === "retiran aca"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-slate-50 border-slate-200 text-slate-700"
                              }`}
                            >
                              <option value="andreani">🔴 Andreani</option>
                              <option value="via cargo">🟢 Vía Cargo</option>
                              <option value="retiran aca">🟡 Retiran Acá</option>
                            </select>
                            {isSaving && (
                              <Loader2 className="absolute right-1 top-1.5 h-3 w-3 animate-spin text-slate-400" />
                            )}
                          </div>
                        </TableCell>

                        {/* Estado del Pedido */}
                        <TableCell className="py-3 text-center">
                          <div className="relative inline-block">
                            <select
                              value={venta.estadoPedido || "PENDIENTE"}
                              onChange={(e) =>
                                handleActualizarEstado(venta.id, e.target.value)
                              }
                              disabled={isSaving}
                              className={`text-[10px] uppercase font-bold rounded-lg px-2.5 py-1 border outline-none cursor-pointer transition-all shadow-xs ${
                                venta.estadoPedido === "DESPACHADO"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : venta.estadoPedido === "PREPARADO"
                                  ? "bg-blue-100 text-blue-800 border-blue-300"
                                  : venta.estadoPedido === "IMPRESO"
                                  ? "bg-orange-100 text-orange-800 border-orange-300"
                                  : venta.estadoPedido === "LISTO_PARA_PREPARAR"
                                  ? "bg-purple-100 text-purple-800 border-purple-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                            >
                              <option value="PENDIENTE">⏳ Pendiente</option>
                              <option value="LISTO_PARA_PREPARAR">📦 Listo p/ Preparar</option>
                              <option value="IMPRESO">🖨️ Impreso</option>
                              <option value="PREPARADO">✅ Preparado</option>
                              <option value="DESPACHADO">🚚 Despachado</option>
                            </select>
                          </div>
                        </TableCell>

                        {/* Acciones */}
                        <TableCell className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Imprimir Ticket */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleImprimirTicket(venta)}
                              className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                              title="Imprimir Ticket"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>

                            {/* Ver / Imprimir Presupuesto A4 */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAbrirPdfEnNuevaPestana(venta)}
                              className="h-8 w-8 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Ver / Descargar Presupuesto (A4)"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>

                            {/* Fotos de Preparación */}
                            {pedidosConFoto[venta.id] && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleVerFotosPedido(venta)}
                                disabled={loadingFotoId === venta.id}
                                className="h-8 w-8 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title={`Fotos de Preparación Pedido (${pedidosConFoto[venta.id]})`}
                              >
                                {loadingFotoId === venta.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Camera className="h-4 w-4" />
                                )}
                              </Button>
                            )}

                            {/* Editar Pedido */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditarPedido(venta)}
                              className="h-8 w-8 text-amber-600 hover:bg-amber-50 rounded-lg"
                              title="Editar Pedido en Carrito POS"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            {/* Confirmar / Registrar Venta */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setVentaSeleccionada(venta);
                                setIsConfirmDialogOpen(true);
                              }}
                              className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              title="Confirmar y Registrar Venta"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>

                            {/* Eliminar Pedido */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setVentaParaEliminar(venta);
                                setIsEliminarDialogOpen(true);
                              }}
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Eliminar Pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>

                            <div className="w-px h-5 bg-slate-200 mx-0.5" />

                            {/* Comprobante PDF */}
                            {venta.pdfUrl ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDownloadPDF(venta.id)}
                                  className="h-8 w-8 text-slate-600 hover:bg-slate-100 rounded-lg"
                                  title="Ver Comprobante PDF Adjunto"
                                >
                                  <File className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEliminarPDF(venta.id)}
                                  className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Eliminar Comprobante PDF"
                                >
                                  <FileX className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Label
                                  htmlFor={`pdf-upload-row-${venta.id}`}
                                  className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                                  title="Subir Comprobante PDF"
                                >
                                  <Upload className="h-4 w-4" />
                                </Label>
                                <input
                                  id={`pdf-upload-row-${venta.id}`}
                                  type="file"
                                  accept="application/pdf"
                                  className="hidden"
                                  disabled={isUploading}
                                  onChange={(e) => handleUploadPDFRow(venta.id, e)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Vista Expandida de Ítems */}
                      {isExpanded && (
                        <TableRow className="bg-slate-50/60 border-b border-slate-200">
                          <TableCell colSpan={10} className="p-4 space-y-3">
                            {venta.info && (
                              <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200 flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-[10px] font-bold text-amber-800 uppercase block mb-1">
                                    Observaciones / Datos de Envío:
                                  </span>
                                  <p className="text-xs text-slate-700 whitespace-pre-wrap">
                                    {venta.info}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyInfo(venta.id, venta.info || "")}
                                  className="h-7 text-[11px] font-bold text-amber-700 bg-amber-100/60 hover:bg-amber-100 rounded-lg shrink-0"
                                >
                                  {copiedId === venta.id ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                      Copiado
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5 mr-1" />
                                      Copiar Envío
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}

                            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                              <span className="text-[10px] font-bold text-slate-500 uppercase block border-b border-slate-100 pb-1">
                                Detalle de Artículos ({venta.items?.length || 0})
                              </span>
                              <div className="divide-y divide-slate-100">
                                {(venta.items || []).map((item, idx) => {
                                  const esServicio = item.productoId ? serviciosSet.has(item.productoId) : false;
                                  const stockDisp = item.productoId && !esServicio
                                    ? stockMap.get(item.productoId)
                                    : undefined;
                                  const stockInsuficiente =
                                    !esServicio &&
                                    stockDisp !== undefined &&
                                    stockDisp < item.cantidad &&
                                    !item.esNota;

                                  return (
                                    <div
                                      key={idx}
                                      className="py-2 flex items-center justify-between gap-4 text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-bold text-slate-800 uppercase">
                                          {item.nombre}
                                        </span>
                                        {item.productoId && (
                                          <span className="text-[10px] font-mono text-slate-400">
                                            ID: {item.productoId}
                                          </span>
                                        )}
                                        {esServicio && (
                                          <Badge
                                            variant="outline"
                                            className="h-4 px-1 text-[9px] bg-slate-50 text-slate-600 border-slate-200"
                                          >
                                            Servicio
                                          </Badge>
                                        )}
                                        {stockInsuficiente && (
                                          <Badge
                                            variant="destructive"
                                            className="h-4 px-1 text-[9px] bg-rose-100 text-rose-700 border-rose-300"
                                          >
                                            Stock insuficiente (disp: {stockDisp})
                                          </Badge>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-4 shrink-0">
                                        <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md text-[11px]">
                                          x{item.cantidad}
                                        </span>
                                        <span className="text-slate-500 font-medium">
                                          $ {Number(item.precio_unit).toLocaleString("es-AR")} c/u
                                        </span>
                                        <span className="font-black text-slate-900 w-24 text-right">
                                          $ {Number(item.subtotal).toLocaleString("es-AR")}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
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
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-500 font-medium">
              Mostrando{" "}
              <span className="font-bold text-slate-700">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}
              </span>{" "}
              a{" "}
              <span className="font-bold text-slate-700">
                {Math.min(currentPage * ITEMS_PER_PAGE, ventasFiltradas.length)}
              </span>{" "}
              de <span className="font-bold text-slate-700">{ventasFiltradas.length}</span>{" "}
              pedidos
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2 rounded-lg text-xs"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>

              <span className="text-xs font-bold px-2 text-slate-700">
                {currentPage} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 px-2 rounded-lg text-xs"
              >
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Confirmar Pedido */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-900 text-base font-bold">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Confirmar y Registrar Venta
            </DialogTitle>
          </DialogHeader>

          {ventaSeleccionada && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-bold text-emerald-800">Pedido:</span>
                  <span className="font-bold text-emerald-950">
                    #{ventaSeleccionada.numeroVenta || ventaSeleccionada.id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-emerald-800">Cliente:</span>
                  <span className="font-bold text-emerald-950">
                    {ventaSeleccionada.cliente}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-emerald-800">Total a registrar:</span>
                  <span className="font-black text-emerald-950 text-sm">
                    $ {Number(ventaSeleccionada.totalFinal || ventaSeleccionada.total).toLocaleString("es-AR")}
                  </span>
                </div>
              </div>

              <p className="text-slate-600 leading-relaxed">
                Al confirmar, este pedido pasará al registro de <strong>Ventas Realizadas</strong> y se descontará el stock de los artículos correspondientes.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsConfirmDialogOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarPedido}
              disabled={isProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Registrar Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Eliminar Pedido */}
      <Dialog open={isEliminarDialogOpen} onOpenChange={setIsEliminarDialogOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl border-red-200">
          <DialogHeader>
            <DialogTitle className="text-red-900 text-base font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Eliminar Pedido de Venta
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-slate-600 leading-relaxed py-2">
            ¿Está seguro de que desea eliminar definitivamente este pedido de venta? Esta acción no se puede deshacer.
          </p>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEliminarDialogOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={eliminarPedido}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Modal Subir PDF por Lote */}
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl border-blue-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-900 text-base font-bold">
              <Upload className="h-5 w-5 text-blue-600" />
              Subir PDF por Lote
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 text-center">
            <div className="bg-blue-50/70 p-6 rounded-2xl border-2 border-dashed border-blue-200 mb-3">
              <Upload className="h-10 w-10 text-blue-500 mx-auto mb-3" />
              <p className="text-xs text-blue-900 font-bold mb-3">
                Se asociará el comprobante a {selectedVentaIds.size} pedidos seleccionados
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
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl"
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
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBatchDialogOpen(false)}
              disabled={isUploading}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Exportar Excel */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="sm:max-w-[460px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-900 text-base font-bold">
              <FileDown className="h-5 w-5 text-emerald-600" />
              Exportar Pedidos a Excel
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Desde</Label>
                <Input
                  type="date"
                  value={exportDesde}
                  onChange={(e) => setExportDesde(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Hasta</Label>
                <Input
                  type="date"
                  value={exportHasta}
                  onChange={(e) => setExportHasta(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            {exportPuntosVenta.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Filtrar por Puntos de Venta (Opcional)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {exportPuntosVenta.map((pv) => {
                    const isSel = exportPuntosSeleccionados.includes(pv.id);
                    return (
                      <button
                        key={pv.id}
                        type="button"
                        onClick={() =>
                          setExportPuntosSeleccionados((prev) =>
                            isSel ? prev.filter((id) => id !== pv.id) : [...prev, pv.id]
                          )
                        }
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                          isSel
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {pv.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsExportModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExportarExcel}
              disabled={isExporting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <FileDown className="h-4 w-4 mr-1.5" />
              )}
              Descargar Archivo .XLSX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impresión de Ticket Térmico POS */}
      {ventaParaTicket && (
        <TicketImpresion
          ventaId={ventaParaTicket.id}
          numeroVenta={ventaParaTicket.numeroVenta}
          items={ventaParaTicket.items}
          total={Number(ventaParaTicket.totalFinal || ventaParaTicket.total)}
          cliente={ventaParaTicket.cliente}
          metodoPago={ventaParaTicket.metodo_pago || "Efectivo"}
        />
      )}

      {/* Modal Fotos de Preparación */}
      <FotosAuditoriaModal
        open={!!fotosPedido}
        onOpenChange={(open) => {
          if (!open) setFotosPedido(null);
        }}
        fotosVenta={fotosPedido}
      />
    </div>
  );
}
