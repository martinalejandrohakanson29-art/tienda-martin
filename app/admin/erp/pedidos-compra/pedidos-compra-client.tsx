"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import {
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  RefreshCcw,
  ChevronDown,
  Eye,
  Download,
  Search,
  AlertTriangle,
  CheckCircle,
  Save,
  Edit,
  Send,
} from "lucide-react";

import { formatPrice } from "@/lib/utils";
import {
  obtenerPedidosCompra,
  confirmarPedidoCompra,
  eliminarPedidoCompra,
  actualizarEstadoPedidoCompra,
  obtenerPedidoCompraPorId,
  actualizarPedidoCompra,
  obtenerURLDescargaPDFCompra,
  actualizarFechaCompra,
} from "@/app/actions/compras";
import { obtenerProveedores } from "@/app/actions/listas";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ItemCompra = {
  id?: string;
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
  margenGanancia?: number;
};

export type Compra = {
  id: string;
  proveedor: string;
  comprador: string;
  total: number;
  interes: number;
  descuento: number;
  totalFinal: number;
  metodo_pago: string;
  moneda?: 'ARS' | 'USD';
  createdAt: string;
  fechaCarga?: string;
  fechaIngreso?: string | null;
  tipoCompra: string;
  items: ItemCompra[];
  dni?: string | null;
  telefono?: string | null;
  info?: string | null;
  estadoPedido?: string | null;
  pdfUrl?: string | null;
  numeroCompra?: number;
  proveedorId?: string | null;
};

interface PedidosCompraClientProps {
  initialData: any[];
  dolarCotizacion?: number;
  factorFob?: number;
  onEditarPedido?: (compra: Compra) => void;
  onRegistrarPedido?: (compra: Compra) => void;
}

export function PedidosCompraClient({ initialData, dolarCotizacion = 1, factorFob = 1, onEditarPedido, onRegistrarPedido }: PedidosCompraClientProps) {
  const [compras, setCompras] = useState<Compra[]>(initialData as Compra[]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEliminarDialogOpen, setIsEliminarDialogOpen] = useState(false);
  const [compraParaEliminar, setCompraParaEliminar] = useState<Compra | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedCompras, setExpandedCompras] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingN8NSync, setPendingN8NSync] = useState(false);

  // Editing state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCompra, setEditingCompra] = useState<Compra | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showProvListEdit, setShowProvListEdit] = useState(false);
  const [impactarCostos, setImpactarCostos] = useState(false);

  const totalesPorMoneda = useMemo(() => {
    return compras.reduce(
      (acc, c) => {
        const moneda = c.moneda === "USD" ? "USD" : "ARS";
        acc[moneda] += Number(c.totalFinal) || 0;
        return acc;
      },
      { ARS: 0, USD: 0 }
    );
  }, [compras]);

  const getMarginColor = (m: number) => {
    if (m > 60) return "text-fuchsia-600 font-bold";
    if (m > 50) return "text-orange-600 font-bold";
    if (m >= 40) return "text-yellow-600 font-bold";
    if (m < 40) return "text-red-600 font-bold";
    return "text-slate-600";
  };

  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const res = await obtenerPedidosCompra();
      if (res.success && res.data) {
        setCompras(res.data as any);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      console.error("Error al cargar pedidos:", err);
      setError("No se pudieron cargar los pedidos de compra");
    } finally {
      setCargando(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === compras.length && compras.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(compras.map(c => c.id)));
    }
  };

  const handleEliminarPedido = (compra: Compra) => {
    setCompraParaEliminar(compra);
    setIsEliminarDialogOpen(true);
  };

  const handleVerPDF = (compra: Compra) => {
    window.open(`/admin/erp/pedidos-compra/pdf/${compra.id}`, '_blank');
  };

  // Carga los datos frescos del pedido y abre el flujo de edición o de
  // registro (compra efectiva), delegando al padre si está embebido en
  // /admin/compras, o usando el diálogo local si es la página standalone.
  const cargarPedidoParaAccion = async (compra: Compra, modo: "editar" | "registrar") => {
    setIsProcessing(true);
    try {
      const data = await obtenerPedidoCompraPorId(compra.id);
      if (!data) return;

      if (modo === "editar" && onEditarPedido) {
        onEditarPedido(data as unknown as Compra);
        return;
      }
      if (modo === "registrar" && onRegistrarPedido) {
        onRegistrarPedido(data as unknown as Compra);
        return;
      }

      const mappedItems = data.items.map((i: any) => ({
        ...i,
        margenGanancia: i.margenGanancia || 50
      }));
      setEditingCompra({ ...data, items: mappedItems } as Compra);
      setImpactarCostos(false);
      setRegistrando(modo === "registrar");
      setIsEditDialogOpen(true);
    } catch (err) {
      console.error(`Error al cargar pedido para ${modo}:`, err);
      alert("Error al cargar los datos del pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditarPedido = (compra: Compra) => cargarPedidoParaAccion(compra, "editar");
  const handleConfirmarPedido = (compra: Compra) => cargarPedidoParaAccion(compra, "registrar");

  // actualizarPedidoCompra espera fechaCompra/fechaIngreso como "YYYY-MM-DD".
  // editingCompra guarda fechaCarga/fechaIngreso como ISO completo (o "" si el
  // usuario limpió el input de fecha). null/undefined = no tocar ese campo;
  // "" = limpiarlo explícitamente; cualquier otro string = normalizar a fecha corta.
  const toDateOnly = (iso?: string | null): string | undefined => {
    if (iso === null || iso === undefined) return undefined;
    if (iso === "") return "";
    return new Date(iso).toISOString().split('T')[0];
  };

  const confirmarEdicion = async () => {
    if (!editingCompra) return;

    try {
      setIsProcessing(true);
      const result = await actualizarPedidoCompra(
        editingCompra.id,
        {
          ...editingCompra,
          fechaCompra: toDateOnly(editingCompra.fechaCarga),
          fechaIngreso: toDateOnly(editingCompra.fechaIngreso),
          impactarCostos
        },
        "Admin", // TODO: Get actual user
        "Pedido editado desde el ERP"
      );

      if (result.success) {
        setIsEditDialogOpen(false);
        setEditingCompra(null);
        cargarPedidos();
      } else {
        alert(result.error || "Error al actualizar el pedido");
      }
    } catch (err) {
      console.error("Error al confirmar edición:", err);
      alert("Error al actualizar el pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  // Guarda los cambios del pedido y lo registra como compra efectiva (suma
  // stock, impacta costos si corresponde y genera el movimiento a Cuenta
  // Corriente), reutilizando los mismos datos del diálogo de edición.
  const handleRegistrarDesdeEdicion = async () => {
    if (!editingCompra) return;

    try {
      setIsProcessing(true);
      const resActualizar = await actualizarPedidoCompra(
        editingCompra.id,
        {
          ...editingCompra,
          fechaCompra: toDateOnly(editingCompra.fechaCarga),
          fechaIngreso: toDateOnly(editingCompra.fechaIngreso),
          impactarCostos: false
        },
        "Admin", // TODO: Get actual user
        "Datos actualizados al registrar como compra efectiva"
      );

      if (!resActualizar.success) {
        alert(resActualizar.error || "Error al actualizar el pedido");
        return;
      }

      const resConfirmar = await confirmarPedidoCompra(editingCompra.id, {
        impactarCostos,
        items: editingCompra.items,
        usuario: "Admin", // TODO: Get actual user
        moneda: editingCompra.moneda
      });

      if (resConfirmar.success) {
        setIsEditDialogOpen(false);
        setEditingCompra(null);
        setRegistrando(false);
        cargarPedidos();
      } else {
        alert(resConfirmar.error || "Los datos se guardaron pero no se pudo confirmar la recepción");
      }
    } catch (err) {
      console.error("Error al registrar pedido:", err);
      alert("Error al registrar el pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  const eliminarPedido = async () => {
    if (!compraParaEliminar) return;

    try {
      setIsProcessing(true);
      const result = await eliminarPedidoCompra(compraParaEliminar.id);
      if (result.success) {
        setCompraParaEliminar(null);
        setIsEliminarDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al eliminar el pedido");
      }
    } catch (err) {
      console.error("Error al eliminar pedido:", err);
      alert("Error al eliminar el pedido. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarEstado = async (compraId: string, nuevoEstado: string) => {
    try {
      setIsProcessing(true);
      const result = await actualizarEstadoPedidoCompra(compraId, nuevoEstado);
      if (result.success) {
        cargarPedidos();
      } else {
        alert(result.error || "Error al actualizar el estado");
      }
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el estado. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActualizarFecha = async (compraId: string, nuevaFecha: string) => {
    try {
      setIsProcessing(true);
      const result = await actualizarFechaCompra(compraId, nuevaFecha);
      if (result.success) {
        cargarPedidos();
      } else {
        alert(result.error || "Error al actualizar la fecha");
      }
    } catch (err) {
      console.error("Error al actualizar fecha:", err);
      alert("Error al actualizar la fecha. Intente nuevamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPDF = async (compraId: string) => {
    try {
      setIsProcessing(true);
      const result = await obtenerURLDescargaPDFCompra(compraId);
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

  const handleBatchDownload = async () => {
    const idsToDownload = Array.from(selectedIds).filter(id => {
      const c = compras.find(comp => comp.id === id);
      return c && c.pdfUrl;
    });

    if (idsToDownload.length === 0) {
      alert("No hay pedidos con PDF seleccionados para descargar");
      return;
    }

    setIsProcessing(true);
    let successCount = 0;

    for (const id of idsToDownload) {
      const compra = compras.find(c => c.id === id);
      const fileName = `pedido_compra_${compra?.proveedor?.replace(/[^a-zA-Z0-9]/g, '_') || id.slice(0, 8)}.pdf`;

      try {
        const result = await obtenerURLDescargaPDFCompra(id);
        if (result.success && result.url) {
          const link = document.createElement('a');
          link.href = result.url;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err) {
        console.error(`Error downloading ${id}:`, err);
      }
    }

    setIsProcessing(false);
    setSelectedIds(new Set());
    alert(`Se han procesado ${successCount} descargas.`);
  };

  const handleSincronizarN8N = () => {
    const pedidosIds = selectedIds.size > 0
      ? Array.from(selectedIds)
      : compras.map(v => v.id);

    if (pedidosIds.length === 0) {
      alert("No hay pedidos para sincronizar");
      return;
    }

    setPendingN8NSync(true);
  };

  const handleSincronizarN8NConfirm = async () => {
    const pedidosIds = selectedIds.size > 0
      ? Array.from(selectedIds)
      : compras.map(v => v.id);

    setPendingN8NSync(false);
    setIsProcessing(true);
    try {
      const response = await fetch('/api/webhooks/n8n/pedidos-compra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidosIds })
      });

      if (response.ok) {
        alert("Sincronización enviada con éxito");
      } else {
        alert("Error al sincronizar con n8n.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al intentar sincronizar");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const fetchProveedores = async () => {
      const res = await obtenerProveedores();
      if (res.success && res.data) setProveedores(res.data);
    };
    fetchProveedores();
  }, []);

  useEffect(() => {
    cargarPedidos();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="h-8 w-8 text-indigo-600" />
            Pedidos de Compra
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de pedidos de compra a proveedores pendientes de recibir
          </p>
        </div>

        {/* Resumen de totales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Total Final en Pesos ({compras.filter(c => c.moneda !== "USD").length} pedidos)</span>
            <span className="text-xl font-bold text-slate-900">{formatPrice(totalesPorMoneda.ARS)}</span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Total Final en Dólares ({compras.filter(c => c.moneda === "USD").length} pedidos)</span>
            <span className="text-xl font-bold text-slate-900">US$ {totalesPorMoneda.USD.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-end gap-2">
              <Button
                onClick={cargarPedidos}
                disabled={cargando}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6"
              >
                {cargando ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Actualizar
                  </>
                )}
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  onClick={handleBatchDownload}
                  disabled={isProcessing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  PDFs ({Array.from(selectedIds).filter(id => compras.find(c => c.id === id)?.pdfUrl).length})
                </Button>
              )}
              <Button
                onClick={handleSincronizarN8N}
                disabled={isProcessing || compras.length === 0}
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {selectedIds.size > 0 ? 'Sincronizar Selección' : 'Sincronizar Todo'}
              </Button>
            </div>
          </div>
        </div>

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
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : compras.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">
                No hay pedidos de compra en este período
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 border-b-2 border-slate-200">
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === compras.length && compras.length > 0}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </TableHead>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead className="text-right">Total Final</TableHead>
                  <TableHead className="text-right">Fecha</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Metodo</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.map((compra) => {
                  const isExpanded = expandedCompras.has(compra.id);
                  return (
                    <React.Fragment key={compra.id}>
                      <TableRow className={`hover:bg-slate-50 align-top ${selectedIds.has(compra.id) ? 'bg-indigo-50/50' : ''}`}>
                        <TableCell className="py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(compra.id)}
                            onChange={() => handleToggleSelect(compra.id)}
                            className="rounded border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-500 py-4">
                          {compra.numeroCompra || compra.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 py-4">
                          {compra.proveedor || "Sin proveedor"}
                        </TableCell>
                        <TableCell className="text-slate-700 py-4">
                          {compra.comprador}
                        </TableCell>
                        <TableCell className="py-4">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" onClick={() => {
                            const newExpanded = new Set(expandedCompras);
                            if (isExpanded) newExpanded.delete(compra.id);
                            else newExpanded.add(compra.id);
                            setExpandedCompras(newExpanded);
                          }}>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            <span className="ml-1 text-xs">Ver ({compra.items?.length || 0})</span>
                          </Button>
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-900 py-4">
                          {formatPrice(compra.totalFinal)}
                        </TableCell>
                        <TableCell className="text-right py-4">
                          <div className="flex flex-col items-end gap-1">
                            <Input
                              type="date"
                              value={new Date(compra.fechaCarga || compra.createdAt).toISOString().split('T')[0]}
                              onChange={(e) => handleActualizarFecha(compra.id, e.target.value)}
                              disabled={isProcessing}
                              className="h-8 text-[10px] w-28 border-slate-200 focus:border-indigo-500"
                            />
                            {compra.fechaIngreso && (
                              <span className="text-[9px] text-blue-600 font-bold">
                                Ingreso: {new Date(compra.fechaIngreso).toLocaleDateString('es-AR')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <select
                            value={compra.estadoPedido || "PENDIENTE"}
                            onChange={(e) => handleActualizarEstado(compra.id, e.target.value)}
                            disabled={isProcessing}
                            className={`text-[10px] uppercase font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer ${compra.estadoPedido === 'RECIBIDO' ? 'bg-green-100 text-green-700 border-green-200' :
                              compra.estadoPedido === 'CANCELADO' ? 'bg-red-100 text-red-700 border-red-200' :
                                'bg-amber-100 text-amber-700 border-amber-200'
                              }`}
                          >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="RECIBIDO">Recibido</option>
                            <option value="CANCELADO">Cancelado</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${compra.metodo_pago === 'Efectivo' ? 'bg-green-100 text-green-700' :
                            compra.metodo_pago === 'Transferencia' ? 'bg-blue-100 text-blue-700' :
                              compra.metodo_pago === 'A Cuenta Corriente' ? 'bg-amber-100 text-amber-700' :
                                compra.metodo_pago === 'Cheque' ? 'bg-indigo-100 text-indigo-700' :
                                  compra.metodo_pago === 'Mercado Pago' ? 'bg-sky-100 text-sky-700' :
                                    'bg-slate-100 text-slate-700'
                            }`}>
                            {compra.metodo_pago}
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerPDF(compra)}
                              className="border-blue-600 text-blue-700 hover:bg-blue-50"
                              title="Ver Detalles"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditarPedido(compra)}
                              className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                              title="Editar Pedido"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmarPedido(compra)}
                              className="border-green-600 text-green-700 hover:bg-green-50"
                              title="Registrar Compra"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            {compra.pdfUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadPDF(compra.id)}
                                className="border-slate-600 text-slate-700 hover:bg-slate-50"
                                title="Descargar PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEliminarPedido(compra)}
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
                          <TableCell colSpan={9} className="py-3 px-6">
                            {compra.info && (
                              <div className="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                                <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Observaciones:</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{compra.info}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              {compra.items?.length > 0 ? (
                                compra.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                    <div>
                                      <span className="font-semibold text-slate-700 uppercase">{item.nombre}</span>
                                      <span className="text-[10px] text-slate-400 ml-2 font-mono uppercase">ID: {item.productoId || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="text-[10px] font-medium text-slate-500">{formatPrice(item.costo_unit)} c/u</span>
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

      {/* Eliminate Dialog */}
      <Dialog open={isEliminarDialogOpen} onOpenChange={setIsEliminarDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl border-red-200">
          <DialogHeader>
            <DialogTitle className="text-red-900 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Eliminar Pedido de Compra
            </DialogTitle>
          </DialogHeader>
          {compraParaEliminar && (
            <div className="mt-4">
              <p className="text-sm text-slate-600">
                ¿Desea eliminar definitivamente este pedido de compra? Se revertirá el incremento de stock realizado al crear el pedido. Esta acción no se puede deshacer.
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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[950px] rounded-3xl max-h-[95vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
          <div className="p-6 border-b bg-white flex-shrink-0 flex justify-between items-center">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-indigo-900 text-xl font-bold">
                {registrando ? (
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                ) : (
                  <Edit className="h-6 w-6 text-amber-500" />
                )}
                {registrando ? "Registrar Compra del Pedido" : "Editando Pedido de Compra"} #{editingCompra?.numeroCompra || editingCompra?.id.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>
            <Button variant="ghost" size="icon" onClick={() => { setIsEditDialogOpen(false); setRegistrando(false); }} className="rounded-full">
              <RefreshCcw className="h-4 w-4 rotate-45" />
            </Button>
          </div>

          {editingCompra && (
            <div className="flex-grow overflow-hidden flex flex-col p-6 gap-6 bg-slate-50/30">
              <div className="grid grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
                <div className="space-y-1.5 relative">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Proveedor</Label>
                  <Input
                    value={editingCompra.proveedor}
                    className="h-10 border-slate-200 focus:border-indigo-500"
                    onChange={e => {
                      const val = e.target.value;
                      setEditingCompra(prev => prev ? { ...prev, proveedor: val } : null);
                      setShowProvListEdit(true);
                    }}
                    onFocus={() => setShowProvListEdit(true)}
                  />
                  {showProvListEdit && (
                    <div className="absolute z-[100] w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto mt-1 animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-2 border-b bg-slate-50 flex items-center justify-between sticky top-0 z-10">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Resultados de búsqueda</span>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowProvListEdit(false)}>Cerrar</Button>
                      </div>
                      {proveedores.filter(p =>
                        p.razonSocial.toLowerCase().includes(editingCompra.proveedor.toLowerCase()) ||
                        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(editingCompra.proveedor.toLowerCase())) ||
                        p.cuit?.includes(editingCompra.proveedor)
                      ).length > 0 ? (
                        proveedores.filter(p =>
                          p.razonSocial.toLowerCase().includes(editingCompra.proveedor.toLowerCase()) ||
                          (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(editingCompra.proveedor.toLowerCase())) ||
                          p.cuit?.includes(editingCompra.proveedor)
                        ).map(p => (
                          <div
                            key={p.id}
                            className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group"
                            onClick={() => {
                              setEditingCompra(prev => prev ? { ...prev, proveedor: p.razonSocial, proveedorId: p.id } : null);
                              setShowProvListEdit(false);
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-700">{p.razonSocial}</span>
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
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Método Pago</Label>
                  <select
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                    value={editingCompra.metodo_pago}
                    onChange={e => setEditingCompra(prev => prev ? { ...prev, metodo_pago: e.target.value } : null)}
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Mercado Pago">Mercado Pago</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Carga</Label>
                  <Input
                    type="date"
                    className="h-10 border-slate-200"
                    value={editingCompra.fechaCarga ? new Date(editingCompra.fechaCarga).toISOString().split('T')[0] : (editingCompra.createdAt ? new Date(editingCompra.createdAt).toISOString().split('T')[0] : "")}
                    onChange={e => setEditingCompra(prev => prev ? { ...prev, fechaCarga: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Ingreso</Label>
                  <Input
                    type="date"
                    className="h-10 border-slate-200"
                    value={editingCompra.fechaIngreso ? new Date(editingCompra.fechaIngreso).toISOString().split('T')[0] : ""}
                    onChange={e => setEditingCompra(prev => prev ? { ...prev, fechaIngreso: e.target.value } : null)}
                  />
                </div>
              </div>

              <div className="flex-grow bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingCompra.items.map((item, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-medium text-slate-700 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-bold">{item.nombre}</span>
                              <span className="text-[9px] text-slate-400 font-mono uppercase">{item.productoId}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <Input
                              type="number"
                              className="w-16 h-8 mx-auto text-center text-xs font-bold border-slate-200"
                              value={item.cantidad}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setEditingCompra(prev => {
                                  if (!prev) return null;
                                  const newItems = [...prev.items];
                                  newItems[idx] = { ...newItems[idx], cantidad: val, subtotal: val * newItems[idx].costo_unit };
                                  const newTotal = newItems.reduce((acc, i) => acc + i.subtotal, 0);
                                  return { ...prev, items: newItems, total: newTotal, totalFinal: newTotal + (prev.interes || 0) - (prev.descuento || 0) };
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400 text-xs">$</span>
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="w-24 h-8 text-center text-xs font-bold border-slate-200"
                                value={item.costo_unit}
                                onChange={e => {
                                  const val = parseFloat(e.target.value.replace(',', '.')) || 0;
                                  setEditingCompra(prev => {
                                    if (!prev) return null;
                                    const newItems = [...prev.items];
                                    newItems[idx] = { ...newItems[idx], costo_unit: val, subtotal: val * newItems[idx].cantidad };
                                    const newTotal = newItems.reduce((acc, i) => acc + i.subtotal, 0);
                                    return { ...prev, items: newItems, total: newTotal, totalFinal: newTotal + (prev.interes || 0) - (prev.descuento || 0) };
                                  });
                                }}
                              />
                            </div>
                            {(editingCompra?.moneda ?? 'ARS') === 'USD' && item.costo_unit > 0 && (
                              <div className="text-[10px] text-blue-500 text-center mt-0.5">= ${Math.round(item.costo_unit * dolarCotizacion * factorFob).toLocaleString('es-AR')}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className={`w-16 h-8 text-center text-xs border-slate-200 ${getMarginColor(item.margenGanancia ?? 50)}`}
                                value={item.margenGanancia ?? 50}
                                onChange={e => {
                                  const val = parseFloat(e.target.value.replace(',', '.')) || 0;
                                  setEditingCompra(prev => {
                                    if (!prev) return null;
                                    const newItems = [...prev.items];
                                    newItems[idx] = { ...newItems[idx], margenGanancia: val };
                                    return { ...prev, items: newItems };
                                  });
                                }}
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
                                className="w-24 h-8 text-center text-xs font-bold text-emerald-600 border-slate-200"
                                value={Math.round(((editingCompra?.moneda ?? 'ARS') === 'USD' ? item.costo_unit * dolarCotizacion * factorFob : item.costo_unit) * (1 + (item.margenGanancia ?? 50) / 100))}
                                onChange={e => {
                                  const val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                                  const cost = item.costo_unit;
                                  if (cost > 0) {
                                    const newMargin = Math.round(((val - cost) / cost) * 100 * 100) / 100;
                                    setEditingCompra(prev => {
                                      if (!prev) return null;
                                      const newItems = [...prev.items];
                                      newItems[idx] = { ...newItems[idx], margenGanancia: newMargin };
                                      return { ...prev, items: newItems };
                                    });
                                  }
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right py-3 font-bold text-slate-700 pr-6">
                            {formatPrice(item.subtotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-col gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
                <div className="flex justify-between items-end">
                  <div className="flex gap-10">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Base</Label>
                      <p className="text-xl font-bold text-slate-900">{formatPrice(editingCompra.total)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interés (+)</Label>
                      <Input
                        type="number"
                        className="h-8 w-24 text-xs font-bold"
                        value={editingCompra.interes || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setEditingCompra(prev => prev ? { ...prev, interes: val, totalFinal: (prev.total || 0) + val - (prev.descuento || 0) } : null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Descuento (-)</Label>
                      <Input
                        type="number"
                        className="h-8 w-24 text-xs font-bold text-red-600"
                        value={editingCompra.descuento || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setEditingCompra(prev => prev ? { ...prev, descuento: val, totalFinal: (prev.total || 0) + (prev.interes || 0) - val } : null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Final</Label>
                      <p className="text-3xl font-black text-indigo-600 tracking-tighter">{formatPrice(editingCompra.totalFinal)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-4">
                    <div className="bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 flex items-center gap-4 shadow-sm flex-wrap">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="editImpactarCostos"
                          checked={impactarCostos}
                          onChange={(e) => setImpactarCostos(e.target.checked)}
                          className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        <Label htmlFor="editImpactarCostos" className="text-sm font-bold text-amber-900 cursor-pointer">
                          Impactar costos y actualizar precios públicos
                        </Label>
                      </div>
                      <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-amber-200">
                        <button
                          type="button"
                          onClick={() => setEditingCompra(prev => prev ? { ...prev, moneda: 'ARS' } : null)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${(editingCompra?.moneda ?? 'ARS') === 'ARS' ? 'bg-slate-100 shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >$ ARS</button>
                        <button
                          type="button"
                          onClick={() => setEditingCompra(prev => prev ? { ...prev, moneda: 'USD' } : null)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${(editingCompra?.moneda ?? 'ARS') === 'USD' ? 'bg-blue-100 shadow text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                        >U$S USD</button>
                      </div>
                      {(editingCompra?.moneda ?? 'ARS') === 'USD' && (
                        <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                          Cotización: <span className="font-bold">${dolarCotizacion.toLocaleString('es-AR')}</span>
                          {impactarCostos && " · guardará en ARS"}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => { setIsEditDialogOpen(false); setRegistrando(false); }}
                        className="h-12 px-8 rounded-xl font-medium text-slate-600"
                      >
                        Cancelar
                      </Button>
                      {registrando ? (
                        <Button
                          onClick={handleRegistrarDesdeEdicion}
                          disabled={isProcessing}
                          className="h-12 px-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20"
                        >
                          {isProcessing ? (
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          ) : (
                            <CheckCircle className="h-5 w-5 mr-2" />
                          )}
                          Registrar Compra
                        </Button>
                      ) : (
                        <Button
                          onClick={confirmarEdicion}
                          disabled={isProcessing}
                          className="h-12 px-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20"
                        >
                          {isProcessing ? (
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          ) : (
                            <Save className="h-5 w-5 mr-2" />
                          )}
                          Guardar Cambios
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingN8NSync}
        onOpenChange={setPendingN8NSync}
        title="Sincronizar con n8n"
        description={`¿Desea enviar ${selectedIds.size > 0 ? 'los pedidos seleccionados' : 'todos los pedidos listados'} a n8n?`}
        confirmLabel="Sincronizar"
        onConfirm={handleSincronizarN8NConfirm}
      />
    </div>
  );
}
