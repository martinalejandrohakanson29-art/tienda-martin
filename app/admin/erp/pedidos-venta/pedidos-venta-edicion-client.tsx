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
  FileX,
  ArrowLeft,
  Printer,
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
} from "@/app/actions/ventas-mostrador";
import PDFPreview from "./pdf-preview";

type ItemVenta = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [ventaParaFactura, setVentaParaFactura] = useState<Venta | null>(null);
  const facturaRef = React.useRef<HTMLDivElement>(null);

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

  const confirmarEdicion = async () => {
    if (!editingVenta || !ventaParaEditar) return;
    
    try {
      setIsProcessing(true);
      const usuario = "Admin"; // TODO: Obtener usuario actual
      const detalleCambios = "Pedido editado desde la pestaña de Edición y Registro";
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
          mlIdVenta: editingVenta.mlIdVenta,
          mlIdEnvio: editingVenta.mlIdEnvio,
          mlMla: editingVenta.mlMla,
          mlDni: editingVenta.mlDni,
          tipoEnvio: editingVenta.tipoEnvio,
          items: editingVenta.items.map(item => ({
            id: item.productoId,
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
    try {
      setIsProcessing(true);
      await actualizarEstadoPedido(ventaId, nuevoEstado);
      cargarPedidos();
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarTipoEnvio = async (ventaId: string, nuevoTipo: string) => {
    try {
      setIsProcessing(true);
      await actualizarTipoEnvioPedido(ventaId, nuevoTipo);
      cargarPedidos();
    } catch (err) {
      console.error("Error al actualizar tipo de envío:", err);
      alert("Error al actualizar el tipo de envío. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
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

  const handleEliminarPDF = async (ventaId: string) => {
    if (!window.confirm("¿Está seguro que desea eliminar el PDF de este pedido?")) return;

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
                            value={venta.tipoEnvio || "andreani"}
                            onChange={(e) => handleActualizarTipoEnvio(venta.id, e.target.value)}
                            disabled={isProcessing}
                            className="text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border border-slate-200 outline-none cursor-pointer bg-white hover:bg-slate-50 transition-colors"
                          >
                            <option value="andreani">Andreani</option>
                            <option value="via cargo">Via Cargo</option>
                            <option value="Retiran aca">Retiran aca</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <select 
                            value={venta.estadoPedido || "PENDIENTE"}
                            onChange={(e) => handleActualizarEstado(venta.id, e.target.value)}
                            disabled={isProcessing}
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer ${
                              venta.estadoPedido === 'DESPACHADO' ? 'bg-green-100 text-green-700 border-green-200' :
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
                                <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Observaciones / Datos de Envío:</p>
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
                  <Label className="text-sm font-medium mb-1 block">Método de Pago</Label>
                  <select
                    value={editingVenta.metodo_pago}
                    onChange={(e) => setEditingVenta({ ...editingVenta, metodo_pago: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                    <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                    <option value="MercadoLibre">MercadoLibre</option>
                    <option value="MercadoPago">MercadoPago</option>
                    <option value="Cruzada">Cruzada</option>
                    <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                  </select>
                </div>

                {/* Campos Dinámicos según Método de Pago */}
                {(editingVenta.metodo_pago === "Tarjeta de Crédito" || editingVenta.metodo_pago === "Tarjeta de Débito") && (
                  <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 animate-in fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">DNI <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.dni || ""} onChange={(e) => setEditingVenta({ ...editingVenta, dni: e.target.value })} className="bg-white border-blue-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">Teléfono <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.telefono || ""} onChange={(e) => setEditingVenta({ ...editingVenta, telefono: e.target.value })} className="bg-white border-blue-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">N° Cupón <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.cupon || ""} onChange={(e) => setEditingVenta({ ...editingVenta, cupon: e.target.value })} className="bg-white border-blue-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">ID Transacción <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.transaccionId || ""} onChange={(e) => setEditingVenta({ ...editingVenta, transaccionId: e.target.value })} className="bg-white border-blue-200" />
                    </div>
                  </div>
                )}

                {(editingVenta.metodo_pago === "MercadoLibre" || editingVenta.metodo_pago === "mercadopago (ML)") && (
                  <div className="grid grid-cols-2 gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 animate-in fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-indigo-700">Id Venta <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.mlIdVenta || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlIdVenta: e.target.value })} className="bg-white border-indigo-200" placeholder="Obligatorio" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-indigo-700">Id Envío <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.mlIdEnvio || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlIdEnvio: e.target.value })} className="bg-white border-indigo-200" placeholder="Obligatorio" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-indigo-700">MLA <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.mlMla || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlMla: e.target.value })} className="bg-white border-indigo-200" placeholder="Obligatorio" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-indigo-700">Dni <span className="text-slate-400">(Opcional)</span></Label>
                      <Input value={editingVenta.mlDni || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlDni: e.target.value })} className="bg-white border-indigo-200" placeholder="DNI del cliente" />
                    </div>
                  </div>
                )}

                {editingVenta.metodo_pago === "MercadoPago" && (
                  <div className="grid grid-cols-1 gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 animate-in fade-in">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-indigo-700">Id de pago <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.mlIdVenta || ""} onChange={(e) => setEditingVenta({ ...editingVenta, mlIdVenta: e.target.value })} className="bg-white border-indigo-200" placeholder="Obligatorio" />
                    </div>
                  </div>
                )}

                {(editingVenta.metodo_pago === "Cruzada" || editingVenta.metodo_pago === "A Cuenta Corriente") && (
                  <div className="grid grid-cols-2 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-100 animate-in fade-in">
                    {editingVenta.metodo_pago === "Cruzada" && (
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-amber-700">De <span className="text-red-500">*</span></Label>
                        <Input value={editingVenta.de || ""} onChange={(e) => setEditingVenta({ ...editingVenta, de: e.target.value })} className="bg-white border-amber-200" placeholder="Origen" />
                      </div>
                    )}
                    <div className={`space-y-2 ${editingVenta.metodo_pago !== "Cruzada" ? 'col-span-2' : ''}`}>
                      <Label className="text-xs font-bold text-amber-700">{editingVenta.metodo_pago === "A Cuenta Corriente" ? "Cuenta / Proveedor" : "Para"} <span className="text-red-500">*</span></Label>
                      <Input value={editingVenta.para || ""} onChange={(e) => setEditingVenta({ ...editingVenta, para: e.target.value })} className="bg-white border-amber-200" placeholder="Destino / Proveedor" />
                    </div>
                  </div>
                )}
                
                <div className="pt-2">
                  <Label className="text-sm font-medium mb-1 block">Tipo de Envío</Label>
                  <select
                    value={editingVenta.tipoEnvio || "andreani"}
                    onChange={(e) => setEditingVenta({ ...editingVenta, tipoEnvio: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="andreani">Andreani</option>
                    <option value="via cargo">Via Cargo</option>
                    <option value="Retiran aca">Retiran aca</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">Información Adicional</Label>
                  <Textarea
                    value={editingVenta.info || ""}
                    onChange={(e) => setEditingVenta({ ...editingVenta, info: e.target.value })}
                    placeholder="Observaciones, datos de envío, etc."
                    className="border-slate-300"
                    rows={3}
                  />
                </div>

                {/* Sección de carga de PDF */}
                <div className="pt-4 border-t border-slate-200">
                  <Label className="text-sm font-bold text-slate-700 mb-2 block flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Comprobante PDF
                  </Label>
                  
                  {editingVenta.pdfUrl ? (
                    <div className="flex items-center justify-between bg-green-50 p-3 rounded-xl border border-green-100 mb-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <File className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="text-xs text-green-700 truncate font-medium">
                          PDF Adjunto: {editingVenta.pdfUrl.split('/').pop()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-green-700 hover:bg-green-100"
                          onClick={() => window.open(editingVenta.pdfUrl!, '_blank')}
                        >
                          Ver
                        </Button>
                        <Label 
                          htmlFor="pdf-upload" 
                          className="h-7 px-2 flex items-center bg-transparent text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer rounded-md border border-slate-200"
                        >
                          Reemplazar
                        </Label>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <Label 
                        htmlFor="pdf-upload" 
                        className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          {isUploading ? (
                            <Loader2 className="h-6 w-6 animate-spin text-amber-600 mb-2" />
                          ) : (
                            <Upload className="h-6 w-6 text-slate-400 mb-2" />
                          )}
                          <p className="text-xs text-slate-500">
                            {isUploading ? "Subiendo archivo..." : "Click para subir PDF de comprobante"}
                          </p>
                        </div>
                        <input 
                          id="pdf-upload" 
                          type="file" 
                          accept="application/pdf" 
                          className="hidden" 
                          onChange={handleUploadPDF}
                          disabled={isUploading}
                        />
                      </Label>
                    </div>
                  )}
                  <input 
                    id="pdf-upload" 
                    type="file" 
                    accept="application/pdf" 
                    className="hidden" 
                    onChange={handleUploadPDF}
                    disabled={isUploading}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsEditDialogOpen(false);
                setVentaParaEditar(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarEdicion}
              disabled={isProcessing}
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
          <p><span className="font-bold">Razón Social:</span> {venta.cliente || "Consumidor Final"}</p>
          <p><span className="font-bold">I.V.A.:</span> Consumidor Final</p>
          <p><span className="font-bold">CUIT/DNI:</span> {venta.dni || venta.docNro || '-'}</p>
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
