"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  User,
  Trash2,
  ShoppingBag,
  Loader2,
  CreditCard,
  Calendar as CalendarIcon,
  ClipboardList,
  Clock,
  RefreshCcw,
  Percent,
  Edit,
  History,
  Save,
  CheckCircle,
  ArrowLeft,
  X,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

// Server Actions
import {
  crearCompra,
  actualizarCompra,
  eliminarCompra,
  obtenerHistorialCompra,
  guardarComoPedidoCompra,
  actualizarPedidoCompra,
  confirmarPedidoCompra,
} from "@/app/actions/compras";
import { obtenerProveedores } from "@/app/actions/listas";
import { sincronizarArticulosMostrador } from "@/app/actions/ventas-mostrador";

// Subcomponentes modulares
import { DecimalInput } from "./components/decimal-input";
import { ModalBuscarArticulo, type Articulo } from "./components/modal-buscar-articulo";
import { ModalNuevoArticulo } from "./components/modal-nuevo-articulo";
import { ModalFinalizarCompra } from "./components/modal-finalizar-compra";
import { ModalHistorialAuditoria } from "./components/modal-historial-auditoria";
import { DrawerDetalleCompra } from "./components/drawer-detalle-compra";
import { TablaComprasHistorial } from "./components/tabla-compras-historial";
import { PedidosCompraClient, type Compra as PedidoCompraData } from "@/app/admin/erp/pedidos-compra/pedidos-compra-client";

export interface ItemCompra {
  id: string;
  productoId?: string;
  nombre: string;
  cantidad: number;
  costo_unit: number;
  subtotal: number;
  stock: number;
  ultimaModificacion?: string | null;
  margenGanancia?: number;
  precioPublico?: number;
}

const DRAFT_STORAGE_KEY = "tienda_compra_draft_v2";

export default function ComprasClient({
  articulosIniciales,
  compradorNombre,
  dolarCotizacion: dolarInicial,
  factorFob: factorFobInicial,
}: {
  articulosIniciales: Articulo[];
  compradorNombre: string;
  dolarCotizacion: number;
  factorFob: number;
}) {
  // --- ESTADOS GENERALES Y TABS ---
  const [activeTab, setActiveTab] = useState("registrar");
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pedidosRefreshKey, setPedidosRefreshKey] = useState(0);
  const [historialRefreshKey, setHistorialRefreshKey] = useState(0);

  // --- COTIZACIÓN ---
  const [dolarCotizacion, setDolarCotizacion] = useState(dolarInicial || 1);
  const [factorFob] = useState(factorFobInicial || 1);

  // --- ESTADO DE CARRITO / NUEVA COMPRA ---
  const [items, setItems] = useState<ItemCompra[]>([]);
  const [proveedor, setProveedor] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [interes, setInteres] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [comprobante, setComprobante] = useState("");
  const [info, setInfo] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [transaccionId, setTransaccionId] = useState("");
  const [impactarCostos, setImpactarCostos] = useState(false);
  const [iva, setIva] = useState(false);
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [fechaCompra, setFechaCompra] = useState(new Date().toISOString().split("T")[0]);
  const [fechaIngreso, setFechaIngreso] = useState("");

  // --- MODOS DE EDICIÓN ---
  const [pedidoEnEdicionId, setPedidoEnEdicionId] = useState<string | null>(null);
  const [numeroPedidoEnEdicion, setNumeroPedidoEnEdicion] = useState<number | null>(null);
  const [compraEnEdicionId, setCompraEnEdicionId] = useState<string | null>(null);
  const [numeroCompraEnEdicion, setNumeroCompraEnEdicion] = useState<number | null>(null);
  const [pedidoEnRegistroId, setPedidoEnRegistroId] = useState<string | null>(null);
  const [numeroPedidoEnRegistro, setNumeroPedidoEnRegistro] = useState<number | null>(null);

  // --- MODALES Y DIÁLOGOS ---
  const [isBuscarModalOpen, setIsBuscarModalOpen] = useState(false);
  const [isCrearArticuloModalOpen, setIsCrearArticuloModalOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isEliminarModalOpen, setIsEliminarModalOpen] = useState(false);
  const [compraAEliminar, setCompraAEliminar] = useState<any>(null);

  // --- DRAWER Y AUDITORÍA ---
  const [drawerCompra, setDrawerCompra] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<any[]>([]);
  const [historialNumeroCompra, setHistorialNumeroCompra] = useState<number | undefined>(undefined);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);

  // --- PROVEEDORES ---
  const [proveedores, setProveedores] = useState<any[]>([]);

  // Helper para color del margen
  const getMarginColor = (m: number) => {
    if (m > 60) return "text-fuchsia-600 font-bold";
    if (m > 50) return "text-orange-600 font-bold";
    if (m >= 40) return "text-emerald-600 font-bold";
    if (m < 40) return "text-red-600 font-bold";
    return "text-slate-600";
  };

  // Cargar lista de proveedores
  useEffect(() => {
    const fetchProveedores = async () => {
      const res = await obtenerProveedores();
      if (res.success && res.data) setProveedores(res.data);
    };
    fetchProveedores();
  }, []);

  // Recuperar borrador de localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved && !pedidoEnEdicionId && !compraEnEdicionId && !pedidoEnRegistroId) {
        const parsed = JSON.parse(saved);
        if (parsed.items && parsed.items.length > 0) {
          setItems(parsed.items);
          if (parsed.proveedor) setProveedor(parsed.proveedor);
          if (parsed.proveedorId) setProveedorId(parsed.proveedorId);
          if (parsed.metodoPago) setMetodoPago(parsed.metodoPago);
          if (parsed.comprobante) setComprobante(parsed.comprobante);
          if (parsed.interes) setInteres(Number(parsed.interes) || 0);
          if (parsed.descuento) setDescuento(Number(parsed.descuento) || 0);
          if (parsed.iva) setIva(Boolean(parsed.iva));
          if (parsed.moneda) setMoneda(parsed.moneda);
          toast.info("Se restauró tu borrador de compra pendiente.", { duration: 3000 });
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Guardar borrador en localStorage cuando cambian los items
  useEffect(() => {
    if (!pedidoEnEdicionId && !compraEnEdicionId && !pedidoEnRegistroId) {
      if (items.length > 0) {
        const draft = {
          items,
          proveedor,
          proveedorId,
          metodoPago,
          comprobante,
          interes,
          descuento,
          iva,
          moneda,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }
  }, [items, proveedor, proveedorId, metodoPago, comprobante, interes, descuento, iva, moneda, pedidoEnEdicionId, compraEnEdicionId, pedidoEnRegistroId]);

  // Atajos de teclado (+ / p para buscar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "+" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        setIsBuscarModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- CÁLCULOS ---
  const totalBase = useMemo(() => {
    return items.reduce((acc, item) => acc + item.subtotal, 0);
  }, [items]);

  const totalFinalCalculado = useMemo(() => {
    return totalBase + interes - descuento;
  }, [totalBase, interes, descuento]);

  const totalUnidades = useMemo(() => {
    return items.reduce((acc, item) => acc + item.cantidad, 0);
  }, [items]);

  // --- MANEJO DE ITEMS EN EL CARRITO ---
  const agregarProductoACompra = useCallback(
    (prod: Articulo) => {
      const existeIndex = items.findIndex((item) => item.productoId === prod.id);
      if (existeIndex >= 0) {
        setItems((prev) =>
          prev.map((item, idx) => {
            if (idx === existeIndex) {
              const nuevaCant = item.cantidad + 1;
              const costoEfectivo = iva ? item.costo_unit * 1.21 : item.costo_unit;
              return {
                ...item,
                cantidad: nuevaCant,
                subtotal: nuevaCant * costoEfectivo,
              };
            }
            return item;
          })
        );
        toast.success(`Se sumó +1 a "${prod.nombre}" (Total: ${items[existeIndex].cantidad + 1})`);
      } else {
        const costoInit = Number(prod.costo) > 0 ? Number(prod.costo) : Number(prod.precio);
        const margenInit = Number(prod.margenGanancia) || 50;
        const costoEfectivo = iva ? costoInit * 1.21 : costoInit;
        const costoArs = moneda === "USD" ? costoEfectivo * dolarCotizacion * factorFob : costoEfectivo;
        const precioPub = Math.round(costoArs * (1 + margenInit / 100));

        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            productoId: prod.id,
            nombre: prod.nombre,
            cantidad: 1,
            costo_unit: costoInit,
            subtotal: costoEfectivo,
            stock: prod.stock,
            ultimaModificacion: prod.ultimaModificacion,
            margenGanancia: margenInit,
            precioPublico: precioPub,
          },
        ]);
        toast.success(`"${prod.nombre}" agregado a la compra`);
      }
    },
    [items, iva, moneda, dolarCotizacion, factorFob]
  );

  const resetForm = () => {
    setItems([]);
    setProveedor("");
    setProveedorId("");
    setInteres(0);
    setDescuento(0);
    setMetodoPago("Efectivo");
    setComprobante("");
    setInfo("");
    setDni("");
    setTelefono("");
    setTransaccionId("");
    setImpactarCostos(false);
    setIva(false);
    setFechaCompra(new Date().toISOString().split("T")[0]);
    setFechaIngreso("");
    setPedidoEnEdicionId(null);
    setNumeroPedidoEnEdicion(null);
    setCompraEnEdicionId(null);
    setNumeroCompraEnEdicion(null);
    setPedidoEnRegistroId(null);
    setNumeroPedidoEnRegistro(null);
    setIsFinalizarModalOpen(false);
    setIsConfirmDiscardOpen(false);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  // --- CARGA DE COMPRA / PEDIDO PARA EDICIÓN ---
  const cargarPedidoParaEdicionCompra = async (compra: PedidoCompraData) => {
    if (!pedidoEnEdicionId && !compraEnEdicionId && items.length > 0) {
      if (!confirm("Hay una compra en curso sin guardar. ¿Descartarla para editar este pedido?")) {
        return;
      }
    }

    const sync = await sincronizarArticulosMostrador();
    const articulosActualizados = sync.success && sync.data ? sync.data : articulos;
    if (sync.success && sync.data) setArticulos(sync.data);

    setProveedor(compra.proveedor || "");
    setProveedorId(compra.proveedorId || "");
    setMetodoPago(compra.metodo_pago || "Efectivo");
    setComprobante((compra as any).comprobante || "");
    setInfo(compra.info || "");
    setDni(compra.dni || "");
    setTelefono(compra.telefono || "");
    setTransaccionId((compra as any).transaccionId || "");
    setInteres(Number(compra.interes) || 0);
    setDescuento(Number(compra.descuento) || 0);
    setImpactarCostos(false);
    setIva(false);
    setMoneda((compra.moneda as "ARS" | "USD") || "ARS");
    setFechaCompra(
      compra.fechaCarga
        ? new Date(compra.fechaCarga).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]
    );
    setFechaIngreso(
      compra.fechaIngreso ? new Date(compra.fechaIngreso).toISOString().split("T")[0] : ""
    );

    setItems(
      compra.items.map((i: any) => {
        const c = Number(i.costo_unit);
        const m = i.margenGanancia || 50;
        const articuloBase = (articulosActualizados as any[]).find((a: any) => a.id === i.productoId);
        return {
          id: i.id || crypto.randomUUID(),
          productoId: i.productoId || undefined,
          nombre: i.nombre,
          cantidad: i.cantidad,
          costo_unit: c,
          subtotal: Number(i.subtotal),
          stock: articuloBase ? articuloBase.stock : 0,
          ultimaModificacion: articuloBase?.ultimaModificacion || null,
          margenGanancia: m,
          precioPublico: Math.round(c * (1 + m / 100)),
        };
      })
    );

    setCompraEnEdicionId(null);
    setNumeroCompraEnEdicion(null);
    setPedidoEnRegistroId(null);
    setNumeroPedidoEnRegistro(null);
    setPedidoEnEdicionId(compra.id);
    setNumeroPedidoEnEdicion((compra as any).numeroCompra ?? null);
    setActiveTab("registrar");
    toast.info(`Modo edición activado para Pedido #${(compra as any).numeroCompra}`);
  };

  const cargarPedidoParaRegistrarCompra = async (compra: PedidoCompraData) => {
    await cargarPedidoParaEdicionCompra(compra);
    setPedidoEnEdicionId(null);
    setNumeroPedidoEnEdicion(null);
    setPedidoEnRegistroId(compra.id);
    setNumeroPedidoEnRegistro((compra as any).numeroCompra ?? null);
    setIsFinalizarModalOpen(true);
  };

  const cargarCompraParaEdicion = async (compra: any) => {
    if (!pedidoEnEdicionId && !compraEnEdicionId && items.length > 0) {
      if (!confirm("Hay una compra en curso sin guardar. ¿Descartarla para editar esta compra?")) {
        return;
      }
    }

    const sync = await sincronizarArticulosMostrador();
    const articulosActualizados = sync.success && sync.data ? sync.data : articulos;
    if (sync.success && sync.data) setArticulos(sync.data);

    setProveedor(compra.proveedor || "");
    setProveedorId(compra.proveedorId || "");
    setMetodoPago(compra.metodo_pago || "Efectivo");
    setComprobante(compra.comprobante || "");
    setInfo(compra.info || "");
    setDni(compra.dni || "");
    setTelefono(compra.telefono || "");
    setTransaccionId(compra.transaccionId || "");
    setInteres(Number(compra.interes) || 0);
    setDescuento(Number(compra.descuento) || 0);
    setImpactarCostos(false);
    setIva(false);
    setMoneda((compra.moneda as "ARS" | "USD") || "ARS");
    setFechaCompra(new Date(compra.fechaCarga || compra.createdAt).toISOString().split("T")[0]);
    setFechaIngreso(
      compra.fechaIngreso ? new Date(compra.fechaIngreso).toISOString().split("T")[0] : ""
    );

    setItems(
      compra.items.map((i: any) => {
        const c = Number(i.costo_unit);
        const m = i.margenGanancia || 50;
        const articuloBase = (articulosActualizados as any[]).find((a: any) => a.id === i.productoId);
        return {
          id: i.id || crypto.randomUUID(),
          productoId: i.productoId || undefined,
          nombre: i.nombre,
          cantidad: i.cantidad,
          costo_unit: c,
          subtotal: Number(i.subtotal),
          stock: articuloBase ? articuloBase.stock : 0,
          ultimaModificacion: articuloBase?.ultimaModificacion || null,
          margenGanancia: m,
          precioPublico: Math.round(c * (1 + m / 100)),
        };
      })
    );

    setPedidoEnEdicionId(null);
    setNumeroPedidoEnEdicion(null);
    setPedidoEnRegistroId(null);
    setNumeroPedidoEnRegistro(null);
    setCompraEnEdicionId(compra.id);
    setNumeroCompraEnEdicion(compra.numeroCompra ?? null);
    setActiveTab("registrar");
    toast.info(`Modo edición activado para Compra #${compra.numeroCompra}`);
  };

  // --- ACTIONS DE GUARDADO ---
  const handleFinalizarCompraDirecta = async () => {
    try {
      setIsSubmitting(true);
      const res = await crearCompra({
        proveedor,
        comprador: compradorNombre,
        moneda,
        total: totalBase,
        interes,
        descuento,
        totalFinal: totalFinalCalculado,
        items: items.map((i) => ({
          ...i,
          costo_unit: iva ? Math.round(i.costo_unit * 1.21 * 100) / 100 : i.costo_unit,
        })),
        metodo_pago: metodoPago,
        dni,
        telefono,
        info,
        comprobante,
        transaccionId,
        proveedorId,
        impactarCostos,
        fechaCompra,
        fechaIngreso,
      });

      if (res.success) {
        toast.success(`¡Compra #${res.numeroCompra} registrada con éxito!`);
        resetForm();
        setHistorialRefreshKey((k) => k + 1);
        setActiveTab("listado");
      } else {
        toast.error("Error al registrar la compra: " + res.error);
      }
    } catch (e: any) {
      toast.error("Ocurrió un error inesperado al guardar la compra.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuardarComoPedido = async () => {
    try {
      setIsSubmitting(true);
      const res = await guardarComoPedidoCompra({
        proveedor,
        comprador: compradorNombre,
        moneda,
        total: totalBase,
        interes,
        descuento,
        totalFinal: totalFinalCalculado,
        items: items.map((i) => ({
          ...i,
          costo_unit: iva ? Math.round(i.costo_unit * 1.21 * 100) / 100 : i.costo_unit,
        })),
        metodo_pago: metodoPago,
        dni,
        telefono,
        info,
        comprobante,
        transaccionId,
        proveedorId,
        impactarCostos,
        fechaCompra,
        fechaIngreso,
      });

      if (res.success) {
        toast.success(`¡Pedido de compra #${res.numeroCompra} creado!`);
        resetForm();
        setPedidosRefreshKey((k) => k + 1);
        setActiveTab("pedidos");
      } else {
        toast.error("Error al guardar el pedido: " + res.error);
      }
    } catch (e) {
      toast.error("Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuardarCambiosPedido = async () => {
    if (!pedidoEnEdicionId) return;
    try {
      setIsSubmitting(true);
      const res = await actualizarPedidoCompra(
        pedidoEnEdicionId,
        {
          proveedor,
          proveedorId,
          moneda,
          total: totalBase,
          interes,
          descuento,
          totalFinal: totalFinalCalculado,
          items: items.map((i) => ({
            ...i,
            costo_unit: iva ? Math.round(i.costo_unit * 1.21 * 100) / 100 : i.costo_unit,
          })),
          metodo_pago: metodoPago,
          dni,
          telefono,
          info,
          comprobante,
          transaccionId,
          impactarCostos,
          fechaCompra,
          fechaIngreso,
        },
        compradorNombre,
        "Pedido editado desde pantalla de compras"
      );

      if (res.success) {
        toast.success("¡Pedido de compra actualizado con éxito!");
        resetForm();
        setPedidosRefreshKey((k) => k + 1);
        setActiveTab("pedidos");
      } else {
        toast.error("Error al actualizar pedido: " + res.error);
      }
    } catch (e) {
      toast.error("Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuardarCambiosCompra = async () => {
    if (!compraEnEdicionId) return;
    try {
      setIsSubmitting(true);
      const res = await actualizarCompra(
        compraEnEdicionId,
        {
          proveedor,
          proveedorId,
          moneda,
          total: totalBase,
          interes,
          descuento,
          totalFinal: totalFinalCalculado,
          items: items.map((i) => ({
            ...i,
            costo_unit: iva ? Math.round(i.costo_unit * 1.21 * 100) / 100 : i.costo_unit,
          })),
          metodo_pago: metodoPago,
          dni,
          telefono,
          info,
          comprobante,
          transaccionId,
          impactarCostos,
          fechaCompra,
          fechaIngreso,
        },
        compradorNombre,
        "Compra editada desde pantalla de compras"
      );

      if (res.success) {
        toast.success("¡Compra modificada con éxito!");
        resetForm();
        setHistorialRefreshKey((k) => k + 1);
        setActiveTab("listado");
      } else {
        toast.error("Error al modificar compra: " + res.error);
      }
    } catch (e) {
      toast.error("Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegistrarPedidoComoCompra = async () => {
    if (!pedidoEnRegistroId) return;
    try {
      setIsSubmitting(true);
      const itemsPayload = items.map((i) => ({
        ...i,
        costo_unit: iva ? Math.round(i.costo_unit * 1.21 * 100) / 100 : i.costo_unit,
      }));

      const resActualizar = await actualizarPedidoCompra(
        pedidoEnRegistroId,
        {
          proveedor,
          proveedorId,
          moneda,
          total: totalBase,
          interes,
          descuento,
          totalFinal: totalFinalCalculado,
          items: itemsPayload,
          metodo_pago: metodoPago,
          dni,
          telefono,
          info,
          comprobante,
          transaccionId,
          impactarCostos: false,
          fechaCompra,
          fechaIngreso,
        },
        compradorNombre,
        "Datos actualizados al registrar como compra efectiva"
      );

      if (!resActualizar.success) {
        toast.error("Error al actualizar pedido: " + resActualizar.error);
        return;
      }

      const resConfirmar = await confirmarPedidoCompra(pedidoEnRegistroId, {
        impactarCostos,
        items: itemsPayload,
        usuario: compradorNombre,
        moneda,
      });

      if (resConfirmar.success) {
        toast.success("¡Pedido registrado como compra efectiva (stock acreditado)!");
        resetForm();
        setPedidosRefreshKey((k) => k + 1);
        setHistorialRefreshKey((k) => k + 1);
        setActiveTab("listado");
      } else {
        toast.error("Error al confirmar recepción: " + resConfirmar.error);
      }
    } catch (e) {
      toast.error("Ocurrió un error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEliminarCompraConfirmada = async () => {
    if (!compraAEliminar) return;
    try {
      const res = await eliminarCompra(compraAEliminar.id, compradorNombre);
      if (res.success) {
        toast.success(`Compra #${compraAEliminar.numeroCompra} eliminada y stock revertido.`);
        setIsEliminarModalOpen(false);
        setCompraAEliminar(null);
        setHistorialRefreshKey((k) => k + 1);
      } else {
        toast.error("Error al eliminar compra: " + res.error);
      }
    } catch (e) {
      toast.error("Error al eliminar compra.");
    }
  };

  const abrirModalHistorial = async (id: string, numeroCompra?: number) => {
    setHistorialActual([]);
    setHistorialNumeroCompra(numeroCompra);
    setIsHistorialModalOpen(true);
    setIsLoadingHistorial(true);
    try {
      const res = await obtenerHistorialCompra(id);
      if (res.success && res.data) {
        setHistorialActual(res.data);
      }
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const abrirDetalleDrawer = (compra: any) => {
    setDrawerCompra(compra);
    setIsDrawerOpen(true);
  };

  const inputSinFlechas =
    "text-right bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="h-screen flex flex-col bg-slate-50/50 overflow-hidden relative">
      {/* CABECERA PRINCIPAL */}
      <header className="bg-white border-b border-slate-200 px-8 py-3 flex items-center justify-between flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all"
            title="Volver al panel"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-2.5 rounded-xl text-white shadow-md shadow-emerald-600/20">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
                <span>Gestión de Compras</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                  Stock & Costos
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Entrada de mercadería y control de proveedores</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right border-l pl-4 border-slate-200">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Responsable</p>
            <p className="text-sm font-bold text-emerald-700">{compradorNombre}</p>
          </div>
        </div>
      </header>

      {/* PESTAÑAS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col overflow-hidden h-full w-full">
        <div className="bg-white border-b border-slate-200 px-8 py-1.5 shadow-sm">
          <TabsList className="bg-slate-100/80 p-1 w-full max-w-2xl flex justify-start rounded-xl gap-1">
            <TabsTrigger
              value="registrar"
              className="gap-2 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm font-bold text-xs"
            >
              <Plus className="h-4 w-4 text-emerald-600" />
              Nueva Compra
              {items.length > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {items.length}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="listado"
              className="gap-2 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm font-bold text-xs"
            >
              <ClipboardList className="h-4 w-4 text-blue-600" />
              Historial y Gestión
            </TabsTrigger>

            <TabsTrigger
              value="pedidos"
              className="gap-2 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-900 data-[state=active]:shadow-sm font-bold text-xs"
            >
              <Clock className="h-4 w-4 text-indigo-600" />
              Pedidos de Compra
            </TabsTrigger>
          </TabsList>
        </div>

        {/* --- PESTAÑA: NUEVA COMPRA --- */}
        <TabsContent value="registrar" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <main className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden h-full">
            {/* BANNERS DE MODO EDICIÓN */}
            {pedidoEnEdicionId && (
              <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-3 shadow-sm shrink-0">
                <span className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                  <Edit className="h-4 w-4 text-indigo-600" />
                  Editando Pedido de Compra #{numeroPedidoEnEdicion}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setActiveTab("pedidos");
                  }}
                  className="text-indigo-700 hover:bg-indigo-100 font-semibold text-xs"
                >
                  Cancelar edición
                </Button>
              </div>
            )}

            {compraEnEdicionId && (
              <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 shadow-sm shrink-0">
                <span className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <Edit className="h-4 w-4 text-amber-600" />
                  Editando Compra Registrada #{numeroCompraEnEdicion}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setActiveTab("listado");
                  }}
                  className="text-amber-700 hover:bg-amber-100 font-semibold text-xs"
                >
                  Cancelar edición
                </Button>
              </div>
            )}

            {pedidoEnRegistroId && (
              <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 shadow-sm shrink-0">
                <span className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  Registrando Recepción de Pedido #{numeroPedidoEnRegistro} como Compra Efectiva
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setActiveTab("pedidos");
                  }}
                  className="text-emerald-700 hover:bg-emerald-100 font-semibold text-xs"
                >
                  Cancelar registro
                </Button>
              </div>
            )}

            {/* BARRA DE ACCIONES SUPERIOR */}
            <div className="flex gap-3 items-center flex-wrap shrink-0">
              <Button
                onClick={() => setIsBuscarModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-6 h-11 rounded-2xl shadow-md font-bold text-xs"
              >
                <Plus className="h-4 w-4 text-emerald-400" /> Buscar Artículo ( + / P )
              </Button>

              <button
                type="button"
                onClick={() => {
                  const newIva = !iva;
                  setIva(newIva);
                  setItems((prev) =>
                    prev.map((i) => {
                      const costoEfectivo = newIva ? i.costo_unit * 1.21 : i.costo_unit;
                      const costoArs =
                        moneda === "USD" ? costoEfectivo * dolarCotizacion * factorFob : costoEfectivo;
                      const newPrecio = Math.round(costoArs * (1 + (i.margenGanancia ?? 50) / 100));
                      return {
                        ...i,
                        subtotal: i.cantidad * costoEfectivo,
                        precioPublico: newPrecio,
                      };
                    })
                  );
                }}
                className={`flex items-center gap-2 px-4 h-11 rounded-2xl border font-bold text-xs transition-all ${
                  iva
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Percent className="h-4 w-4" />
                IVA 21%
                <span
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                    iva ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {iva ? "ACTIVO" : "OFF"}
                </span>
              </button>

              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1 h-11">
                <button
                  type="button"
                  onClick={() => setMoneda("ARS")}
                  className={`px-3 h-full text-xs font-bold rounded-xl transition-all ${
                    moneda === "ARS" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  $ ARS
                </button>
                <button
                  type="button"
                  onClick={() => setMoneda("USD")}
                  className={`px-3 h-full text-xs font-bold rounded-xl transition-all ${
                    moneda === "USD" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  U$S USD
                </button>
              </div>

              <Button
                onClick={() => setIsCrearArticuloModalOpen(true)}
                variant="outline"
                className="ml-auto border-emerald-200 text-emerald-800 hover:bg-emerald-50 gap-2 px-5 h-11 rounded-2xl font-bold text-xs shrink-0"
              >
                <Sparkles className="h-4 w-4 text-emerald-600" /> Crear nuevo artículo
              </Button>
            </div>

            {/* TABLA DE ARTÍCULOS EN LA COMPRA */}
            <div className="flex-grow bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-y-auto flex-grow h-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm border-b border-slate-200">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase py-3.5">Artículo / SKU</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3.5 w-24">Cantidad</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3.5 w-36">
                        Costo Unit. {iva && <span className="text-emerald-600 lowercase">(+iva)</span>}
                      </TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3.5 w-28">Margen %</TableHead>
                      <TableHead className="text-center text-[10px] font-bold uppercase py-3.5 w-36">PVP Sugerido</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase py-3.5 w-36">Subtotal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-24 text-center">
                          <ShoppingBag className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                          <p className="text-base font-bold text-slate-700">No hay artículos cargados</p>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
                            Presiona el botón "Buscar Artículo" o la tecla <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono">+</kbd> para comenzar a agregar productos.
                          </p>
                          <Button
                            onClick={() => setIsBuscarModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow"
                          >
                            <Plus className="h-4 w-4 mr-1" /> Buscar Primer Artículo
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-slate-50/70 transition-colors border-b">
                          <TableCell className="font-medium text-slate-800 py-3">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">{item.nombre}</span>
                                <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                                  Stock: {item.stock}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase">
                                {item.productoId || "SIN CÓDIGO"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="text-center py-3">
                            <Input
                              type="number"
                              min="1"
                              value={item.cantidad}
                              onChange={(e) => {
                                const cant = Math.max(1, parseInt(e.target.value) || 1);
                                const costoEfectivo = iva ? item.costo_unit * 1.21 : item.costo_unit;
                                setItems(
                                  items.map((i) =>
                                    i.id === item.id
                                      ? {
                                          ...i,
                                          cantidad: cant,
                                          subtotal: cant * costoEfectivo,
                                        }
                                      : i
                                  )
                                );
                              }}
                              className={`w-20 mx-auto h-9 font-bold text-center rounded-xl ${inputSinFlechas}`}
                            />
                          </TableCell>

                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400 text-xs">$</span>
                              <DecimalInput
                                value={item.costo_unit}
                                onChange={(newCost) => {
                                  const costoEfectivo = iva ? newCost * 1.21 : newCost;
                                  const costoArs =
                                    moneda === "USD"
                                      ? costoEfectivo * dolarCotizacion * factorFob
                                      : costoEfectivo;
                                  const newPrecio = Math.round(
                                    costoArs * (1 + (item.margenGanancia ?? 50) / 100)
                                  );
                                  setItems(
                                    items.map((i) =>
                                      i.id === item.id
                                        ? {
                                            ...i,
                                            costo_unit: newCost,
                                            subtotal: i.cantidad * costoEfectivo,
                                            precioPublico: newPrecio,
                                          }
                                        : i
                                    )
                                  );
                                }}
                                className={`w-28 h-9 font-bold rounded-xl ${inputSinFlechas}`}
                              />
                            </div>
                            {iva && item.costo_unit > 0 && (
                              <div className="text-[10px] text-emerald-600 text-center mt-0.5 font-medium">
                                = ${(item.costo_unit * 1.21).toLocaleString("es-AR", { maximumFractionDigits: 2 })} c/IVA
                              </div>
                            )}
                            {moneda === "USD" && item.costo_unit > 0 && (
                              <div className="text-[10px] text-blue-500 text-center mt-0.5">
                                = $
                                {Math.round(
                                  (iva ? item.costo_unit * 1.21 : item.costo_unit) *
                                    dolarCotizacion *
                                    factorFob
                                ).toLocaleString("es-AR")}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <DecimalInput
                                value={item.margenGanancia ?? 50}
                                onChange={(newMargin) => {
                                  const costoEfectivo = iva ? item.costo_unit * 1.21 : item.costo_unit;
                                  const costoArs =
                                    moneda === "USD"
                                      ? costoEfectivo * dolarCotizacion * factorFob
                                      : costoEfectivo;
                                  const newPrecio = Math.round(costoArs * (1 + newMargin / 100));
                                  setItems(
                                    items.map((i) =>
                                      i.id === item.id
                                        ? {
                                            ...i,
                                            margenGanancia: newMargin,
                                            precioPublico: newPrecio,
                                          }
                                        : i
                                    )
                                  );
                                }}
                                className={`w-20 h-9 font-bold text-center rounded-xl ${inputSinFlechas} ${getMarginColor(
                                  item.margenGanancia ?? 50
                                )}`}
                              />
                              <span className="text-slate-400 text-xs">%</span>
                            </div>
                          </TableCell>

                          <TableCell className="text-center py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-emerald-600 text-xs">$</span>
                              <DecimalInput
                                value={item.precioPublico ?? 0}
                                onChange={(newPrice) => {
                                  const cost = iva ? item.costo_unit * 1.21 : item.costo_unit;
                                  const newMargin =
                                    cost > 0
                                      ? Math.round(((newPrice - cost) / cost) * 100 * 100) / 100
                                      : 0;
                                  setItems(
                                    items.map((i) =>
                                      i.id === item.id
                                        ? {
                                            ...i,
                                            precioPublico: newPrice,
                                            margenGanancia: newMargin,
                                          }
                                        : i
                                    )
                                  );
                                }}
                                className={`w-28 h-9 rounded-xl ${inputSinFlechas} text-emerald-700 font-black`}
                              />
                            </div>
                          </TableCell>

                          <TableCell className="text-right py-3 font-black text-slate-900 text-sm">
                            ${item.subtotal.toLocaleString("es-AR")}
                          </TableCell>

                          <TableCell className="py-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setItems(items.filter((i) => i.id !== item.id));
                                toast.info(`"${item.nombre}" eliminado de la compra.`);
                              }}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                            >
                              <Trash2 className="h-4 w-4" />
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

          {/* BARRA INFERIOR / FOOTER DE CHECKOUT */}
          <footer className="bg-white border-t border-slate-200 px-8 py-4 flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-20">
            <div className="max-w-[1600px] mx-auto flex justify-between items-center">
              <div className="flex items-center gap-8">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Artículos
                  </span>
                  <span className="text-xl font-bold text-slate-700">
                    {items.length} productos ({totalUnidades} u.)
                  </span>
                </div>

                <div className="border-l pl-8 border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Subtotal Base
                  </span>
                  <span className="text-3xl font-black text-slate-900 tracking-tight">
                    ${totalBase.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsConfirmDiscardOpen(true)}
                  disabled={items.length === 0}
                  className="text-red-600 border-red-200 hover:bg-red-50 h-12 rounded-2xl font-bold text-xs px-6"
                >
                  Descartar Borrador
                </Button>

                <Button
                  onClick={() => setIsFinalizarModalOpen(true)}
                  disabled={items.length === 0 || isSubmitting}
                  className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/20"
                >
                  {pedidoEnEdicionId
                    ? "Guardar Cambios del Pedido"
                    : compraEnEdicionId
                    ? "Guardar Cambios de la Compra"
                    : pedidoEnRegistroId
                    ? "Registrar Recepción de Pedido"
                    : "Finalizar Compra"}
                </Button>
              </div>
            </div>
          </footer>
        </TabsContent>

        {/* --- PESTAÑA: HISTORIAL Y GESTIÓN --- */}
        <TabsContent value="listado" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
          <TablaComprasHistorial
            key={historialRefreshKey}
            onEditarCompra={cargarCompraParaEdicion}
            onEliminarCompra={(c) => {
              setCompraAEliminar(c);
              setIsEliminarModalOpen(true);
            }}
            onVerHistorial={abrirModalHistorial}
            onVerDetalle={abrirDetalleDrawer}
            refreshTrigger={historialRefreshKey}
          />
        </TabsContent>

        {/* --- PESTAÑA: PEDIDOS DE COMPRA --- */}
        <TabsContent value="pedidos" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full bg-white">
          <div className="flex-grow overflow-auto">
            <PedidosCompraClient
              key={pedidosRefreshKey}
              initialData={[]}
              dolarCotizacion={dolarCotizacion}
              factorFob={factorFob}
              onEditarPedido={cargarPedidoParaEdicionCompra}
              onRegistrarPedido={cargarPedidoParaRegistrarCompra}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* --- MODALES Y DIÁLOGOS --- */}

      {/* 1. Modal Buscador de Artículos */}
      <ModalBuscarArticulo
        isOpen={isBuscarModalOpen}
        onOpenChange={setIsBuscarModalOpen}
        onSelectArticulo={agregarProductoACompra}
        onCrearNuevoArticulo={() => setIsCrearArticuloModalOpen(true)}
        articulosIniciales={articulos}
      />

      {/* 2. Modal Alta Rápida de Artículo */}
      <ModalNuevoArticulo
        isOpen={isCrearArticuloModalOpen}
        onOpenChange={setIsCrearArticuloModalOpen}
        onArticuloCreado={(nuevo) => {
          setArticulos((prev) => [nuevo, ...prev]);
          agregarProductoACompra(nuevo);
        }}
      />

      {/* 3. Modal Finalizar Compra (UNIFICADO) */}
      <ModalFinalizarCompra
        isOpen={isFinalizarModalOpen}
        onOpenChange={setIsFinalizarModalOpen}
        totalBase={totalBase}
        totalFinal={totalFinalCalculado}
        cantidadArticulos={items.length}
        totalUnidades={totalUnidades}
        proveedor={proveedor}
        setProveedor={setProveedor}
        proveedorId={proveedorId}
        setProveedorId={setProveedorId}
        metodoPago={metodoPago}
        setMetodoPago={setMetodoPago}
        comprobante={comprobante}
        setComprobante={setComprobante}
        interes={interes}
        setInteres={setInteres}
        descuento={descuento}
        setDescuento={setDescuento}
        fechaCompra={fechaCompra}
        setFechaCompra={setFechaCompra}
        fechaIngreso={fechaIngreso}
        setFechaIngreso={setFechaIngreso}
        impactarCostos={impactarCostos}
        setImpactarCostos={setImpactarCostos}
        moneda={moneda}
        setMoneda={setMoneda}
        dolarCotizacion={dolarCotizacion}
        setDolarCotizacion={setDolarCotizacion}
        proveedores={proveedores}
        pedidoEnEdicionId={pedidoEnEdicionId}
        numeroPedidoEnEdicion={numeroPedidoEnEdicion}
        compraEnEdicionId={compraEnEdicionId}
        numeroCompraEnEdicion={numeroCompraEnEdicion}
        pedidoEnRegistroId={pedidoEnRegistroId}
        numeroPedidoEnRegistro={numeroPedidoEnRegistro}
        isSubmitting={isSubmitting}
        onConfirmarCompraDirecta={handleFinalizarCompraDirecta}
        onGuardarComoPedido={handleGuardarComoPedido}
        onGuardarCambiosPedido={handleGuardarCambiosPedido}
        onGuardarCambiosCompra={handleGuardarCambiosCompra}
        onRegistrarPedidoComoCompra={handleRegistrarPedidoComoCompra}
      />

      {/* 4. Drawer de Detalle Lateral */}
      <DrawerDetalleCompra
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        compra={drawerCompra}
        onEditar={(c) => {
          setIsDrawerOpen(false);
          cargarCompraParaEdicion(c);
        }}
        onEliminar={(c) => {
          setIsDrawerOpen(false);
          setCompraAEliminar(c);
          setIsEliminarModalOpen(true);
        }}
        onVerHistorial={(id) => {
          setIsDrawerOpen(false);
          abrirModalHistorial(id, drawerCompra?.numeroCompra);
        }}
      />

      {/* 5. Modal Historial Auditoría */}
      <ModalHistorialAuditoria
        isOpen={isHistorialModalOpen}
        onOpenChange={setIsHistorialModalOpen}
        historial={historialActual}
        isLoading={isLoadingHistorial}
        numeroCompra={historialNumeroCompra}
      />

      {/* 6. Confirm Dialog para Descartar Borrador */}
      <ConfirmDialog
        open={isConfirmDiscardOpen}
        onOpenChange={setIsConfirmDiscardOpen}
        title="¿Descartar compra actual?"
        description="Se borrarán todos los artículos agregados a la lista de compra en curso. Esta acción no se puede deshacer."
        confirmLabel="Sí, descartar todo"
        cancelLabel="Continuar editando"
        variant="danger"
        onConfirm={() => {
          resetForm();
          toast.info("Borrador descartado.");
        }}
      />

      {/* 7. Confirm Dialog para Eliminar Compra */}
      <ConfirmDialog
        open={isEliminarModalOpen}
        onOpenChange={setIsEliminarModalOpen}
        title={`¿Eliminar Compra #${compraAEliminar?.numeroCompra}?`}
        description="Esta acción revertirá el stock que se incrementó al registrar la compra y anulará cualquier movimiento en Cuenta Corriente asociado."
        confirmLabel="Eliminar definitivamente"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleEliminarCompraConfirmada}
      />
    </div>
  );
}
