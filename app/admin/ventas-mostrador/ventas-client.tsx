"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  ClipboardList,
  Clock,
  Package,
  Edit,
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Tipos y Constantes
import { Articulo, PuntoVenta, Proveedor, ItemVenta } from "./types";
import { redondearA50 } from "./constants";

// Custom Hooks
import { usePosCart } from "./hooks/use-pos-cart";
import { useVentasListado } from "./hooks/use-ventas-listado";

// Pestañas
import { RegistrarVentaTab } from "./components/tabs/registrar-venta-tab";
import { ListadoVentasTab } from "./components/tabs/listado-ventas-tab";
import { PedidosVentasTab } from "./components/tabs/pedidos-ventas-tab";
import { GestionEdicionTab } from "./components/tabs/gestion-edicion-tab";
import EnviosAndreaniTab from "./envios-andreani-tab";

// Modales
import { BuscadorArticulosModal } from "./components/modals/buscador-articulos-modal";
import { FinalizarVentaModal } from "./components/modals/finalizar-venta-modal";
import { EditarVentaModal } from "./components/modals/editar-venta-modal";
import { EliminarVentaModal } from "./components/modals/eliminar-venta-modal";
import { HistorialVentaModal } from "./components/modals/historial-venta-modal";
import { FotosAuditoriaModal } from "./components/modals/fotos-auditoria-modal";
import { AlertaMLModal } from "./components/modals/alerta-ml-modal";
import { RefacturarModal } from "./components/modals/refacturar-modal";
import { FastUpdateDbModal } from "./components/modals/fast-update-db-modal";
import { CrearArticuloModal } from "./components/modals/crear-articulo-modal";
import { CrearProveedorModal } from "./components/modals/crear-proveedor-modal";
import { ExportarExcelModal } from "./components/modals/exportar-excel-modal";

// Componentes de Impresión
import { TicketImpresion } from "./components/print/ticket-impresion";
import { FacturaA4 } from "./components/print/factura-a4";
import { PedidoVentaA4 } from "./components/print/pedido-venta-a4";

// Server Actions
import {
  crearVentaMostrador,
  guardarComoPedidoVenta,
  actualizarPedidoVenta,
  generarFacturaARCA,
  obtenerHistorialVenta,
} from "@/app/actions/ventas-mostrador";
import {
  obtenerProveedores,
} from "@/app/actions/listas";
import {
  obtenerFotosEnvio,
  obtenerEnviosConFoto,
} from "@/app/actions/preparacion";
import {
  obtenerFotosPedido,
  obtenerPedidosConFoto,
} from "@/app/actions/preparacion-pedidos";

interface Props {
  articulosIniciales: Articulo[];
  vendedorNombre: string;
  puntosVenta?: PuntoVenta[];
  config?: any;
}

export default function VentasMostradorClient({
  articulosIniciales,
  vendedorNombre,
  puntosVenta = [],
  config,
}: Props) {
  // Catálogo de artículos local
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  // Pestaña activa
  const [activeTab, setActiveTab] = useState("registrar");
  const [pedidosRefreshKey, setPedidosRefreshKey] = useState(0);

  // Estados de feedback
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hook del carrito POS
  const cart = usePosCart(articulos);

  // Hook del listado de ventas
  const listado = useVentasListado();

  // Estados para checkout / datos de cliente y AFIP
  const [cliente, setCliente] = useState("Consumidor Final");
  const [cuitBusqueda, setCuitBusqueda] = useState("");
  const [docTipo, setDocTipo] = useState<number>(99);
  const [docNro, setDocNro] = useState<string>("");
  const [condicionIva, setCondicionIva] = useState<number>(5);
  const [tipoFacturaSugerida, setTipoFacturaSugerida] = useState<number>(6);
  const [sujetoId, setSujetoId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [eventoOffline, setEventoOffline] = useState(false);
  const [puntoVentaId, setPuntoVentaId] = useState("");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [isPagoMixto, setIsPagoMixto] = useState(false);
  const [montoPago1, setMontoPago1] = useState<number>(0);
  const [metodoPago2, setMetodoPago2] = useState("Tarjeta de Crédito");
  const [procesadorTarjeta, setProcesadorTarjeta] = useState("Posnet Intercap");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [info, setInfo] = useState("");
  const [cupon, setCupon] = useState("");
  const [transaccionId, setTransaccionId] = useState("");
  const [deCruzada, setDeCruzada] = useState("");
  const [paraCruzada, setParaCruzada] = useState("");
  const [proveedoresCruzada, setProveedoresCruzada] = useState<
    { id: string; razonSocial: string; monto: number }[]
  >([]);
  const [paraCuentaCorriente, setParaCuentaCorriente] = useState("");
  const [mlIdVenta, setMlIdVenta] = useState("");
  const [mlIdEnvio, setMlIdEnvio] = useState("");
  const [mlMla, setMlMla] = useState("");
  const [mlDni, setMlDni] = useState("");
  const [solicitarFactura, setSolicitarFactura] = useState(false);

  // Estados para edición de pedidos desde mostrador
  const [pedidoEnEdicionId, setPedidoEnEdicionId] = useState<string | null>(null);
  const [numeroPedidoEnEdicion, setNumeroPedidoEnEdicion] = useState<number | null>(null);
  const [pedidoEdicionExtra, setPedidoEdicionExtra] = useState<{
    tipoEnvio?: string | null;
    mlPackId?: string | null;
  } | null>(null);

  // Modales abiertos/cerrados
  const [isBuscadorOpen, setIsBuscadorOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isCrearArticuloOpen, setIsCrearArticuloOpen] = useState(false);
  const [isCrearProveedorOpen, setIsCrearProveedorOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isEditarVentaOpen, setIsEditarVentaOpen] = useState(false);
  const [ventaParaEditar, setVentaParaEditar] = useState<any>(null);
  const [editItems, setEditItems] = useState<ItemVenta[]>([]);
  const [isEliminarModalOpen, setIsEliminarModalOpen] = useState(false);
  const [ventaParaEliminar, setVentaParaEliminar] = useState<any>(null);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<any[]>([]);
  const [isAlertaMLOpen, setIsAlertaMLOpen] = useState(false);
  const [ventaParaAlerta, setVentaParaAlerta] = useState<any>(null);
  const [isRefacturarOpen, setIsRefacturarOpen] = useState(false);
  const [ventaParaRefacturar, setVentaParaRefacturar] = useState<any>(null);
  const [isFastUpdateDbOpen, setIsFastUpdateDbOpen] = useState(false);
  const [fastUpdateData, setFastUpdateData] = useState<{
    id: string;
    nombre: string;
    oldPrice: number;
    newPrice: number;
  } | null>(null);

  // Fotos de auditoría
  const [fotosVenta, setFotosVenta] = useState<{ venta: any; fotos: any[] } | null>(null);
  const [loadingFotosVentaId, setLoadingFotosVentaId] = useState<string | null>(null);
  const [enviosConFoto, setEnviosConFoto] = useState<Set<string>>(new Set());
  const [pedidosConFoto, setPedidosConFoto] = useState<Record<string, string>>({});

  // Impresión
  const [ventaParaImprimir, setVentaParaImprimir] = useState<any>(null);
  const [ventaParaFactura, setVentaParaFactura] = useState<any>(null);
  const [ventaParaPedido, setVentaParaPedido] = useState<any>(null);

  // Actualizar catálogo al recibir props
  useEffect(() => {
    setArticulos(articulosIniciales);
  }, [articulosIniciales]);

  // Cargar proveedores al montar
  useEffect(() => {
    obtenerProveedores().then((res) => {
      if (res.success && res.data) setProveedores(res.data);
    });
  }, []);

  // Punto de venta por defecto
  useEffect(() => {
    if (!puntoVentaId && puntosVenta.length > 0) {
      const mostrador = puntosVenta.find((p) => p.nombre === "Mostrador");
      if (mostrador) setPuntoVentaId(mostrador.id);
    }
  }, [puntosVenta, puntoVentaId]);

  // Mensaje de éxito temporal
  const mostrarMensajeExito = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }, []);

  // Copiar al portapapeles con feedback visual
  const copiarAlPortapapeles = useCallback((texto: string) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 1500);
  }, []);

  // Atajos de teclado globales POS (+, F2, F4, F9, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si estamos dentro de un input de texto normal
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT";

      if ((e.key === "+" || e.key === "F2") && !isBuscadorOpen && !isFinalizarModalOpen) {
        if (!isInputFocused || e.key === "F2") {
          e.preventDefault();
          setIsBuscadorOpen(true);
        }
      } else if (e.key === "F4" && !isFinalizarModalOpen && activeTab === "registrar") {
        e.preventDefault();
        if (cart.items.length > 0) {
          setIsFinalizarModalOpen(true);
        }
      } else if (e.key === "F9" && activeTab === "registrar") {
        e.preventDefault();
        handleImprimirPresupuesto();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBuscadorOpen, isFinalizarModalOpen, activeTab, cart.items.length]);

  // Detección por lote de fotos ML y fotos de pedidos
  useEffect(() => {
    const envioIds = Array.from(
      new Set(
        [...listado.ventasRealizadas, ...listado.ventasML, ...(listado.ventasGlobales || [])]
          .map((v) => v.mlIdEnvio)
          .filter(Boolean)
      )
    );
    if (envioIds.length > 0) {
      obtenerEnviosConFoto(envioIds).then((res) => {
        if (res.success) setEnviosConFoto(new Set(res.envioIds));
      });
    }
  }, [listado.ventasRealizadas, listado.ventasML, listado.ventasGlobales]);

  useEffect(() => {
    const ventaIds = Array.from(
      new Set(
        [...listado.ventasRealizadas, ...listado.ventasML, ...(listado.ventasGlobales || [])]
          .map((v) => v.id)
          .filter(Boolean)
      )
    );
    if (ventaIds.length > 0) {
      obtenerPedidosConFoto(ventaIds).then((res) => {
        if (res.success) setPedidosConFoto(res.estados);
      });
    }
  }, [listado.ventasRealizadas, listado.ventasML, listado.ventasGlobales]);

  const resetFormularioPOS = useCallback(() => {
    cart.resetCart();
    setCliente("Consumidor Final");
    setCuitBusqueda("");
    setDocTipo(99);
    setDocNro("");
    setCondicionIva(5);
    setTipoFacturaSugerida(6);
    setSujetoId(null);
    setEmail("");
    setEventoOffline(false);
    setMetodoPago("Efectivo");
    setIsPagoMixto(false);
    setMontoPago1(0);
    setMetodoPago2("Tarjeta de Crédito");
    setDni("");
    setTelefono("");
    setInfo("");
    setCupon("");
    setTransaccionId("");
    setDeCruzada("");
    setParaCruzada("");
    setProveedoresCruzada([]);
    setParaCuentaCorriente("");
    setMlIdVenta("");
    setMlIdEnvio("");
    setMlMla("");
    setMlDni("");
    setSolicitarFactura(false);
    setPedidoEnEdicionId(null);
    setNumeroPedidoEnEdicion(null);
    setPedidoEdicionExtra(null);
  }, [cart]);

  // Manejo de carga de pedido para edición en el mostrador
  const handleCargarPedidoParaEdicion = useCallback(
    (pedido: any) => {
      setPedidoEnEdicionId(pedido.id);
      setNumeroPedidoEnEdicion(pedido.numeroVenta || null);
      setPedidoEdicionExtra({
        tipoEnvio: pedido.tipoEnvio || null,
        mlPackId: pedido.mlPackId || null,
      });
      setCliente(pedido.cliente || "Consumidor Final");
      setMetodoPago(pedido.metodo_pago || "Efectivo");
      setDni(pedido.dni || "");
      setTelefono(pedido.telefono || "");
      setInfo(pedido.info || "");
      setCupon(pedido.cupon || "");
      setTransaccionId(pedido.transaccionId || "");
      setDeCruzada(pedido.de || "");
      if (pedido.para) {
        try {
          const parsed = JSON.parse(pedido.para);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProveedoresCruzada(
              parsed.map((p: any) => ({
                id: p.id || crypto.randomUUID(),
                razonSocial: p.razonSocial || p.nombre || "",
                monto: Number(p.monto) || 0,
              }))
            );
            setParaCruzada(parsed[0]?.razonSocial || "");
          } else {
            setParaCruzada(pedido.para);
            setProveedoresCruzada([
              {
                id: crypto.randomUUID(),
                razonSocial: pedido.para,
                monto: Number(pedido.totalFinal || pedido.total || 0),
              },
            ]);
          }
        } catch {
          setParaCruzada(pedido.para);
          setProveedoresCruzada([
            {
              id: crypto.randomUUID(),
              razonSocial: pedido.para,
              monto: Number(pedido.totalFinal || pedido.total || 0),
            },
          ]);
        }
      } else {
        setParaCruzada("");
        setProveedoresCruzada([]);
      }
      setEmail(pedido.email || "");
      setEventoOffline(pedido.eventoOffline || false);
      setPuntoVentaId(pedido.puntoVentaId || "");

      cart.setInteresTarjeta(Number(pedido.interes || 0));
      cart.setItems(
        (pedido.items || []).map((i: any) => ({
          id: i.id || crypto.randomUUID(),
          productoId: i.productoId || i.id,
          nombre: i.nombre,
          cantidad: Number(i.cantidad),
          precio_unit: Number(i.precio_unit),
          subtotal: Number(i.subtotal),
          stock: i.stock || 0,
          costo: i.costo ? Number(i.costo) : 0,
          esNota: i.esNota || false,
        }))
      );

      setActiveTab("registrar");
      mostrarMensajeExito(`Editando pedido #${pedido.numeroVenta || pedido.id.slice(0, 8)}`);
    },
    [cart, mostrarMensajeExito]
  );

  // Finalizar venta o guardar como pedido
  const handleFinalizarVenta = async (
    overrideComoPedido?: boolean,
    fiscalizar: boolean = false
  ) => {
    const isEditMode = !!pedidoEnEdicionId;
    const isPedido = isEditMode ? true : overrideComoPedido === true;

    const esGoCuotas =
      (metodoPago === "Tarjeta de Crédito" && procesadorTarjeta === "Go Cuotas") ||
      (isPagoMixto &&
        ((metodoPago === "Tarjeta de Crédito" && procesadorTarjeta === "Go Cuotas") ||
          (metodoPago2 === "Tarjeta de Crédito" && procesadorTarjeta === "Go Cuotas")));

    const esMercadoPago =
      metodoPago === "MercadoPago" ||
      (isPagoMixto && (metodoPago === "MercadoPago" || metodoPago2 === "MercadoPago"));

    const esFacturacionObligatoria = !isPedido && (esGoCuotas || esMercadoPago);
    const debeFiscalizar = fiscalizar || esFacturacionObligatoria;

    if (debeFiscalizar) {
      const docOk = (docNro && docNro !== "0") || cuitBusqueda.length > 6;
      if (!docOk) {
        alert(
          `Para cobrar con ${
            esGoCuotas ? "Go Cuotas" : esMercadoPago ? "MercadoPago" : "facturación AFIP"
          } es obligatorio ingresar el CUIT o DNI del cliente en el Padrón AFIP.`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const isCredito1 = metodoPago === "Tarjeta de Crédito";
      const isCredito2 = metodoPago2 === "Tarjeta de Crédito";
      const base1 = isPagoMixto ? Number(montoPago1 || 0) : cart.totalConDescuento;
      const base2 = isPagoMixto ? Math.max(0, cart.totalConDescuento - base1) : 0;
      const final1 = isCredito1 ? redondearA50(base1 * (1 + cart.interesTarjeta / 100)) : base1;
      const final2 = isCredito2 ? redondearA50(base2 * (1 + cart.interesTarjeta / 100)) : base2;
      const totalFinalCalculado = isPagoMixto
        ? final1 + final2
        : isCredito1
        ? redondearA50(cart.totalConDescuento * (1 + cart.interesTarjeta / 100))
        : cart.totalConDescuento;

      let metodoPagoFinal = isPagoMixto ? "Mixto" : metodoPago;
      let infoFinal = info || (isPedido ? "Pedido de venta - pendiente de confirmación" : "Venta confirmada");

      if (isPagoMixto) {
        const det = `[Mixto -> ${metodoPago}: $${final1.toLocaleString("es-AR")} | ${metodoPago2}: $${final2.toLocaleString("es-AR")}]`;
        infoFinal = info ? `${det} - ${info}` : det;
      }

      if (cart.montoDescuento > 0) {
        const detDescuento =
          cart.descuentoTipo === "porcentaje"
            ? `[Descuento: ${cart.descuentoValor}% (-$${cart.montoDescuento.toLocaleString("es-AR")})]`
            : `[Descuento: -$${cart.montoDescuento.toLocaleString("es-AR")}]`;
        infoFinal = `${detDescuento} ${infoFinal}`;
      }

      const esMixtoCruzadaCC =
        isPagoMixto &&
        ((metodoPago === "Cruzada" && metodoPago2 === "A Cuenta Corriente") ||
          (metodoPago === "A Cuenta Corriente" && metodoPago2 === "Cruzada"));

      let paraFinal = paraCruzada;
      if (metodoPago === "Cruzada" && !isPagoMixto) {
        paraFinal = JSON.stringify(proveedoresCruzada);
      } else if (esMixtoCruzadaCC) {
        const montoCruzada = metodoPago === "Cruzada" ? final1 : final2;
        const montoCC = metodoPago === "A Cuenta Corriente" ? final1 : final2;
        paraFinal = JSON.stringify([
          { razonSocial: paraCruzada, monto: montoCruzada },
          { razonSocial: paraCuentaCorriente, monto: montoCC },
        ]);
      }

      const payloadComun = {
        cliente: cliente || "Consumidor Final",
        total: cart.totalConDescuento,
        interes: cart.interesTarjeta,
        totalFinal: totalFinalCalculado,
        items: cart.items,
        metodo_pago: metodoPagoFinal,
        dni: dni || cuitBusqueda,
        telefono,
        info: infoFinal,
        cupon,
        transaccionId,
        de: deCruzada,
        para: paraFinal,
        email,
        eventoOffline,
        puntoVentaId,
        docTipo,
        docNro: docNro || (cuitBusqueda.length > 6 ? cuitBusqueda : ""),
        condicionIva,
        tipoComprobante: tipoFacturaSugerida,
        mlIdVenta,
        mlIdEnvio,
        mlMla,
        mlDni,
      };

      const resultado = isEditMode
        ? await actualizarPedidoVenta(
            pedidoEnEdicionId!,
            {
              ...payloadComun,
              tipoEnvio: pedidoEdicionExtra?.tipoEnvio ?? undefined,
              mlPackId: pedidoEdicionExtra?.mlPackId ?? undefined,
            },
            vendedorNombre,
            "Pedido editado desde Registrar Venta"
          )
        : isPedido
        ? await guardarComoPedidoVenta({ ...payloadComun, vendedor: vendedorNombre })
        : await crearVentaMostrador({
            ...payloadComun,
            vendedor: vendedorNombre,
            solicitarFactura: solicitarFactura || debeFiscalizar,
          });

      if (resultado.success) {
        if (isEditMode) {
          mostrarMensajeExito("¡Pedido actualizado con éxito!");
          setPedidosRefreshKey((k) => k + 1);
          setActiveTab("pedidos");
        } else if (isPedido) {
          mostrarMensajeExito("¡Pedido de venta guardado con éxito!");
        } else {
          // Descontar stock local
          setArticulos((prev) =>
            prev.map((art) => {
              const itemVendido = cart.items.find((i) => i.productoId === art.id);
              if (itemVendido) {
                return { ...art, stock: art.stock - itemVendido.cantidad };
              }
              return art;
            })
          );

          if (debeFiscalizar && (resultado as any).id) {
            await generarFacturaARCA((resultado as any).id);
          }
          mostrarMensajeExito("¡Venta registrada con éxito!");
        }

        setIsFinalizarModalOpen(false);
        resetFormularioPOS();
        listado.handleCargar();
      } else {
        alert("Error: " + resultado.error);
      }
    } catch (error) {
      console.error("Error al finalizar venta:", error);
      alert("Error de conexión al procesar la venta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Acciones de Impresión
  const handleImprimirPresupuesto = () => {
    if (cart.items.length === 0) return;
    setVentaParaPedido({
      id: "PRESUP-" + Date.now().toString().slice(-6),
      numeroVenta: null,
      createdAt: new Date().toISOString(),
      cliente,
      dni: docNro || cuitBusqueda,
      docNro,
      vendedor: vendedorNombre,
      info,
      items: cart.items,
      total: cart.totalBase,
      totalFinal: cart.totalACobrar,
    });
    setTimeout(() => window.print(), 300);
  };

  const handleImprimirTicket = (venta: any) => {
    setVentaParaImprimir(venta);
    setTimeout(() => window.print(), 300);
  };

  const handleImprimirFactura = (venta: any) => {
    setVentaParaFactura(venta);
    setTimeout(() => window.print(), 300);
  };

  // Ver fotos
  const handleVerFotosVenta = async (venta: any) => {
    if (!venta.mlIdEnvio) return;
    setLoadingFotosVentaId(venta.id);
    try {
      const res = await obtenerFotosEnvio(venta.mlIdEnvio);
      if (res.success) {
        setFotosVenta({ venta, fotos: res.fotos });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFotosVentaId(null);
    }
  };

  const handleVerFotosPedido = async (venta: any) => {
    setLoadingFotosVentaId(venta.id);
    try {
      const res = await obtenerFotosPedido(venta.id);
      if (res.success) {
        setFotosVenta({ venta, fotos: res.fotos });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFotosVentaId(null);
    }
  };

  // Historial
  const handleAbrirHistorial = async (ventaId: string) => {
    try {
      const res = await obtenerHistorialVenta(ventaId);
      if (res.success) {
        setHistorialActual(res.data || []);
        setIsHistorialModalOpen(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Modales de acción por fila
  const handleAbrirEdicion = (venta: any) => {
    setVentaParaEditar(venta);
    setIsEditarVentaOpen(true);
  };

  const handleAbrirRefacturar = (venta: any) => {
    setVentaParaRefacturar(venta);
    setIsRefacturarOpen(true);
  };

  const handleAbrirEliminar = (venta: any) => {
    setVentaParaEliminar(venta);
    setIsEliminarModalOpen(true);
  };

  const handleAbrirAlertaML = (venta: any) => {
    setVentaParaAlerta(venta);
    setIsAlertaMLOpen(true);
  };

  const handleAbrirFastUpdateDb = (id: string, newPrice: number) => {
    const art = articulos.find((a) => a.id === id);
    if (!art) return;
    setFastUpdateData({
      id: art.id,
      nombre: art.nombre,
      oldPrice: Number(art.precio),
      newPrice: redondearA50(newPrice),
    });
    setIsFastUpdateDbOpen(true);
  };

  return (
    <>
      {/* 1. Componentes ocultos para impresión física / térmica */}
      <div className="hidden print:block">
        <TicketImpresion
          ventaId={ventaParaImprimir?.id || ""}
          numeroVenta={ventaParaImprimir?.numeroVenta}
          items={ventaParaImprimir?.items || cart.items}
          total={Number(ventaParaImprimir?.totalFinal || ventaParaImprimir?.total || cart.totalACobrar)}
          cliente={ventaParaImprimir?.cliente || cliente}
          metodoPago={ventaParaImprimir?.metodo_pago || (isPagoMixto ? "MIXTO" : metodoPago)}
        />
        <FacturaA4 venta={ventaParaFactura} config={config} />
        <PedidoVentaA4 venta={ventaParaPedido} />
      </div>

      {/* 2. Interfaz interactiva normal */}
      <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden select-none relative print:hidden">
        {/* Toast Copiado */}
        {showCopyFeedback && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-full shadow-xl border border-slate-700 flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-blue-400" /> ¡Copiado al portapapeles!
            </div>
          </div>
        )}

        {/* Toast Éxito */}
        {showSuccess && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 border border-emerald-500 text-xs font-bold">
              <CheckCircle2 className="h-4 w-4" />
              <span>{successMessage}</span>
            </div>
          </div>
        )}

        {/* Header de navegación */}
        <header className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/erp"
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Volver al ERP"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-600 p-2 rounded-xl text-white shadow-sm">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  Venta Mostrador (POS)
                </h1>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Revolución Motos
                </p>
              </div>
            </div>
          </div>

          <div className="text-right border-l pl-4 border-slate-200">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Vendedor</p>
            <p className="text-xs font-bold text-blue-600">{vendedorNombre}</p>
          </div>
        </header>

        {/* Pestañas principales */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-grow flex flex-col overflow-hidden h-full w-full"
        >
          <div className="bg-white border-b border-slate-200 px-6 py-1 shrink-0">
            <TabsList className="bg-slate-100/70 p-1 w-full flex justify-start gap-1 rounded-xl">
              <TabsTrigger value="registrar" className="gap-2 px-5 text-xs font-semibold rounded-lg">
                <ShoppingCart className="h-4 w-4" /> Registrar Venta
              </TabsTrigger>
              <TabsTrigger value="listado" className="gap-2 px-5 text-xs font-semibold rounded-lg">
                <ClipboardList className="h-4 w-4" /> Listado de Ventas
              </TabsTrigger>
              <TabsTrigger
                value="pedidos"
                className="gap-2 px-5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-900"
              >
                <Clock className="h-4 w-4" /> Pedidos de Ventas
              </TabsTrigger>
              <TabsTrigger
                value="andreani"
                className="gap-2 px-5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 data-[state=active]:bg-rose-100 data-[state=active]:text-rose-900"
              >
                <Package className="h-4 w-4" /> Envíos Andreani
              </TabsTrigger>
              <TabsTrigger
                value="gestion"
                className="gap-2 px-5 text-xs font-semibold rounded-lg ml-auto bg-amber-50 text-amber-800 hover:bg-amber-100 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900"
              >
                <Edit className="h-4 w-4" /> Gestión y Edición
              </TabsTrigger>
            </TabsList>
          </div>

          {/* CONTENIDOS DE PESTAÑAS */}
          <TabsContent value="registrar" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <RegistrarVentaTab
              pedidoEnEdicionId={pedidoEnEdicionId}
              numeroPedidoEnEdicion={numeroPedidoEnEdicion}
              onCancelarEdicionPedido={() => {
                resetFormularioPOS();
                setActiveTab("pedidos");
              }}
              onAbrirBuscadorArticulos={() => setIsBuscadorOpen(true)}
              onAbrirCrearArticulo={() => setIsCrearArticuloOpen(true)}
              onAbrirFastUpdateDb={handleAbrirFastUpdateDb}
              onAbrirFinalizarModal={() => setIsFinalizarModalOpen(true)}
              onAbrirConfirmDiscard={() => setIsConfirmDiscardOpen(true)}
              onImprimirPresupuesto={handleImprimirPresupuesto}
              onCopiarTexto={copiarAlPortapapeles}
              cart={cart}
              isSubmitting={isSubmitting}
            />
          </TabsContent>

          <TabsContent value="listado" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <ListadoVentasTab
              listado={listado}
              puntosVenta={puntosVenta}
              onAbrirExportModal={() => setIsExportModalOpen(true)}
              onImprimirTicket={handleImprimirTicket}
              onImprimirFactura={handleImprimirFactura}
              onVerFotosVenta={handleVerFotosVenta}
              onVerFotosPedido={handleVerFotosPedido}
              onAbrirAlertaML={handleAbrirAlertaML}
              onAbrirHistorial={(v) => handleAbrirHistorial(v.id)}
              onEditarVenta={handleAbrirEdicion}
              onRefacturarVenta={handleAbrirRefacturar}
              onEliminarVenta={handleAbrirEliminar}
              enviosConFoto={enviosConFoto}
              pedidosConFoto={pedidosConFoto}
              loadingFotosVentaId={loadingFotosVentaId}
            />
          </TabsContent>

          <TabsContent value="pedidos" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full bg-white">
            <PedidosVentasTab
              pedidosRefreshKey={pedidosRefreshKey}
              onEditarPedido={handleCargarPedidoParaEdicion}
            />
          </TabsContent>

          <TabsContent value="andreani" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full">
            <EnviosAndreaniTab />
          </TabsContent>

          <TabsContent value="gestion" className="flex-grow overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col h-full select-text">
            <GestionEdicionTab
              listado={listado}
              puntosVenta={puntosVenta}
              onCopiarTexto={copiarAlPortapapeles}
              onEditarVenta={handleAbrirEdicion}
              onAnularConNC={(ventaId) => {
                const v = listado.ventasParaTabla.find((x) => x.id === ventaId);
                if (v) handleAbrirEliminar(v);
              }}
              onAbrirHistorial={handleAbrirHistorial}
              onEliminarVenta={handleAbrirEliminar}
              isFacturando={isSubmitting}
            />
          </TabsContent>
        </Tabs>

        {/* --- MODALES DESACOPLADOS --- */}
        <BuscadorArticulosModal
          open={isBuscadorOpen}
          onOpenChange={setIsBuscadorOpen}
          articulos={articulos}
          setArticulos={setArticulos}
          onSelectProducto={
            isEditarVentaOpen
              ? (prod, override) => {
                  const precio = override !== undefined ? override : Number(prod.precio);
                  setEditItems((prev) => [
                    ...prev,
                    {
                      id: prod.id,
                      productoId: prod.id,
                      nombre: prod.nombre,
                      cantidad: 1,
                      precio_unit: redondearA50(precio),
                      subtotal: redondearA50(precio),
                      stock: prod.stock,
                      costo: prod.costo,
                    },
                  ]);
                }
              : cart.agregarProducto
          }
          expandirPacks={cart.expandirPacks}
          setExpandirPacks={cart.setExpandirPacks}
        />

        <FinalizarVentaModal
          open={isFinalizarModalOpen}
          onOpenChange={setIsFinalizarModalOpen}
          cliente={cliente}
          setCliente={setCliente}
          cuitBusqueda={cuitBusqueda}
          setCuitBusqueda={setCuitBusqueda}
          docTipo={docTipo}
          setDocTipo={setDocTipo}
          docNro={docNro}
          setDocNro={setDocNro}
          condicionIva={condicionIva}
          setCondicionIva={setCondicionIva}
          tipoFacturaSugerida={tipoFacturaSugerida}
          setTipoFacturaSugerida={setTipoFacturaSugerida}
          sujetoId={sujetoId}
          setSujetoId={setSujetoId}
          email={email}
          setEmail={setEmail}
          eventoOffline={eventoOffline}
          setEventoOffline={setEventoOffline}
          puntoVentaId={puntoVentaId}
          setPuntoVentaId={setPuntoVentaId}
          puntosVenta={puntosVenta}
          metodoPago={metodoPago}
          setMetodoPago={setMetodoPago}
          isPagoMixto={isPagoMixto}
          setIsPagoMixto={setIsPagoMixto}
          montoPago1={montoPago1}
          setMontoPago1={setMontoPago1}
          metodoPago2={metodoPago2}
          setMetodoPago2={setMetodoPago2}
          procesadorTarjeta={procesadorTarjeta}
          setProcesadorTarjeta={setProcesadorTarjeta}
          dni={dni}
          setDni={setDni}
          telefono={telefono}
          setTelefono={setTelefono}
          info={info}
          setInfo={setInfo}
          cupon={cupon}
          setCupon={setCupon}
          transaccionId={transaccionId}
          setTransaccionId={setTransaccionId}
          deCruzada={deCruzada}
          setDeCruzada={setDeCruzada}
          paraCruzada={paraCruzada}
          setParaCruzada={setParaCruzada}
          proveedoresCruzada={proveedoresCruzada}
          setProveedoresCruzada={setProveedoresCruzada}
          paraCuentaCorriente={paraCuentaCorriente}
          setParaCuentaCorriente={setParaCuentaCorriente}
          mlIdVenta={mlIdVenta}
          setMlIdVenta={setMlIdVenta}
          mlIdEnvio={mlIdEnvio}
          setMlIdEnvio={setMlIdEnvio}
          mlMla={mlMla}
          setMlMla={setMlMla}
          mlDni={mlDni}
          setMlDni={setMlDni}
          solicitarFactura={solicitarFactura}
          setSolicitarFactura={setSolicitarFactura}
          totalConDescuento={cart.totalConDescuento}
          interesTarjeta={cart.interesTarjeta}
          totalACobrar={cart.totalACobrar}
          proveedores={proveedores}
          onAbrirNuevoProveedor={() => setIsCrearProveedorOpen(true)}
          isSubmitting={isSubmitting}
          pedidoEnEdicionId={pedidoEnEdicionId}
          numeroPedidoEnEdicion={numeroPedidoEnEdicion}
          onFinalizarVenta={handleFinalizarVenta}
        />

        <EditarVentaModal
          open={isEditarVentaOpen}
          onOpenChange={setIsEditarVentaOpen}
          venta={ventaParaEditar}
          articulos={articulos}
          puntosVenta={puntosVenta}
          proveedores={proveedores}
          onVentaActualizada={() => {
            mostrarMensajeExito("¡Venta actualizada con éxito!");
            listado.handleCargar();
          }}
          onAbrirBuscadorArticulosEdit={() => setIsBuscadorOpen(true)}
          onAbrirFastUpdateDb={handleAbrirFastUpdateDb}
          onAbrirNuevoProveedor={() => setIsCrearProveedorOpen(true)}
          editItems={editItems}
          setEditItems={setEditItems}
        />

        <EliminarVentaModal
          open={isEliminarModalOpen}
          onOpenChange={setIsEliminarModalOpen}
          venta={ventaParaEliminar}
          onEliminadaExito={() => {
            mostrarMensajeExito("¡Venta procesada con éxito!");
            listado.handleCargar();
          }}
        />

        <HistorialVentaModal
          open={isHistorialModalOpen}
          onOpenChange={setIsHistorialModalOpen}
          historial={historialActual}
        />

        <FotosAuditoriaModal
          open={!!fotosVenta}
          onOpenChange={(open) => {
            if (!open) setFotosVenta(null);
          }}
          fotosVenta={fotosVenta}
        />

        <AlertaMLModal
          open={isAlertaMLOpen}
          onOpenChange={setIsAlertaMLOpen}
          venta={ventaParaAlerta}
          onAlertaGuardada={(id, activa, obs) => {
            listado.setVentasRealizadas((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, mlAlerta: activa, mlObservacion: obs || null } : v
              )
            );
            listado.setVentasML((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, mlAlerta: activa, mlObservacion: obs || null } : v
              )
            );
            mostrarMensajeExito("Alerta actualizada");
          }}
        />

        <RefacturarModal
          open={isRefacturarOpen}
          onOpenChange={setIsRefacturarOpen}
          venta={ventaParaRefacturar}
          onRefacturadoExito={() => {
            mostrarMensajeExito("¡Refacturación completada con éxito!");
            listado.handleCargar();
          }}
        />

        <FastUpdateDbModal
          open={isFastUpdateDbOpen}
          onOpenChange={setIsFastUpdateDbOpen}
          fastUpdateData={fastUpdateData}
          onPrecioActualizado={(id, newPrice, updatedAt) => {
            setArticulos((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, precio: newPrice, ultimaModificacion: updatedAt } : a
              )
            );
            mostrarMensajeExito("¡Precio actualizado en base de datos!");
          }}
        />

        <CrearArticuloModal
          open={isCrearArticuloOpen}
          onOpenChange={setIsCrearArticuloOpen}
          onArticuloCreado={(nuevo) => {
            setArticulos((prev) => [...prev, nuevo]);
            cart.agregarProducto(nuevo);
            mostrarMensajeExito("Artículo creado y añadido a la venta");
          }}
        />

        <CrearProveedorModal
          open={isCrearProveedorOpen}
          onOpenChange={setIsCrearProveedorOpen}
          onProveedorCreado={(nuevo) => {
            setProveedores((prev) => [nuevo, ...prev]);
            setParaCruzada(nuevo.razonSocial);
            setProveedoresCruzada((prev) => {
              if (prev.length === 0) {
                return [
                  {
                    id: nuevo.id || crypto.randomUUID(),
                    razonSocial: nuevo.razonSocial,
                    monto: cart.totalConDescuento,
                  },
                ];
              }
              const copia = [...prev];
              copia[copia.length - 1] = {
                ...copia[copia.length - 1],
                razonSocial: nuevo.razonSocial,
                id: nuevo.id || copia[copia.length - 1].id,
              };
              return copia;
            });
            mostrarMensajeExito("Proveedor creado con éxito");
          }}
        />

        <ExportarExcelModal
          open={isExportModalOpen}
          onOpenChange={setIsExportModalOpen}
          fechaDesdeInicial={listado.fechaDesde}
          fechaHastaInicial={listado.fechaHasta}
          puntosVenta={puntosVenta}
        />

        {/* Modal de confirmación para descartar venta */}
        <Dialog open={isConfirmDiscardOpen} onOpenChange={setIsConfirmDiscardOpen}>
          <DialogContent className="sm:max-w-[400px] rounded-2xl p-6 border border-slate-200 shadow-2xl">
            <DialogHeader>
              <div className="mx-auto bg-red-100 text-red-600 p-3 rounded-full w-fit mb-3">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <DialogTitle className="text-center text-lg font-bold text-slate-900">
                {pedidoEnEdicionId ? "¿Descartar cambios del pedido?" : "¿Descartar Venta Actual?"}
              </DialogTitle>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setIsConfirmDiscardOpen(false)}
                className="w-full rounded-xl border-slate-200"
              >
                Mantener
              </Button>
              <Button
                onClick={() => {
                  const volverAPedidos = !!pedidoEnEdicionId;
                  resetFormularioPOS();
                  setIsConfirmDiscardOpen(false);
                  if (volverAPedidos) setActiveTab("pedidos");
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
              >
                Sí, Descartar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
