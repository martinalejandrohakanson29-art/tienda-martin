"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  CreditCard,
  Search,
  RefreshCcw,
  User,
  Plus,
  X,
  Loader2,
  Clock,
  CheckCircle2,
  CheckCircle,
  FileText,
  ShieldCheck,
  Edit,
  Save,
  ShoppingCart,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PuntoVenta, Proveedor } from "../../types";
import {
  METODOS_PAGO,
  colorMetodoPago,
  redondearA50,
} from "../../constants";
import { consultarPadron } from "@/app/actions/afip";
import {
  obtenerProveedores,
  actualizarObservacionesProveedor,
} from "@/app/actions/listas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: string;
  setCliente: (val: string) => void;
  cuitBusqueda: string;
  setCuitBusqueda: (val: string) => void;
  docTipo: number;
  setDocTipo: (val: number) => void;
  docNro: string;
  setDocNro: (val: string) => void;
  condicionIva: number;
  setCondicionIva: (val: number) => void;
  tipoFacturaSugerida: number;
  setTipoFacturaSugerida: (val: number) => void;
  sujetoId: string | null;
  setSujetoId: (val: string | null) => void;
  email: string;
  setEmail: (val: string) => void;
  eventoOffline: boolean;
  setEventoOffline: (val: boolean) => void;
  puntoVentaId: string;
  setPuntoVentaId: (val: string) => void;
  puntosVenta: PuntoVenta[];
  metodoPago: string;
  setMetodoPago: (val: string) => void;
  isPagoMixto: boolean;
  setIsPagoMixto: (val: boolean) => void;
  montoPago1: number;
  setMontoPago1: (val: number) => void;
  metodoPago2: string;
  setMetodoPago2: (val: string) => void;
  procesadorTarjeta: string;
  setProcesadorTarjeta: (val: string) => void;
  dni: string;
  setDni: (val: string) => void;
  telefono: string;
  setTelefono: (val: string) => void;
  info: string;
  setInfo: (val: string) => void;
  cupon: string;
  setCupon: (val: string) => void;
  transaccionId: string;
  setTransaccionId: (val: string) => void;
  deCruzada: string;
  setDeCruzada: (val: string) => void;
  paraCruzada: string;
  setParaCruzada: (val: string) => void;
  proveedoresCruzada: { id: string; razonSocial: string; monto: number }[];
  setProveedoresCruzada: React.Dispatch<
    React.SetStateAction<{ id: string; razonSocial: string; monto: number }[]>
  >;
  paraCuentaCorriente: string;
  setParaCuentaCorriente: (val: string) => void;
  mlIdVenta: string;
  setMlIdVenta: (val: string) => void;
  mlIdEnvio: string;
  setMlIdEnvio: (val: string) => void;
  mlMla: string;
  setMlMla: (val: string) => void;
  mlDni: string;
  setMlDni: (val: string) => void;
  solicitarFactura: boolean;
  setSolicitarFactura: (val: boolean) => void;
  totalConDescuento: number;
  interesTarjeta: number;
  totalACobrar: number;
  proveedores: Proveedor[];
  onAbrirNuevoProveedor: () => void;
  isSubmitting: boolean;
  pedidoEnEdicionId?: string | null;
  numeroPedidoEnEdicion?: number | null;
  onFinalizarVenta: (
    esPedido?: boolean,
    forzarFacturacion?: boolean
  ) => Promise<void>;
}

export function FinalizarVentaModal({
  open,
  onOpenChange,
  cliente,
  setCliente,
  cuitBusqueda,
  setCuitBusqueda,
  docTipo,
  setDocTipo,
  docNro,
  setDocNro,
  condicionIva,
  setCondicionIva,
  setTipoFacturaSugerida,
  sujetoId,
  setSujetoId,
  email,
  setEmail,
  eventoOffline,
  setEventoOffline,
  puntoVentaId,
  setPuntoVentaId,
  puntosVenta,
  metodoPago,
  setMetodoPago,
  isPagoMixto,
  setIsPagoMixto,
  montoPago1,
  setMontoPago1,
  metodoPago2,
  setMetodoPago2,
  procesadorTarjeta,
  setProcesadorTarjeta,
  dni,
  setDni,
  telefono,
  setTelefono,
  info,
  setInfo,
  cupon,
  setCupon,
  transaccionId,
  setTransaccionId,
  deCruzada,
  setDeCruzada,
  paraCruzada,
  setParaCruzada,
  proveedoresCruzada,
  setProveedoresCruzada,
  paraCuentaCorriente,
  setParaCuentaCorriente,
  mlIdVenta,
  setMlIdVenta,
  mlIdEnvio,
  setMlIdEnvio,
  mlMla,
  setMlMla,
  mlDni,
  setMlDni,
  solicitarFactura,
  setSolicitarFactura,
  totalConDescuento,
  interesTarjeta,
  proveedores,
  onAbrirNuevoProveedor,
  isSubmitting,
  pedidoEnEdicionId,
  numeroPedidoEnEdicion,
  onFinalizarVenta,
}: Props) {
  const [isSearchingPadron, setIsSearchingPadron] = useState(false);
  const [sujetosEncontrados, setSujetosEncontrados] = useState<any[]>([]);
  const [showSujetoList, setShowSujetoList] = useState(false);
  const [showProvList, setShowProvList] = useState(false);
  const [showProvListCC, setShowProvListCC] = useState(false);
  const [showProvListMulti, setShowProvListMulti] = useState<number | null>(null);
  const [isSavingObsProveedor, setIsSavingObsProveedor] = useState(false);

  const searchSujetoRef = useRef<HTMLDivElement>(null);

  // Cálculos para pago mixto
  const base1 = isPagoMixto ? Number(montoPago1 || 0) : totalConDescuento;
  const base2 = isPagoMixto ? Math.max(0, totalConDescuento - base1) : 0;
  const isCredito1 = metodoPago === "Tarjeta de Crédito";
  const isCredito2 = metodoPago2 === "Tarjeta de Crédito";
  const final1 = isCredito1 ? redondearA50(base1 * (1 + interesTarjeta / 100)) : base1;
  const final2 = isCredito2 ? redondearA50(base2 * (1 + interesTarjeta / 100)) : base2;
  const totalFinalCalculado = isPagoMixto
    ? final1 + final2
    : isCredito1
    ? redondearA50(totalConDescuento * (1 + interesTarjeta / 100))
    : totalConDescuento;

  // Condiciones de validación por método de pago
  const requiereTarjeta =
    metodoPago === "Tarjeta de Crédito" ||
    metodoPago === "Tarjeta de Débito" ||
    (isPagoMixto &&
      (metodoPago2 === "Tarjeta de Crédito" || metodoPago2 === "Tarjeta de Débito"));

  const requiereMercadoLibre =
    metodoPago === "MercadoLibre" || (isPagoMixto && metodoPago2 === "MercadoLibre");
  const requiereMercadoPago =
    metodoPago === "MercadoPago" || (isPagoMixto && metodoPago2 === "MercadoPago");
  const requiereCruzada =
    metodoPago === "Cruzada" || (isPagoMixto && metodoPago2 === "Cruzada");
  const requiereCuentaCorriente =
    metodoPago === "A Cuenta Corriente" ||
    (isPagoMixto && metodoPago2 === "A Cuenta Corriente");
  const esMixtoCruzadaCC =
    isPagoMixto &&
    ((metodoPago === "Cruzada" && metodoPago2 === "A Cuenta Corriente") ||
      (metodoPago === "A Cuenta Corriente" && metodoPago2 === "Cruzada"));

  const requiereFiscalizacionOpcional =
    metodoPago === "Tarjeta de Crédito" ||
    metodoPago === "Tarjeta de Débito" ||
    metodoPago === "MercadoPago" ||
    (isPagoMixto &&
      (metodoPago === "Tarjeta de Crédito" ||
        metodoPago === "Tarjeta de Débito" ||
        metodoPago === "MercadoPago" ||
        metodoPago2 === "Tarjeta de Crédito" ||
        metodoPago2 === "Tarjeta de Débito" ||
        metodoPago2 === "MercadoPago"));

  // Buscar en padrón AFIP
  const handleBuscarPadron = async () => {
    const raw = cuitBusqueda.replace(/\D/g, "");
    if (raw.length < 7 || raw.length > 11) {
      alert("Ingrese un CUIT (11 dígitos) o DNI (7 u 8 dígitos)");
      return;
    }
    setIsSearchingPadron(true);
    try {
      const res = await consultarPadron(raw);
      if (res.success) {
        setCliente(res.nombre || "Consumidor Final");
        setDocNro(raw);
        setDocTipo(raw.length === 11 ? 80 : 96);
        setCondicionIva(res.condicionIva ?? 5);
        setTipoFacturaSugerida(res.tipoFactura ?? (res.condicionIva === 1 ? 1 : 6));
        setSujetoId(null);
      } else {
        alert("No se encontró el CUIT/DNI en el padrón AFIP: " + (res.error || ""));
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al consultar el padrón.");
    } finally {
      setIsSearchingPadron(false);
    }
  };

  const handleSearchSujetos = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSujetosEncontrados([]);
      return;
    }
    const q = query.toLowerCase();
    const res = proveedores.filter(
      (p) => p.razonSocial.toLowerCase().includes(q) || p.cuit.includes(q)
    );
    setSujetosEncontrados(res);
    setShowSujetoList(res.length > 0);
  };

  const handleSelectSujeto = (s: any) => {
    setCliente(s.razonSocial);
    setDocNro(s.cuit);
    setDocTipo(80);
    setCondicionIva(s.condicionIva || 1);
    setTipoFacturaSugerida(s.condicionIva === 1 ? 1 : 6);
    setSujetoId(s.id);
    setCuitBusqueda(s.cuit);
    if (s.observaciones) {
      setInfo(s.observaciones);
    }
    setShowSujetoList(false);
  };

  const agregarProveedorCruzada = () => {
    setProveedoresCruzada((prev) => [
      ...prev,
      { id: crypto.randomUUID(), razonSocial: "", monto: 0 },
    ]);
  };

  const eliminarProveedorCruzada = (idx: number) => {
    setProveedoresCruzada((prev) => prev.filter((_, i) => i !== idx));
  };

  const actualizarProveedorCruzada = (idx: number, campo: string, valor: any) => {
    setProveedoresCruzada((prev) => {
      const copia = [...prev];
      copia[idx] = { ...copia[idx], [campo]: valor };
      return copia;
    });
  };

  const actualizarProveedorCruzadaMultiple = (idx: number, datos: { razonSocial: string; id?: string }) => {
    setProveedoresCruzada((prev) => {
      const copia = [...prev];
      copia[idx] = { ...copia[idx], ...datos };
      return copia;
    });
  };

  const puntoVentaSeleccionado = useMemo(() => {
    return puntosVenta.find((p) => p.id === puntoVentaId) || null;
  }, [puntosVenta, puntoVentaId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] p-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
        <div className="max-h-[90vh] overflow-y-auto p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
              <CreditCard className="h-5 w-5 text-blue-600" /> Detalles del Cobro y Facturación
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-2">
            {/* COLUMNA 1: CLIENTE Y DATOS */}
            <div className="space-y-4">
              <div className={`grid grid-cols-1 gap-3 ${docNro ? "" : "md:grid-cols-[3fr_2fr]"}`}>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">
                    CUIT / DNI (Padrón AFIP)
                  </Label>
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleBuscarPadron();
                          }
                        }}
                        onFocus={() => {
                          if (cuitBusqueda.trim() && sujetosEncontrados.length > 0) {
                            setShowSujetoList(true);
                          }
                        }}
                        placeholder="CUIT o DNI... (Enter para buscar)"
                        className="h-10 text-xs bg-slate-50 border-slate-200 pl-9 rounded-xl focus:bg-white"
                      />
                      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

                      {showSujetoList && sujetosEncontrados.length > 0 && (
                        <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {sujetosEncontrados.map((s) => (
                            <div
                              key={s.id}
                              className="p-2.5 hover:bg-blue-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                              onClick={() => handleSelectSujeto(s)}
                            >
                              <p className="font-bold text-slate-800">{s.razonSocial}</p>
                              <p className="text-[11px] text-slate-400">
                                {s.cuit} - {s.condicionIva === 1 ? "RI" : "Cons. Final"}
                              </p>
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
                      {isSearchingPadron ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setCuitBusqueda("");
                        setCliente("Consumidor Final");
                        setSujetoId(null);
                        setDocNro("");
                        setDocTipo(99);
                        setCondicionIva(5);
                      }}
                      className="rounded-xl h-10 px-3 shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-100"
                      title="Limpiar y volver a Consumidor Final"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!docNro && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">
                      Cliente / Razón Social
                    </Label>
                    <div className="relative">
                      <Input
                        value={cliente}
                        onChange={(e) => setCliente(e.target.value)}
                        className="pl-9 h-10 text-xs bg-slate-50 border-slate-200 rounded-xl"
                      />
                      <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                )}
              </div>

              {docNro && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Label className="text-[10px] font-bold uppercase text-emerald-700">
                        Razón Social
                      </Label>
                      <Input
                        value={cliente}
                        onChange={(e) => setCliente(e.target.value)}
                        className="h-7 px-0 border-0 border-b border-emerald-300 rounded-none bg-transparent text-sm font-bold text-emerald-950 shadow-none focus-visible:ring-0"
                      />
                    </div>
                    <Badge
                      className={`${
                        condicionIva === 1
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : condicionIva === 6
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      } font-bold text-[10px] border shadow-none shrink-0`}
                    >
                      {condicionIva === 1
                        ? "RESP. INSCRIPTO"
                        : condicionIva === 6
                        ? "MONOTRIBUTISTA"
                        : "CONSUMIDOR FINAL"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-bold">
                    {docTipo === 80 ? "CUIT" : "DNI"}: {docNro}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Punto de Venta</Label>
                  <select
                    value={puntoVentaId || ""}
                    onChange={(e) => setPuntoVentaId(e.target.value)}
                    className="w-full h-10 rounded-xl border bg-white px-3 text-xs font-bold text-center focus:outline-none cursor-pointer"
                    style={{
                      color: puntoVentaSeleccionado?.color || "#475569",
                      borderColor: puntoVentaSeleccionado?.color || "#cbd5e1",
                      borderLeftWidth: 4,
                    }}
                  >
                    <option value="">Seleccionar...</option>
                    {puntosVenta.map((p) => (
                      <option key={p.id} value={p.id} style={{ color: p.color || "#000", fontWeight: "bold" }}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Email (Opcional)</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                    className="bg-white border-slate-200 h-10 text-xs rounded-xl"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-1 col-span-1 md:col-span-2">
                  <input
                    type="checkbox"
                    id="eventoOfflineModal"
                    checked={eventoOffline}
                    onChange={(e) => setEventoOffline(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <Label htmlFor="eventoOfflineModal" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Marcar como Evento Offline (Meta Ads)
                  </Label>
                </div>
              </div>

              {/* Observaciones */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">
                  Observaciones / Datos de Envío
                </Label>
                <Textarea
                  value={info}
                  onChange={(e) => setInfo(e.target.value)}
                  placeholder="Dirección, referencias, método de entrega, notas..."
                  className="min-h-[70px] text-xs rounded-xl border-slate-200 resize-none bg-slate-50/40 focus:bg-white"
                />
                {sujetoId && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500">
                      Para: <span className="font-semibold text-slate-700">{cliente}</span>
                    </span>
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
                      className="h-7 text-xs px-2.5 border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg"
                    >
                      {isSavingObsProveedor ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      Guardar en cliente
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMNA 2: FORMA DE PAGO Y ACCIONES */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="pagoMixtoModal"
                  checked={isPagoMixto}
                  onChange={(e) => {
                    setIsPagoMixto(e.target.checked);
                    if (e.target.checked && montoPago1 === 0) {
                      setMontoPago1(redondearA50(totalConDescuento / 2));
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <Label htmlFor="pagoMixtoModal" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Pago Mixto (Dividir en 2 métodos de pago)
                </Label>
              </div>

              {isPagoMixto ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-blue-800 uppercase">Método 1</Label>
                    <select
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value)}
                      style={{ borderLeftWidth: 3, borderLeftColor: colorMetodoPago(metodoPago) }}
                      className="w-full h-9 rounded-xl border border-blue-200 bg-white px-2 text-xs font-semibold text-center focus:outline-none"
                    >
                      {METODOS_PAGO.filter((m) => m.value !== "A Confirmar").map((m) => (
                        <option key={m.value} value={m.value} style={{ color: m.color, fontWeight: "bold" }}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[10px] font-bold text-blue-600 uppercase">
                          Monto Base 1
                        </Label>
                        <button
                          type="button"
                          onClick={() => setMontoPago1(redondearA50(totalConDescuento / 2))}
                          className="text-[10px] font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded"
                        >
                          50% / 50%
                        </button>
                      </div>
                      <Input
                        type="number"
                        value={montoPago1}
                        onChange={(e) => setMontoPago1(Number(e.target.value))}
                        className="font-bold border-blue-200 h-9 text-xs"
                      />
                    </div>
                    {isCredito1 && (
                      <p className="text-[11px] font-bold text-blue-700 bg-blue-100 p-1.5 rounded-lg border border-blue-200">
                        Total P1 (+{interesTarjeta}%): $ {final1.toLocaleString("es-AR")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-blue-800 uppercase">Método 2</Label>
                    <select
                      value={metodoPago2}
                      onChange={(e) => setMetodoPago2(e.target.value)}
                      style={{ borderLeftWidth: 3, borderLeftColor: colorMetodoPago(metodoPago2) }}
                      className="w-full h-9 rounded-xl border border-blue-200 bg-white px-2 text-xs font-semibold text-center focus:outline-none"
                    >
                      {METODOS_PAGO.map((m) => (
                        <option key={m.value} value={m.value} style={{ color: m.color, fontWeight: "bold" }}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <div>
                      <Label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">
                        Monto Base Restante 2
                      </Label>
                      <div className="h-9 bg-blue-100/50 rounded-xl border border-blue-200 flex items-center px-3 font-bold text-blue-900 text-xs">
                        $ {base2.toLocaleString("es-AR")}
                      </div>
                    </div>
                    {isCredito2 && (
                      <p className="text-[11px] font-bold text-blue-700 bg-blue-100 p-1.5 rounded-lg border border-blue-200">
                        Total P2 (+{interesTarjeta}%): $ {final2.toLocaleString("es-AR")}
                      </p>
                    )}
                  </div>

                  <div className="col-span-1 md:col-span-2 bg-blue-700 text-white p-3 rounded-xl flex justify-between items-center shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Final Calculado</span>
                    <span className="text-xl font-black">$ {totalFinalCalculado.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Forma de Pago</Label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    style={{ borderLeftWidth: 4, borderLeftColor: colorMetodoPago(metodoPago) }}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-center focus:outline-none"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.value} value={m.value} style={{ color: m.color, fontWeight: "bold" }}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {metodoPago === "Tarjeta de Crédito" && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-bold text-slate-600 uppercase">
                        Procesador / Entidad
                      </Label>
                      <select
                        value={procesadorTarjeta}
                        onChange={(e) => setProcesadorTarjeta(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:outline-none"
                      >
                        <option value="Posnet Intercap">🏦 Posnet Intercap</option>
                        <option value="Go Cuotas">📅 Go Cuotas</option>
                        <option value="Posnet Mercadopago">🔵 Posnet Mercadopago</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Campos dinámicos por medio de pago */}
              {requiereTarjeta && (
                <div className="grid grid-cols-2 gap-2.5 bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">DNI *</Label>
                    <Input
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">Teléfono *</Label>
                    <Input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">N° Cupón *</Label>
                    <Input
                      value={cupon}
                      onChange={(e) => setCupon(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">ID Transacción *</Label>
                    <Input
                      value={transaccionId}
                      onChange={(e) => setTransaccionId(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>
              )}

              {requiereMercadoLibre && (
                <div className="grid grid-cols-2 gap-2.5 bg-amber-50/60 p-3 rounded-xl border border-amber-100 text-xs">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">Id Venta *</Label>
                    <Input
                      value={mlIdVenta}
                      onChange={(e) => setMlIdVenta(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">Id Envío *</Label>
                    <Input
                      value={mlIdEnvio}
                      onChange={(e) => setMlIdEnvio(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">MLA *</Label>
                    <Input
                      value={mlMla}
                      onChange={(e) => setMlMla(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">DNI (Opcional)</Label>
                    <Input
                      value={mlDni}
                      onChange={(e) => setMlDni(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>
              )}

              {requiereMercadoPago && (
                <div className="bg-sky-50/60 p-3 rounded-xl border border-sky-100 text-xs space-y-1">
                  <Label className="text-xs font-bold text-sky-700">Id de pago *</Label>
                  <Input
                    value={mlIdVenta}
                    onChange={(e) => setMlIdVenta(e.target.value)}
                    className="bg-white border-sky-200 h-8 text-xs rounded-lg"
                    placeholder="Obligatorio"
                  />
                </div>
              )}

              {requiereCruzada && !isPagoMixto && (
                <div className="space-y-3 bg-teal-50/60 p-3.5 rounded-xl border border-teal-100 text-xs">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-bold text-teal-800 uppercase">
                      Pago Cruzada: Proveedores
                    </Label>
                    {proveedoresCruzada.length < 4 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-teal-300 text-teal-700 hover:bg-teal-100 rounded-lg"
                        onClick={agregarProveedorCruzada}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Añadir
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-teal-700 uppercase">
                        Origen (De)
                      </Label>
                      <Input
                        value={deCruzada}
                        onChange={(e) => setDeCruzada(e.target.value)}
                        className="h-8 bg-white border-teal-200 text-xs rounded-lg"
                        placeholder="¿Quién envía el dinero?"
                      />
                    </div>

                    {proveedoresCruzada.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex gap-2 items-start bg-white/70 p-2 rounded-lg border border-teal-100"
                      >
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">
                            Proveedor {idx + 1}
                          </Label>
                          <div className="relative">
                            <Input
                              value={item.razonSocial}
                              onChange={(e) => {
                                actualizarProveedorCruzada(idx, "razonSocial", e.target.value);
                                setShowProvListMulti(idx);
                              }}
                              onFocus={() => setShowProvListMulti(idx)}
                              className="h-8 bg-white border-teal-200 text-xs rounded-lg"
                              placeholder="Buscar..."
                            />
                            {showProvListMulti === idx && proveedores.length > 0 && (
                              <div className="absolute z-[110] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                {proveedores
                                  .filter(
                                    (p) =>
                                      p.razonSocial
                                        .toLowerCase()
                                        .includes(item.razonSocial.toLowerCase()) ||
                                      p.cuit.includes(item.razonSocial)
                                  )
                                  .map((p) => (
                                    <div
                                      key={p.id}
                                      className="p-2 hover:bg-teal-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        actualizarProveedorCruzadaMultiple(idx, {
                                          razonSocial: p.razonSocial,
                                          id: p.id,
                                        });
                                        setShowProvListMulti(null);
                                      }}
                                    >
                                      <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                      <p className="text-[10px] text-slate-400">{p.cuit}</p>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="w-24 space-y-1">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">
                            Monto
                          </Label>
                          <Input
                            type="number"
                            value={item.monto}
                            onChange={(e) =>
                              actualizarProveedorCruzada(idx, "monto", Number(e.target.value))
                            }
                            className="h-8 bg-white border-teal-200 text-xs font-bold text-teal-900 rounded-lg"
                          />
                        </div>

                        {proveedoresCruzada.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 mt-5 text-red-400 hover:text-red-600 rounded-lg"
                            onClick={() => eliminarProveedorCruzada(idx)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center p-2 bg-teal-100/50 rounded-lg border border-teal-200">
                    <span className="text-[10px] font-bold text-teal-700 uppercase">
                      Suma Cruzada:
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        Math.abs(
                          proveedoresCruzada.reduce((acc, curr) => acc + curr.monto, 0) -
                            totalFinalCalculado
                        ) < 0.01
                          ? "text-emerald-700"
                          : "text-rose-600"
                      }`}
                    >
                      ${" "}
                      {proveedoresCruzada
                        .reduce((acc, curr) => acc + curr.monto, 0)
                        .toLocaleString("es-AR")}{" "}
                      / $ {totalFinalCalculado.toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              )}

              {/* MIXTO: Cruzada + Cuenta Corriente — dos secciones separadas */}
                  {esMixtoCruzadaCC && (
                    <div className="space-y-3">
                      {/* Sección Cruzada */}
                      <div className="bg-teal-50/70 p-3 rounded-xl border border-teal-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-teal-800 uppercase">
                            1. Pago Cruzada
                          </Label>
                          <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md">
                            $ {(metodoPago === "Cruzada" ? final1 : final2).toLocaleString("es-AR")}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-teal-700 uppercase">
                              Quien Envía (De) *
                            </Label>
                            <Input
                              value={deCruzada}
                              onChange={(e) => setDeCruzada(e.target.value)}
                              className="bg-white border-teal-200 h-8 text-xs rounded-lg"
                              placeholder="Nombre de quien envía..."
                            />
                          </div>
                          <div className="space-y-1 relative">
                            <Label className="text-[10px] font-bold text-teal-700 uppercase">
                              Proveedor (Para) *
                            </Label>
                            <div className="relative">
                              <Input
                                value={paraCruzada}
                                onChange={(e) => {
                                  setParaCruzada(e.target.value);
                                  setShowProvList(true);
                                }}
                                onFocus={() => setShowProvList(true)}
                                className="bg-white border-teal-200 h-8 text-xs rounded-lg"
                                placeholder="Buscar proveedor..."
                              />
                              {showProvList && proveedores.length > 0 && (
                                <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                  {proveedores
                                    .filter(
                                      (p) =>
                                        p.razonSocial
                                          .toLowerCase()
                                          .includes(paraCruzada.toLowerCase()) ||
                                        p.cuit.includes(paraCruzada)
                                    )
                                    .map((p) => (
                                      <div
                                        key={p.id}
                                        className="p-2 hover:bg-teal-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setParaCruzada(p.razonSocial);
                                          setShowProvList(false);
                                        }}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                            <p className="text-[9px] text-slate-400">{p.cuit}</p>
                                          </div>
                                          {p.total != null && (
                                            <p
                                              className={`text-xs font-bold ${
                                                Number(p.total) < 0
                                                  ? "text-red-500"
                                                  : Number(p.total) > 0
                                                  ? "text-emerald-500"
                                                  : "text-slate-600"
                                              }`}
                                            >
                                              $ {Number(p.total).toLocaleString("es-AR")}
                                            </p>
                                          )}
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
                      <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-emerald-800 uppercase">
                            2. Cuenta Corriente
                          </Label>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                            $ {(metodoPago === "A Cuenta Corriente" ? final1 : final2).toLocaleString(
                              "es-AR"
                            )}
                          </span>
                        </div>
                        <div className="space-y-1 relative">
                          <Label className="text-[10px] font-bold text-emerald-700 uppercase">
                            Proveedor / Cuenta *
                          </Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                value={paraCuentaCorriente}
                                onChange={(e) => {
                                  setParaCuentaCorriente(e.target.value);
                                  setShowProvListCC(true);
                                }}
                                onFocus={() => setShowProvListCC(true)}
                                className="bg-white border-emerald-200 h-8 text-xs rounded-lg"
                                placeholder="Buscar proveedor..."
                              />
                              {showProvListCC && proveedores.length > 0 && (
                                <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                  {proveedores
                                    .filter(
                                      (p) =>
                                        p.razonSocial
                                          .toLowerCase()
                                          .includes(paraCuentaCorriente.toLowerCase()) ||
                                        p.cuit.includes(paraCuentaCorriente)
                                    )
                                    .map((p) => (
                                      <div
                                        key={p.id}
                                        className="p-2 hover:bg-emerald-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setParaCuentaCorriente(p.razonSocial);
                                          setShowProvListCC(false);
                                        }}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                            <p className="text-[9px] text-slate-400">{p.cuit}</p>
                                          </div>
                                          {p.total != null && (
                                            <p
                                              className={`text-xs font-bold ${
                                                Number(p.total) < 0
                                                  ? "text-red-500"
                                                  : Number(p.total) > 0
                                                  ? "text-emerald-500"
                                                  : "text-slate-600"
                                              }`}
                                            >
                                              $ {Number(p.total).toLocaleString("es-AR")}
                                            </p>
                                          )}
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
                              className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 h-8 w-8 rounded-lg shrink-0"
                              onClick={onAbrirNuevoProveedor}
                              title="Nuevo Proveedor"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cuenta Corriente o Mixto Cuenta Corriente */}
              {((requiereCruzada && isPagoMixto && !esMixtoCruzadaCC) ||
                (requiereCuentaCorriente && !esMixtoCruzadaCC)) && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-2 ${
                    requiereCruzada
                      ? "bg-teal-50/60 border-teal-100"
                      : "bg-emerald-50/60 border-emerald-100"
                  }`}
                >
                  {requiereCruzada && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-teal-700">De *</Label>
                      <Input
                        value={deCruzada}
                        onChange={(e) => setDeCruzada(e.target.value)}
                        className="bg-white border-teal-200 h-8 text-xs rounded-lg"
                        placeholder="Origen"
                      />
                    </div>
                  )}
                  <div className="space-y-1 relative">
                    <Label
                      className={`text-xs font-bold ${
                        requiereCruzada ? "text-teal-700" : "text-emerald-700"
                      }`}
                    >
                      {requiereCuentaCorriente ? "Cuenta / Proveedor" : "Para"} *
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={paraCruzada}
                          onChange={(e) => {
                            setParaCruzada(e.target.value);
                            setShowProvList(true);
                          }}
                          onFocus={() => setShowProvList(true)}
                          className={`h-8 text-xs rounded-lg ${
                            requiereCruzada
                              ? "bg-white border-teal-200"
                              : "bg-white border-emerald-200"
                          }`}
                          placeholder="Buscar proveedor..."
                        />
                        {showProvList && proveedores.length > 0 && (
                          <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                            {proveedores
                              .filter(
                                (p) =>
                                  p.razonSocial
                                    .toLowerCase()
                                    .includes(paraCruzada.toLowerCase()) ||
                                  p.cuit.includes(paraCruzada)
                              )
                              .map((p) => (
                                <div
                                  key={p.id}
                                  className="p-2 cursor-pointer text-xs border-b border-slate-50 last:border-0 hover:bg-slate-50"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setParaCruzada(p.razonSocial);
                                    setShowProvList(false);
                                  }}
                                >
                                  <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                  <p className="text-[10px] text-slate-400">{p.cuit}</p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={onAbrirNuevoProveedor}
                        className="h-8 w-8 rounded-lg shrink-0 border-slate-200"
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

          {/* ACCIÓN FINAL: CARGAR COMO PEDIDO O REGISTRAR VENTA */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            {pedidoEnEdicionId ? (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-blue-900 font-bold text-sm">
                  <Edit className="h-4 w-4 text-blue-600" />
                  Guardando Pedido de Venta #{numeroPedidoEnEdicion}
                </div>
                <Button
                  onClick={() => onFinalizarVenta()}
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl font-bold text-sm w-full shadow-md"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Cambios del Pedido
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* PEDIDO DE VENTA */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-bold uppercase text-amber-900">
                        Pedido de Venta
                      </span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-semibold">
                      Pendiente
                    </Badge>
                  </div>
                  <Button
                    onClick={() => onFinalizarVenta(true)}
                    disabled={isSubmitting}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-10 rounded-xl w-full shadow-sm"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Clock className="h-4 w-4 mr-2" />
                    )}
                    CARGAR COMO PEDIDO
                  </Button>
                </div>

                {/* REGISTRAR VENTA */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-bold uppercase text-emerald-900">
                        Registrar Venta
                      </span>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={solicitarFactura}
                        onChange={(e) => setSolicitarFactura(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span className="text-[11px] font-bold text-emerald-800">
                        Factura AFIP
                      </span>
                    </label>
                  </div>

                  {requiereFiscalizacionOpcional ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => onFinalizarVenta(false, false)}
                        disabled={isSubmitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 rounded-xl font-bold text-[11px] shadow-sm"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Sin fiscalizar"
                        )}
                      </Button>
                      <Button
                        onClick={() => onFinalizarVenta(false, true)}
                        disabled={isSubmitting}
                        className="bg-teal-800 hover:bg-teal-900 text-white h-10 rounded-xl font-bold text-[11px] shadow-sm"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Con AFIP"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onFinalizarVenta(false)}
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 rounded-xl font-bold text-xs w-full shadow-md shadow-emerald-600/20"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      REGISTRAR VENTA
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto rounded-xl border-slate-200 text-xs"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
