"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Printer,
  ArrowRight,
  RefreshCcw,
  ChevronDown,
  Eye,
  Edit,
  Upload,
  Download,
  File,
  Send,
  Camera,
  X,
} from "lucide-react";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosVenta,
  confirmarPedidoVenta,
  eliminarPedidoVenta,
  actualizarEstadoPedido,
  actualizarEstadoPedidoMasivo,
  obtenerPedidoPorId,
  actualizarPedidoVenta,
  obtenerURLDescargaPDF,
  actualizarTipoEnvioPedido,
} from "@/app/actions/ventas-mostrador";
import { obtenerPedidosConFoto, obtenerFotosPedido } from "@/app/actions/preparacion-pedidos";
import PDFPreview from "./pdf-preview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function ZoomViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const SCALE = 2.8
  const imgRef = useRef<HTMLImageElement>(null)
  const [zoomed, setZoomed] = useState(false)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })

  const displaySrc = src.startsWith("/_next/image")
    ? src
    : `/_next/image?url=${encodeURIComponent(src)}&w=2048&q=90`

  const posFrom = (clientX: number, clientY: number) => {
    const el = imgRef.current
    if (!el) return { x: 50, y: 50 }
    const rect = el.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (zoomed) {
      setZoomed(false)
    } else {
      setOrigin(posFrom(e.clientX, e.clientY))
      setZoomed(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/70 hover:text-white z-10" onClick={onClose}>
        <X className="h-8 w-8" />
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-xs bg-black/40 px-3 py-1 rounded-full pointer-events-none">
        {zoomed ? "Movete sobre la imagen para explorar · click para alejar" : "Click sobre una zona para acercar"}
      </div>
      <img
        ref={imgRef}
        src={displaySrc}
        alt="Zoom"
        draggable={false}
        onClick={handleClick}
        onMouseMove={(e) => { if (zoomed) setOrigin(posFrom(e.clientX, e.clientY)) }}
        onTouchMove={(e) => { if (zoomed) { const t = e.touches[0]; setOrigin(posFrom(t.clientX, t.clientY)) } }}
        className={`max-w-full max-h-[90vh] object-contain rounded shadow-2xl select-none transition-transform duration-150 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        style={{
          transform: zoomed ? `scale(${SCALE})` : "scale(1)",
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
      />
    </div>
  )
}

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
  tipoEnvio?: string;
};

export default function PedidosVentaClient() {
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
  const [selectedVentaIds, setSelectedVentaIds] = useState<Set<string>>(new Set());
  const [pendingN8NSync, setPendingN8NSync] = useState(false);

  // Estado de auditoría de preparación por ventaId (FOTO_CARGADA | AUDITADO | RECHAZADO)
  const [pedidosConFoto, setPedidosConFoto] = useState<Record<string, string>>({});
  const [fotosPedido, setFotosPedido] = useState<{ venta: Venta; fotos: any[] } | null>(null);
  const [loadingFotoId, setLoadingFotoId] = useState<string | null>(null);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);

  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidosVenta(fechaDesde, fechaHasta);
      setVentas(data);
      // Consultamos en lote qué pedidos tienen foto de preparación cargada.
      const ids = data.map((v) => v.id);
      if (ids.length > 0) {
        const res = await obtenerPedidosConFoto(ids);
        if (res.success) setPedidosConFoto(res.estados);
      } else {
        setPedidosConFoto({});
      }
    } catch (err) {
      console.error("Error al cargar pedidos:", err);
      setError("No se pudieron cargar los pedidos de venta");
    } finally {
      setCargando(false);
    }
  };

  const handleVerFotosPedido = async (venta: Venta) => {
    setLoadingFotoId(venta.id);
    try {
      const res = await obtenerFotosPedido(venta.id);
      if (res.success) {
        setFotosPedido({ venta, fotos: res.fotos });
      } else {
        alert("No se pudieron obtener las fotos del servidor de imágenes.");
      }
    } catch (e) {
      console.error("Error al obtener fotos del pedido:", e);
      alert("Fallo la conexión con el servidor de imágenes.");
    } finally {
      setLoadingFotoId(null);
    }
  };

  const STATUS_FOTO: Record<string, { label: string; cls: string }> = {
    FOTO_CARGADA: { label: "Foto cargada", cls: "text-amber-500 hover:text-amber-600 hover:bg-amber-50" },
    AUDITADO: { label: "Aprobado", cls: "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50" },
    RECHAZADO: { label: "Rechazado", cls: "text-red-500 hover:text-red-600 hover:bg-red-50" },
  };

  const handleConfirmarPedido = (venta: Venta) => {
    setVentaSeleccionada(venta);
    setIsConfirmDialogOpen(true);
  };

  const handleEliminarPedido = (venta: Venta) => {
    setVentaParaEliminar(venta);
    setIsEliminarDialogOpen(true);
  };

  const handleVerPDF = (venta: Venta) => {
    window.open(`/admin/erp/pedidos-venta/pdf/${venta.id}`, '_blank');
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

  const confirmarEdicion = async () => {
    if (!editingVenta || !ventaParaEditar) return;

    try {
      setIsProcessing(true);
      const usuario = "Admin"; // TODO: Obtener usuario actual
      const detalleCambios = "Pedido editado desde el ERP";
      const result = await actualizarPedidoVenta(
        ventaParaEditar.id,
        {
          cliente: editingVenta.cliente,
          vendedor: editingVenta.vendedor,
          total: editingVenta.total,
          interes: editingVenta.interes,
          totalFinal: editingVenta.totalFinal,
          metodo_pago: editingVenta.metodo_pago,
          dni: editingVenta.dni,
          telefono: editingVenta.telefono,
          info: editingVenta.info,
          cupon: editingVenta.cupon,
          transaccionId: editingVenta.transaccionId,
          de: editingVenta.de,
          para: editingVenta.para,
          email: editingVenta.email,
          eventoOffline: editingVenta.eventoOffline,
          puntoVentaId: editingVenta.puntoVentaId,
          tipoEnvio: editingVenta.tipoEnvio,
          items: editingVenta.items.map(item => ({
            id: item.productoId,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio_unit: item.precio_unit,
            subtotal: item.subtotal,
            esNota: item.esNota
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


  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedVentaIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedVentaIds(newSelected);
  };

  const handleToggleSelectAll = () => {
    if (selectedVentaIds.size === ventas.length && ventas.length > 0) {
      setSelectedVentaIds(new Set());
    } else {
      setSelectedVentaIds(new Set(ventas.map(v => v.id)));
    }
  };

  const handleDescargarLote = async () => {
    const idsParaDescargar = Array.from(selectedVentaIds).filter(id => {
      const v = ventas.find(venta => venta.id === id);
      return v && v.pdfUrl;
    });

    if (idsParaDescargar.length === 0) {
      alert("No hay pedidos con PDF seleccionados para descargar");
      return;
    }

    setIsProcessing(true);
    let exitos = 0;
    
    for (const id of idsParaDescargar) {
      const venta = ventas.find(v => v.id === id);
      const nombreArchivo = `pedido_${venta?.cliente?.replace(/[^a-zA-Z0-9]/g, '_') || id.slice(0, 8)}.pdf`;
      
      try {
        const result = await obtenerURLDescargaPDF(id, nombreArchivo);
        if (result.success && result.url) {
          const link = document.createElement('a');
          link.href = result.url;
          link.setAttribute('download', nombreArchivo);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          exitos++;
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err) {
        console.error(`Error en descarga de ${id}:`, err);
      }
    }

    setIsProcessing(false);
    setSelectedVentaIds(new Set());
    alert(`Se han procesado ${exitos} descargas correctamente.`);
  };

  const handleSincronizarN8N = () => {
    const pedidosIds = selectedVentaIds.size > 0
      ? Array.from(selectedVentaIds)
      : ventas.map(v => v.id);

    if (pedidosIds.length === 0) {
      alert("No hay pedidos para sincronizar");
      return;
    }

    setPendingN8NSync(true);
  };

  const handleSincronizarN8NConfirm = async () => {
    const pedidosIds = selectedVentaIds.size > 0
      ? Array.from(selectedVentaIds)
      : ventas.map(v => v.id);

    setPendingN8NSync(false);
    setIsProcessing(true);
    try {
      const response = await fetch('/api/webhooks/n8n/pedidos-venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidosIds })
      });

      if (response.ok) {
        alert("Sincronización enviada con éxito");
      } else {
        alert("Error al sincronizar con n8n. Verifique la configuración del servidor.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al intentar sincronizar");
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

  const lotesExistentes = useMemo(() => {
    const grupos = new Map<string, { url: string; clientes: string[]; ids: string[] }>();
    
    ventas.forEach(v => {
      if (v.pdfUrl) {
        if (!grupos.has(v.pdfUrl)) {
          grupos.set(v.pdfUrl, { url: v.pdfUrl, clientes: [], ids: [] });
        }
        const grupo = grupos.get(v.pdfUrl)!;
        grupo.clientes.push(v.cliente || "Sin nombre");
        grupo.ids.push(v.id);
      }
    });

    // Solo mostramos como "lote" si hay 2 o más pedidos compartiendo el mismo archivo
    return Array.from(grupos.values()).filter(g => g.ids.length > 1);
  }, [ventas]);

  useEffect(() => {
    cargarPedidos();
  }, [fechaDesde, fechaHasta]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-600" />
            Pedidos de Venta
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de pedidos de venta pendientes de confirmación
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
                  onClick={handleDescargarLote}
                  disabled={isProcessing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Descargar PDFs ({Array.from(selectedVentaIds).filter(id => ventas.find(v => v.id === id)?.pdfUrl).length})
                </Button>
              )}
              <Button
                onClick={handleSincronizarN8N}
                disabled={isProcessing || ventas.length === 0}
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {selectedVentaIds.size > 0 ? 'Sincronizar Selección' : 'Sincronizar Todo'}
              </Button>
            </div>
          </div>
        </div>

        {/* Lotes Detectados */}
        {lotesExistentes.length > 0 && (
          <div className="mb-6 bg-blue-50/50 rounded-xl border border-blue-200 p-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Lotes de PDFs Detectados ({lotesExistentes.length})
            </h3>
            <div className="flex flex-col gap-2">
              {lotesExistentes.map((lote, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPDF(lote.ids[0])}
                  className="bg-white border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm flex flex-col items-start h-auto py-2.5 px-4 gap-2 w-full max-w-2xl"
                  title={`Descargar PDF compartido por ${lote.clientes.length} pedidos`}
                >
                  <div className="flex items-center gap-2 w-full border-b border-blue-100 pb-1 mb-1">
                    <Download className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase text-blue-400">PDF Compartido ({lote.clientes.length} pedidos)</span>
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    {lote.clientes.map((cliente, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-blue-400" />
                        <span className="text-[11px] font-medium text-left">
                          {cliente}
                        </span>
                      </div>
                    ))}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : ventas.length === 0 ? (
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
                      checked={selectedVentaIds.size === ventas.length && ventas.length > 0}
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
                {ventas.map((venta) => {
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
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer transition-colors ${
                              (venta.tipoEnvio || "andreani").toLowerCase() === 'andreani' ? 'bg-red-100 text-red-700 border-red-200' :
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
                              onClick={() => handleVerPDF(venta)}
                              className="border-blue-600 text-blue-700 hover:bg-blue-50"
                              title="Ver PDF del Pedido"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {venta.pdfUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadPDF(venta.id)}
                                className="border-green-600 text-green-700 hover:bg-green-50"
                                title="Descargar Comprobante PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {pedidosConFoto[venta.id] && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleVerFotosPedido(venta)}
                                disabled={loadingFotoId === venta.id}
                                className={`border-transparent ${STATUS_FOTO[pedidosConFoto[venta.id]]?.cls || "text-slate-400 hover:bg-slate-50"}`}
                                title={`Foto de preparación — ${STATUS_FOTO[pedidosConFoto[venta.id]]?.label || pedidosConFoto[venta.id]}`}
                              >
                                {loadingFotoId === venta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-slate-50/50">
                          <TableCell colSpan={8} className="py-3 px-6">
                            {venta.info && (
                              <div className="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                                <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Observaciones / Datos de Envío:</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{venta.info}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              {venta.items?.length > 0 ? (
                                venta.items.map((item, idx) => (
                                  item.esNota ? (
                                    <div key={idx} className="flex items-center gap-2 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0 text-amber-800">
                                      <FileText className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                      <span className="italic">{item.nombre}</span>
                                      <span className="text-[10px] font-black bg-amber-100 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase ml-auto">Nota</span>
                                    </div>
                                  ) : (
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
                                  )
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
        <DialogContent className="sm:max-w-[600px] rounded-2xl border-amber-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900">
              <Edit className="h-5 w-5" />
              Editar Pedido de Venta
            </DialogTitle>
          </DialogHeader>
          {isProcessing ? (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-4" />
              <p className="text-slate-600">Cargando datos del pedido...</p>
            </div>
          ) : editingVenta ? (
            <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-800">
                  <strong>ID Pedido:</strong> {editingVenta.id.slice(0, 8)}
                </p>
                <p className="text-sm text-amber-800">
                  <strong>Fecha:</strong> {new Date(editingVenta.createdAt).toLocaleDateString("es-AR")}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Cliente</Label>
                  <Input
                    value={editingVenta.cliente}
                    onChange={(e) => setEditingVenta({ ...editingVenta, cliente: e.target.value })}
                    className="border-slate-300"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Vendedor</Label>
                  <Input
                    value={editingVenta.vendedor}
                    onChange={(e) => setEditingVenta({ ...editingVenta, vendedor: e.target.value })}
                    className="border-slate-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Total</Label>
                    <Input
                      type="number"
                      value={editingVenta.total}
                      onChange={(e) => setEditingVenta({ ...editingVenta, total: Number(e.target.value) })}
                      className="border-slate-300"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Interés</Label>
                    <Input
                      type="number"
                      value={editingVenta.interes}
                      onChange={(e) => setEditingVenta({ ...editingVenta, interes: Number(e.target.value) })}
                      className="border-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Total Final</Label>
                  <Input
                    type="number"
                    value={editingVenta.totalFinal}
                    onChange={(e) => setEditingVenta({ ...editingVenta, totalFinal: Number(e.target.value) })}
                    className="border-slate-300"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Tipo de Envío</Label>
                  <select
                    value={(editingVenta.tipoEnvio || "andreani").toLowerCase()}
                    onChange={(e) => setEditingVenta({ ...editingVenta, tipoEnvio: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors ${
                      (editingVenta.tipoEnvio || "andreani").toLowerCase() === 'andreani' ? 'bg-red-50 border-red-200 text-red-900' :
                      (editingVenta.tipoEnvio || '').toLowerCase() === 'via cargo' ? 'bg-green-50 border-green-200 text-green-900' :
                      (editingVenta.tipoEnvio || '').toLowerCase() === 'retiran aca' ? 'bg-yellow-50 border-yellow-200 text-yellow-900' :
                      'border-slate-300'
                    }`}
                  >
                    <option value="andreani">Andreani</option>
                    <option value="via cargo">Via Cargo</option>
                    <option value="retiran aca">Retiran aca</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Método de Pago</Label>
                  <Input
                    value={editingVenta.metodo_pago}
                    onChange={(e) => setEditingVenta({ ...editingVenta, metodo_pago: e.target.value })}
                    className="border-slate-300"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">DNI</Label>
                  <Input
                    value={editingVenta.dni || ""}
                    onChange={(e) => setEditingVenta({ ...editingVenta, dni: e.target.value })}
                    className="border-slate-300"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Teléfono</Label>
                  <Input
                    value={editingVenta.telefono || ""}
                    onChange={(e) => setEditingVenta({ ...editingVenta, telefono: e.target.value })}
                    className="border-slate-300"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Email</Label>
                  <Input
                    value={editingVenta.email || ""}
                    onChange={(e) => setEditingVenta({ ...editingVenta, email: e.target.value })}
                    className="border-slate-300"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Observaciones / Datos de Envío</Label>
                  <Textarea
                    value={editingVenta.info || ""}
                    onChange={(e) => setEditingVenta({ ...editingVenta, info: e.target.value })}
                    className="border-slate-300"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-slate-600">Error al cargar los datos del pedido</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingVenta(null);
                setVentaParaEditar(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarEdicion}
              disabled={isProcessing || !editingVenta}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingN8NSync}
        onOpenChange={setPendingN8NSync}
        title="Sincronizar con n8n"
        description={`¿Desea enviar ${selectedVentaIds.size > 0 ? 'los pedidos seleccionados' : 'todos los pedidos listados'} a n8n para su procesamiento?`}
        confirmLabel="Sincronizar"
        onConfirm={handleSincronizarN8NConfirm}
      />

      {/* Modal de Fotos de Preparación del Pedido */}
      <Dialog open={!!fotosPedido} onOpenChange={(open) => { if (!open) { setFotosPedido(null); setFotoExpandida(null); } }}>
        <DialogContent className="sm:max-w-[700px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Camera className="h-5 w-5" />
              Fotos de Preparación — Pedido #{fotosPedido?.venta?.numeroVenta}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {fotosPedido && fotosPedido.fotos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                {fotosPedido.fotos.map((foto: any, i: number) => (
                  <div
                    key={foto.id || i}
                    className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 cursor-zoom-in"
                    onClick={() => setFotoExpandida(foto.url)}
                  >
                    <img src={foto.url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {i + 1}/{fotosPedido.fotos.length}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400">
                <Camera className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">No hay fotos cargadas para este pedido</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFotosPedido(null); setFotoExpandida(null); }} className="rounded-xl">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visor a pantalla completa con zoom */}
      {fotoExpandida && (
        <ZoomViewer src={fotoExpandida} onClose={() => setFotoExpandida(null)} />
      )}
    </div>
  );
}
