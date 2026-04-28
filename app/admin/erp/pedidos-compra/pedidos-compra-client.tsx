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
import {
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  ArrowLeft,
  RefreshCcw,
  ChevronDown,
  Eye,
  Download,
  Send,
  Edit,
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
} from "@/app/actions/compras";

type ItemCompra = {
  productoId?: string | null;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
};

type Compra = {
  id: string;
  proveedor: string;
  comprador: string;
  total: number;
  interes: number;
  descuento: number;
  totalFinal: number;
  metodo_pago: string;
  createdAt: string;
  tipoCompra: string;
  items: ItemCompra[];
  dni?: string | null;
  telefono?: string | null;
  info?: string | null;
  estadoPedido?: string | null;
  pdfUrl?: string | null;
  numeroCompra?: number;
};

interface PedidosCompraClientProps {
  initialData: any[];
}

export function PedidosCompraClient({ initialData }: PedidosCompraClientProps) {
  const [compras, setCompras] = useState<Compra[]>(initialData as Compra[]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split("T")[0]);
  const [compraSeleccionada, setCompraSeleccionada] = useState<Compra | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isEliminarDialogOpen, setIsEliminarDialogOpen] = useState(false);
  const [compraParaEliminar, setCompraParaEliminar] = useState<Compra | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedCompras, setExpandedCompras] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Editing state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCompra, setEditingCompra] = useState<Compra | null>(null);

  const cargarPedidos = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerPedidosCompra(fechaDesde, fechaHasta);
      setCompras(data as Compra[]);
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

  const handleConfirmarPedido = (compra: Compra) => {
    setCompraSeleccionada(compra);
    setIsConfirmDialogOpen(true);
  };

  const handleEliminarPedido = (compra: Compra) => {
    setCompraParaEliminar(compra);
    setIsEliminarDialogOpen(true);
  };

  const handleVerPDF = (compra: Compra) => {
    window.open(`/admin/erp/pedidos-compra/pdf/${compra.id}`, '_blank');
  };

  const handleEditarPedido = async (compra: Compra) => {
    setIsProcessing(true);
    try {
      const data = await obtenerPedidoCompraPorId(compra.id);
      if (data) {
        setEditingCompra(data as Compra);
        setIsEditDialogOpen(true);
      }
    } catch (err) {
      console.error("Error al cargar pedido para editar:", err);
      alert("Error al cargar los datos del pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmarEdicion = async () => {
    if (!editingCompra) return;

    try {
      setIsProcessing(true);
      const result = await actualizarPedidoCompra(
        editingCompra.id,
        editingCompra,
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

  const confirmarPedido = async () => {
    if (!compraSeleccionada) return;

    try {
      setIsProcessing(true);
      const result = await confirmarPedidoCompra(compraSeleccionada.id);
      if (result.success) {
        setCompraSeleccionada(null);
        setIsConfirmDialogOpen(false);
        cargarPedidos();
      } else {
        alert(result.error || "Error al confirmar el pedido");
      }
    } catch (err) {
      console.error("Error al confirmar pedido:", err);
      alert("Error al confirmar el pedido. Intente nuevamente.");
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

  const handleSincronizarN8N = async () => {
    const pedidosIds = selectedIds.size > 0
      ? Array.from(selectedIds)
      : compras.map(v => v.id);

    if (pedidosIds.length === 0) {
      alert("No hay pedidos para sincronizar");
      return;
    }

    if (!window.confirm(`¿Desea enviar ${selectedIds.size > 0 ? 'los pedidos seleccionados' : 'todos los pedidos listados'} a n8n?`)) return;

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
    // Initial load if dates are set
    if (fechaDesde && fechaHasta) {
      cargarPedidos();
    }
  }, [fechaDesde, fechaHasta]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/admin/erp"
              className="flex items-center gap-2 p-2 h-auto text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              title="Volver al ERP"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Atrás</span>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="h-8 w-8 text-indigo-600" />
            Pedidos de Compra
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de pedidos de compra a proveedores pendientes de recibir
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
                    Filtrar
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
                        <TableCell className="text-right text-slate-600 py-4">
                          {new Date(compra.createdAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
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
                              title="Confirmar Recepción"
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

      {/* Confirm Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-900">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Confirmar Recepción de Compra
            </DialogTitle>
          </DialogHeader>
          {compraSeleccionada && (
            <div className="mt-4 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-sm text-slate-700">
                  <strong>Proveedor:</strong> {compraSeleccionada.proveedor || "Sin proveedor"}
                </p>
                <p className="text-sm text-slate-700">
                  <strong>Total Final:</strong>{" "}
                  {formatPrice(compraSeleccionada.totalFinal)}
                </p>
              </div>
              <p className="text-sm text-slate-600">
                ¿Desea confirmar que ha recibido este pedido? Esto marcará la compra como confirmada y actualizará el saldo con el proveedor si el pago es a Cuenta Corriente.
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
                  Confirmar Recepción
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
        <DialogContent className="sm:max-w-[600px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-900">
              <Edit className="h-5 w-5" />
              Editar Pedido de Compra
            </DialogTitle>
          </DialogHeader>
          {editingCompra && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <Input
                    value={editingCompra.proveedor}
                    onChange={e => setEditingCompra(prev => prev ? { ...prev, proveedor: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Método de Pago</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-300 text-sm"
                    value={editingCompra.metodo_pago}
                    onChange={e => setEditingCompra(prev => prev ? { ...prev, metodo_pago: e.target.value } : null)}
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="A Cuenta Corriente">A Cuenta Corriente</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observaciones</Label>
                <Input
                  value={editingCompra.info || ""}
                  onChange={e => setEditingCompra(prev => prev ? { ...prev, info: e.target.value } : null)}
                />
              </div>

              <div className="border-t pt-4">
                <Label className="font-bold">Items del Pedido</Label>
                <div className="mt-2 space-y-2">
                  {editingCompra.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg text-xs">
                      <span className="flex-1 font-medium">{item.nombre}</span>
                      <div className="w-20">
                        <Label className="text-[10px]">Cant.</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.cantidad}
                          onChange={e => {
                            setEditingCompra(prev => {
                              if (!prev) return null;
                              const newItems = [...prev.items];
                              newItems[idx].cantidad = parseInt(e.target.value) || 0;
                              newItems[idx].subtotal = newItems[idx].cantidad * newItems[idx].costo_unit;
                              const newTotal = newItems.reduce((acc, i) => acc + i.subtotal, 0);
                              return {
                                ...prev,
                                items: newItems,
                                total: newTotal,
                                totalFinal: newTotal + (prev.interes || 0) - (prev.descuento || 0)
                              };
                            });
                          }}
                        />
                      </div>
                      <div className="w-24 text-right">
                        <Label className="text-[10px]">Subtotal</Label>
                        <p className="font-bold">{formatPrice(item.subtotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-xl space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{formatPrice(editingCompra.total)}</span>
                </div>
                <div className="flex justify-between text-sm text-red-600 font-medium">
                  <span>Total Final:</span>
                  <span className="text-lg font-bold">{formatPrice(editingCompra.totalFinal)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarEdicion}
              disabled={isProcessing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
