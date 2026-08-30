"use client";

import React, { useState } from "react";
import {
  CreditCard,
  User,
  Calendar as CalendarIcon,
  Database,
  CheckCircle,
  Clock,
  Save,
  Loader2,
  AlertTriangle,
  Receipt,
  DollarSign,
  ChevronDown,
  X,
  FileCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DecimalInput } from "./decimal-input";
import { toast } from "sonner";

interface ProveedorItem {
  id: string;
  razonSocial: string;
  nombreFantasia?: string | null;
  cuit?: string | null;
  total: number;
}

interface ModalFinalizarCompraProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // Totals & Items
  totalBase: number;
  totalFinal: number;
  cantidadArticulos: number;
  totalUnidades: number;
  // Form values
  proveedor: string;
  setProveedor: (val: string) => void;
  proveedorId: string;
  setProveedorId: (val: string) => void;
  metodoPago: string;
  setMetodoPago: (val: string) => void;
  comprobante: string;
  setComprobante: (val: string) => void;
  interes: number;
  setInteres: (val: number) => void;
  descuento: number;
  setDescuento: (val: number) => void;
  fechaCompra: string;
  setFechaCompra: (val: string) => void;
  fechaIngreso: string;
  setFechaIngreso: (val: string) => void;
  impactarCostos: boolean;
  setImpactarCostos: (val: boolean) => void;
  moneda: "ARS" | "USD";
  setMoneda: (val: "ARS" | "USD") => void;
  dolarCotizacion: number;
  setDolarCotizacion?: (val: number) => void;
  // Providers list
  proveedores: ProveedorItem[];
  // Edit modes
  pedidoEnEdicionId: string | null;
  numeroPedidoEnEdicion: number | null;
  compraEnEdicionId: string | null;
  numeroCompraEnEdicion: number | null;
  pedidoEnRegistroId: string | null;
  numeroPedidoEnRegistro: number | null;
  // Handlers
  isSubmitting: boolean;
  onConfirmarCompraDirecta: () => Promise<void>;
  onGuardarComoPedido: () => Promise<void>;
  onGuardarCambiosPedido: () => Promise<void>;
  onGuardarCambiosCompra: () => Promise<void>;
  onRegistrarPedidoComoCompra: () => Promise<void>;
}

export function ModalFinalizarCompra({
  isOpen,
  onOpenChange,
  totalBase,
  totalFinal,
  cantidadArticulos,
  totalUnidades,
  proveedor,
  setProveedor,
  proveedorId,
  setProveedorId,
  metodoPago,
  setMetodoPago,
  comprobante,
  setComprobante,
  interes,
  setInteres,
  descuento,
  setDescuento,
  fechaCompra,
  setFechaCompra,
  fechaIngreso,
  setFechaIngreso,
  impactarCostos,
  setImpactarCostos,
  moneda,
  setMoneda,
  dolarCotizacion,
  setDolarCotizacion,
  proveedores,
  pedidoEnEdicionId,
  numeroPedidoEnEdicion,
  compraEnEdicionId,
  numeroCompraEnEdicion,
  pedidoEnRegistroId,
  numeroPedidoEnRegistro,
  isSubmitting,
  onConfirmarCompraDirecta,
  onGuardarComoPedido,
  onGuardarCambiosPedido,
  onGuardarCambiosCompra,
  onRegistrarPedidoComoCompra,
}: ModalFinalizarCompraProps) {
  const [showProvList, setShowProvList] = useState(false);

  const proveedoresFiltrados = React.useMemo(() => {
    if (!proveedor.trim()) return proveedores.slice(0, 20);
    const q = proveedor.toLowerCase().trim();
    return proveedores
      .filter(
        (p) =>
          p.razonSocial.toLowerCase().includes(q) ||
          (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(q)) ||
          p.cuit?.includes(q)
      )
      .slice(0, 20);
  }, [proveedor, proveedores]);

  const tituloModal = pedidoEnEdicionId
    ? `Guardar Cambios · Pedido #${numeroPedidoEnEdicion}`
    : compraEnEdicionId
    ? `Guardar Cambios · Compra #${numeroCompraEnEdicion}`
    : pedidoEnRegistroId
    ? `Registrar Recepción · Pedido #${numeroPedidoEnRegistro}`
    : "Finalizar y Registrar Compra";

  const handleConfirmar = async () => {
    if (metodoPago === "A Cuenta Corriente" && !proveedorId) {
      toast.error("Debes seleccionar un proveedor existente de la lista para compras a Cuenta Corriente.");
      return;
    }

    if (pedidoEnEdicionId) {
      await onGuardarCambiosPedido();
    } else if (compraEnEdicionId) {
      await onGuardarCambiosCompra();
    } else if (pedidoEnRegistroId) {
      await onRegistrarPedidoComoCompra();
    } else {
      await onConfirmarCompraDirecta();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[850px] p-0 overflow-hidden rounded-3xl border border-slate-200 shadow-2xl">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2.5 text-white">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <CreditCard className="h-5 w-5" />
              </div>
              <span>{tituloModal}</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Revisa los detalles comerciales, proveedor y condiciones de pago.
            </DialogDescription>
          </DialogHeader>

          {/* Selector de Moneda Rápido */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setMoneda("ARS")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                moneda === "ARS"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              $ ARS
            </button>
            <button
              type="button"
              onClick={() => setMoneda("USD")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                moneda === "USD"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              U$S USD
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-0 max-h-[80vh] overflow-y-auto">
          {/* COLUMNA IZQUIERDA: Formulario de datos */}
          <div className="md:col-span-7 p-6 space-y-4 border-r border-slate-100 bg-white">
            {/* PROVEEDOR */}
            <div className="space-y-1 relative">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-bold text-slate-600 uppercase">
                  Proveedor {metodoPago === "A Cuenta Corriente" && <span className="text-red-500">*</span>}
                </Label>
                {proveedorId && (
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Proveedor Vinculado ✓
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  value={proveedor}
                  onChange={(e) => {
                    setProveedor(e.target.value);
                    setProveedorId("");
                    setShowProvList(true);
                  }}
                  onFocus={() => setShowProvList(true)}
                  placeholder="Escribe el nombre, CUIT o fantasía..."
                  className="pl-9 pr-8 bg-slate-50 border-slate-200 focus:bg-white font-medium"
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                {proveedor && (
                  <button
                    type="button"
                    onClick={() => {
                      setProveedor("");
                      setProveedorId("");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* LISTA DESPLEGABLE DE PROVEEDORES */}
              {showProvList && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-52 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-2 border-b bg-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3">
                    <span>Proveedores registrados</span>
                    <button
                      type="button"
                      onClick={() => setShowProvList(false)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      Cerrar
                    </button>
                  </div>
                  {proveedoresFiltrados.length > 0 ? (
                    proveedoresFiltrados.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setProveedor(p.razonSocial);
                          setProveedorId(p.id);
                          setShowProvList(false);
                        }}
                        className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex justify-between items-center text-left"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{p.razonSocial}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {p.cuit || "Sin CUIT"} {p.nombreFantasia ? `· ${p.nombreFantasia}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-[11px] font-black ${
                              Number(p.total) > 0 ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            ${Number(p.total).toLocaleString("es-AR")}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No hay coincidencias. Se guardará como texto libre: "{proveedor}".
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* MÉTODO DE PAGO Y COMPROBANTE */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">Método de Pago</Label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 focus:bg-white outline-none"
                >
                  <option value="Efectivo">💵 Efectivo</option>
                  <option value="Transferencia">🏦 Transferencia</option>
                  <option value="A Cuenta Corriente">📑 A Cuenta Corriente</option>
                  <option value="Cheque">✍️ Cheque</option>
                  <option value="Mercado Pago">📱 Mercado Pago</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">N° Comprobante / Factura</Label>
                <Input
                  value={comprobante}
                  onChange={(e) => setComprobante(e.target.value)}
                  placeholder="Ej: 0001-00012345"
                  className="bg-slate-50 border-slate-200 text-xs font-mono"
                />
              </div>
            </div>

            {/* RECARGO Y DESCUENTO */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">Recargo / Interés ($)</Label>
                <DecimalInput
                  value={interes}
                  onChange={setInteres}
                  placeholder="0"
                  className="bg-slate-50 border-slate-200 text-amber-700 font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">Descuento ($)</Label>
                <DecimalInput
                  value={descuento}
                  onChange={setDescuento}
                  placeholder="0"
                  className="bg-slate-50 border-slate-200 text-emerald-700 font-bold"
                />
              </div>
            </div>

            {/* FECHAS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">Fecha Factura / Carga</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={fechaCompra}
                    onChange={(e) => setFechaCompra(e.target.value)}
                    className="pl-8 bg-slate-50 border-slate-200 text-xs"
                  />
                  <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">Fecha Ingreso Real</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={fechaIngreso}
                    onChange={(e) => setFechaIngreso(e.target.value)}
                    className="pl-8 bg-slate-50 border-slate-200 text-xs"
                  />
                  <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-500" />
                </div>
              </div>
            </div>

            {/* IMPACTO EN COSTOS Y COTIZACIÓN USD */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  id="impactarCostos"
                  checked={impactarCostos}
                  onChange={(e) => setImpactarCostos(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800">Impactar compra en costos de artículos</span>
                  <span className="text-[10px] text-slate-400">Actualizará el costo base y los precios de venta en mostrador/ML</span>
                </div>
              </label>

              {moneda === "USD" && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-blue-600" /> Cotización Dólar para esta compra:
                    </span>
                    {setDolarCotizacion ? (
                      <div className="w-24">
                        <DecimalInput
                          value={dolarCotizacion}
                          onChange={setDolarCotizacion}
                          className="h-7 text-xs font-black text-blue-800 bg-white border-blue-300"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-black text-blue-800">${dolarCotizacion.toLocaleString("es-AR")}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA DERECHA: Resumen Financiero y Acciones */}
          <div className="md:col-span-5 p-6 bg-slate-50/70 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumen de Compra</span>
                <span className="text-xs font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
                  {cantidadArticulos} art. ({totalUnidades} unid.)
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Subtotal Neto</span>
                  <span className="font-bold text-slate-800">${totalBase.toLocaleString("es-AR")}</span>
                </div>

                {interes > 0 && (
                  <div className="flex justify-between items-center text-amber-700">
                    <span>Recargo / Interés</span>
                    <span className="font-bold">+ ${interes.toLocaleString("es-AR")}</span>
                  </div>
                )}

                {descuento > 0 && (
                  <div className="flex justify-between items-center text-emerald-700">
                    <span>Descuento</span>
                    <span className="font-bold">- ${descuento.toLocaleString("es-AR")}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Total Final a Facturar
                    </span>
                    <span className="text-3xl font-black text-slate-900 tracking-tight">
                      ${totalFinal.toLocaleString("es-AR")}
                    </span>
                    {moneda === "USD" && (
                      <span className="text-xs text-blue-600 font-bold block mt-1">
                        ≈ U$S {(totalFinal / (dolarCotizacion || 1)).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div className="space-y-2 pt-6">
              {pedidoEnEdicionId ? (
                <Button
                  onClick={handleConfirmar}
                  disabled={isSubmitting}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar Cambios del Pedido
                </Button>
              ) : compraEnEdicionId ? (
                <Button
                  onClick={handleConfirmar}
                  disabled={isSubmitting}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar Cambios de Compra
                </Button>
              ) : pedidoEnRegistroId ? (
                <Button
                  onClick={handleConfirmar}
                  disabled={isSubmitting}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Registrar Recepción de Pedido
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleConfirmar}
                    disabled={isSubmitting}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 text-sm"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Confirmar y Registrar Compra
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onGuardarComoPedido}
                    disabled={isSubmitting}
                    className="w-full h-10 border-amber-300 text-amber-800 bg-amber-50/60 hover:bg-amber-100 font-bold rounded-2xl text-xs"
                  >
                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Clock className="h-3.5 w-3.5 mr-1.5" />}
                    Guardar como Pedido de Compra
                  </Button>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="w-full text-xs text-slate-500"
              >
                Volver a la lista de artículos
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
