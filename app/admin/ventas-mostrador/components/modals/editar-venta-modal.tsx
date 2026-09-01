"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Edit,
  Search,
  RefreshCcw,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Loader2,
  X,
  CreditCard,
  User,
  ShoppingBag,
  Truck,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Building2,
  ArrowRightLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Articulo, ItemVenta, PuntoVenta, Proveedor } from "../../types";
import {
  METODOS_PAGO,
  colorMetodoPago,
  redondearA50,
  calcularMarcacion,
  claseColorMarcacion,
  calcularPrecioArt,
} from "../../constants";
import { consultarPadron } from "@/app/actions/afip";
import {
  actualizarVentaMostrador,
  revertirVentaAPedido,
} from "@/app/actions/ventas-mostrador";
import { actualizarObservacionesProveedor } from "@/app/actions/listas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta: any;
  articulos: Articulo[];
  puntosVenta: PuntoVenta[];
  proveedores: Proveedor[];
  onVentaActualizada: () => void;
  onAbrirBuscadorArticulosEdit: () => void;
  onAbrirFastUpdateDb: (id: string, precio: number) => void;
  onAbrirNuevoProveedor: () => void;
  editItems: ItemVenta[];
  setEditItems: React.Dispatch<React.SetStateAction<ItemVenta[]>>;
}

export function EditarVentaModal({
  open,
  onOpenChange,
  venta,
  articulos,
  puntosVenta,
  proveedores,
  onVentaActualizada,
  onAbrirBuscadorArticulosEdit,
  onAbrirFastUpdateDb,
  onAbrirNuevoProveedor,
  editItems,
  setEditItems,
}: Props) {
  // Datos del Cliente y Facturación (A quién)
  const [editCliente, setEditCliente] = useState("");
  const [editVendedor, setEditVendedor] = useState("Martin Jakson");
  const [editSujetoId, setEditSujetoId] = useState<string | null>(null);
  const [editDocTipo, setEditDocTipo] = useState<number>(99);
  const [editDocNro, setEditDocNro] = useState<string>("");
  const [editCondicionIva, setEditCondicionIva] = useState<number>(5);
  const [editCuitBusqueda, setEditCuitBusqueda] = useState("");
  const [editDni, setEditDni] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPuntoVentaId, setEditPuntoVentaId] = useState("");

  // Forma de Pago y Finanzas
  const [editMetodoPago, setEditMetodoPago] = useState("Efectivo");
  const [isEditPagoMixto, setIsEditPagoMixto] = useState(false);
  const [editMontoPago1, setEditMontoPago1] = useState<number>(0);
  const [editMetodoPago2, setEditMetodoPago2] = useState("Tarjeta de Crédito");
  const [editInteresTarjeta, setEditInteresTarjeta] = useState<number>(0);
  const [editProcesadorTarjeta, setEditProcesadorTarjeta] = useState("Posnet Intercap");
  const [editCupon, setEditCupon] = useState("");
  const [editTransaccionId, setEditTransaccionId] = useState("");

  // Pagos Cruzada y Cuenta Corriente
  const [editDeCruzada, setEditDeCruzada] = useState("");
  const [editParaCruzada, setEditParaCruzada] = useState("");
  const [editProveedoresCruzada, setEditProveedoresCruzada] = useState<
    { id: string; razonSocial: string; monto: number }[]
  >([]);
  const [editParaCuentaCorriente, setEditParaCuentaCorriente] = useState("");

  // MercadoLibre / MercadoPago
  const [editMlIdVenta, setEditMlIdVenta] = useState("");
  const [editMlIdEnvio, setEditMlIdEnvio] = useState("");
  const [editMlPackId, setEditMlPackId] = useState("");
  const [editMlMla, setEditMlMla] = useState("");
  const [editMlDni, setEditMlDni] = useState("");

  // Logística y Observaciones (Cómo)
  const [editTipoEnvio, setEditTipoEnvio] = useState("andreani");
  const [editInfo, setEditInfo] = useState("");
  const [editEventoOffline, setEditEventoOffline] = useState(false);

  // Estados de interfaz y búsqueda
  const [isSearchingPadronEdit, setIsSearchingPadronEdit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingObsProveedor, setIsSavingObsProveedor] = useState(false);
  const [sujetosEncontrados, setSujetosEncontrados] = useState<any[]>([]);
  const [showSujetoList, setShowSujetoList] = useState(false);
  const [showProvListEdit, setShowProvListEdit] = useState(false);
  const [showProvListCCEdit, setShowProvListCCEdit] = useState(false);
  const [showProvListMultiEdit, setShowProvListMultiEdit] = useState<number | null>(null);

  // Formulario rápido para añadir ítem manual / libre
  const [showNuevoItemManual, setShowNuevoItemManual] = useState(false);
  const [manualNombre, setManualNombre] = useState("");
  const [manualCantidad, setManualCantidad] = useState<number>(1);
  const [manualPrecio, setManualPrecio] = useState<number>(0);

  // Edición rápida de marcación en línea por artículo
  const [editingMarcacionId, setEditingMarcacionId] = useState<string | null>(null);
  const [tempMarcacionVal, setTempMarcacionVal] = useState<string>("");

  const searchSujetoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (venta && open) {
      setEditCliente(venta.cliente || "Consumidor Final");
      setEditVendedor(venta.vendedor || "Martin Jakson");
      setEditSujetoId(venta.sujetoId || null);
      setEditInteresTarjeta(Number(venta.interes || 0));
      setEditDni(venta.dni || "");
      setEditTelefono(venta.telefono || "");
      setEditEmail(venta.email || "");
      setEditInfo(venta.info || "");
      setEditCupon(venta.cupon || "");
      setEditTransaccionId(venta.transaccionId || "");
      setEditDeCruzada(venta.de || "");
      setEditTipoEnvio(venta.tipoEnvio || "andreani");
      setEditEventoOffline(venta.eventoOffline || false);
      setEditPuntoVentaId(venta.puntoVentaId || "");
      setEditDocTipo(venta.docTipo ?? 99);
      setEditDocNro(venta.docNro || "");
      setEditCondicionIva(venta.condicionIva ?? 5);
      setEditCuitBusqueda(venta.docNro || "");
      setEditMlIdVenta(venta.mlIdVenta || "");
      setEditMlIdEnvio(venta.mlIdEnvio || "");
      setEditMlPackId(venta.mlPackId || "");
      setEditMlMla(venta.mlMla || "");
      setEditMlDni(venta.mlDni || "");
      setEditProcesadorTarjeta("Posnet Intercap");
      setShowNuevoItemManual(false);

      // Parsear métodos de pago y montos
      const mp = (venta.metodo_pago || "Efectivo").trim();
      const esMixto = mp === "Mixto" || mp.includes(" + ");
      setIsEditPagoMixto(esMixto);

      if (esMixto) {
        let m1 = "Efectivo";
        let m2 = "Tarjeta de Crédito";
        if (mp.includes(" + ")) {
          const partes = mp.split(" + ");
          m1 = partes[0]?.trim() || "Efectivo";
          m2 = partes[1]?.trim() || "Tarjeta de Crédito";
        } else {
          const matchMixto = (venta.info || "").match(/\[Mixto\s*->\s*([^:]+):/i);
          if (matchMixto && matchMixto[1]) m1 = matchMixto[1].trim();
          const matchMixto2 = (venta.info || "").match(/\|\s*([^:]+):/i);
          if (matchMixto2 && matchMixto2[1]) m2 = matchMixto2[1].trim();
        }
        setEditMetodoPago(m1);
        setEditMetodoPago2(m2);

        let monto1 = 0;
        if (venta.info) {
          const regexM1 = new RegExp(`${m1}:\\s*\\$?([0-9.,]+)`, "i");
          const match1 = venta.info.match(regexM1);
          if (match1 && match1[1]) {
            let str = match1[1];
            if (str.includes(",") && str.includes(".")) str = str.replace(/\./g, "").replace(",", ".");
            else if (str.includes(",")) str = str.replace(",", ".");
            else if (str.includes(".") && str.split(".").pop()?.length === 3) str = str.replace(/\./g, "");
            monto1 = parseFloat(str) || 0;
          }
        }
        setEditMontoPago1(monto1 > 0 ? monto1 : Number(venta.total || 0) / 2);
      } else {
        setEditMetodoPago(mp);
        setEditMetodoPago2("Tarjeta de Crédito");
        setEditMontoPago1(0);
      }

      // Parsear Destino / Proveedores Cruzada / Cuenta Corriente
      const paraRaw = venta.para || "";
      let provsCruzada: { id: string; razonSocial: string; monto: number }[] = [];
      if (paraRaw.trim().startsWith("[") || paraRaw.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(paraRaw);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          provsCruzada = list.map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            razonSocial: item.razonSocial || item.nombre || "",
            monto: Number(item.monto || 0),
          }));
        } catch {
          provsCruzada = [{ id: crypto.randomUUID(), razonSocial: paraRaw, monto: Number(venta.totalFinal || venta.total || 0) }];
        }
      } else if (paraRaw.trim()) {
        provsCruzada = [{ id: crypto.randomUUID(), razonSocial: paraRaw, monto: Number(venta.totalFinal || venta.total || 0) }];
      }

      setEditProveedoresCruzada(provsCruzada);
      setEditParaCruzada(provsCruzada[0]?.razonSocial || paraRaw || "");
      setEditParaCuentaCorriente(provsCruzada[1]?.razonSocial || provsCruzada[0]?.razonSocial || paraRaw || "");

      // Cargar items con costos y stock actualizados del catálogo
      const itemsMapeados: ItemVenta[] = (venta.items || []).map((i: any) => {
        const artCat = articulos.find((a) => a.id === (i.productoId || i.id));
        const costoUnit = i.costo !== undefined && i.costo !== null
          ? Number(i.costo)
          : (artCat?.costo !== undefined ? Number(artCat.costo) : 0);
        const stockActual = artCat?.stock !== undefined ? artCat.stock : (i.stock || 0);

        return {
          id: i.id || crypto.randomUUID(),
          productoId: i.esNota ? undefined : (i.productoId || i.id),
          nombre: i.nombre,
          cantidad: Number(i.cantidad),
          precio_unit: Number(i.precio_unit),
          subtotal: Number(i.subtotal),
          stock: stockActual,
          costo: costoUnit,
          esNota: i.esNota || false,
        };
      });

      setEditItems(itemsMapeados);
    }
  }, [venta, open, articulos, setEditItems]);

  // Cálculos de montos
  const totalBaseEdit = useMemo(
    () => editItems.reduce((acc, item) => acc + (item.subtotal || 0), 0),
    [editItems]
  );

  const base1 = isEditPagoMixto ? Number(editMontoPago1 || 0) : totalBaseEdit;
  const base2 = isEditPagoMixto ? Math.max(0, totalBaseEdit - base1) : 0;
  const isCredito1 = editMetodoPago === "Tarjeta de Crédito";
  const isCredito2 = isEditPagoMixto && editMetodoPago2 === "Tarjeta de Crédito";
  const final1 = isCredito1 ? redondearA50(base1 * (1 + editInteresTarjeta / 100)) : base1;
  const final2 = isCredito2 ? redondearA50(base2 * (1 + editInteresTarjeta / 100)) : base2;
  const totalFinalCalculadoEdit = isEditPagoMixto
    ? final1 + final2
    : isCredito1
    ? redondearA50(totalBaseEdit * (1 + editInteresTarjeta / 100))
    : totalBaseEdit;

  // Condiciones de pago
  const requiereTarjeta =
    editMetodoPago === "Tarjeta de Crédito" ||
    editMetodoPago === "Tarjeta de Débito" ||
    (isEditPagoMixto &&
      (editMetodoPago2 === "Tarjeta de Crédito" || editMetodoPago2 === "Tarjeta de Débito"));

  const requiereMercadoLibre =
    editMetodoPago === "MercadoLibre" || (isEditPagoMixto && editMetodoPago2 === "MercadoLibre");
  const requiereMercadoPago =
    editMetodoPago === "MercadoPago" || (isEditPagoMixto && editMetodoPago2 === "MercadoPago");
  const requiereCruzada =
    editMetodoPago === "Cruzada" || (isEditPagoMixto && editMetodoPago2 === "Cruzada");
  const requiereCuentaCorriente =
    editMetodoPago === "A Cuenta Corriente" ||
    (isEditPagoMixto && editMetodoPago2 === "A Cuenta Corriente");
  const esMixtoCruzadaCC =
    isEditPagoMixto &&
    ((editMetodoPago === "Cruzada" && editMetodoPago2 === "A Cuenta Corriente") ||
      (editMetodoPago === "A Cuenta Corriente" && editMetodoPago2 === "Cruzada"));

  const puntoVentaSeleccionado = useMemo(() => {
    return puntosVenta.find((p) => p.id === editPuntoVentaId) || null;
  }, [puntosVenta, editPuntoVentaId]);

  // Manejadores de búsqueda AFIP / Sujetos
  const handleBuscarPadronEdit = async () => {
    const raw = editCuitBusqueda.replace(/\D/g, "");
    if (raw.length < 7 || raw.length > 11) {
      alert("Ingrese un CUIT (11 dígitos) o DNI (7 u 8 dígitos)");
      return;
    }
    setIsSearchingPadronEdit(true);
    try {
      const res = await consultarPadron(raw);
      if (res.success) {
        setEditCliente(res.nombre || "Consumidor Final");
        setEditDocNro(raw);
        setEditDocTipo(raw.length === 11 ? 80 : 96);
        setEditCondicionIva(res.condicionIva ?? 5);
        if (!editDni) {
          const dniExtraid = raw.length === 11 ? raw.slice(2, 10) : raw;
          setEditDni(dniExtraid);
        }
      } else {
        alert("No se encontró el CUIT/DNI en AFIP: " + (res.error || ""));
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al consultar padrón.");
    } finally {
      setIsSearchingPadronEdit(false);
    }
  };

  const handleSearchSujetos = (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSujetosEncontrados([]);
      setShowSujetoList(false);
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
    setEditCliente(s.razonSocial);
    setEditDocNro(s.cuit);
    setEditDocTipo(80);
    setEditCondicionIva(s.condicionIva || 1);
    setEditSujetoId(s.id);
    setEditCuitBusqueda(s.cuit);
    if (s.telefono && !editTelefono) setEditTelefono(s.telefono);
    if (s.email && !editEmail) setEditEmail(s.email);
    if (s.observaciones && !editInfo) setEditInfo(s.observaciones);
    if (s.cuit && !editDni) {
      const clean = s.cuit.replace(/\D/g, "");
      setEditDni(clean.length === 11 ? clean.slice(2, 10) : clean);
    }
    if (requiereCuentaCorriente) {
      if (!isEditPagoMixto) setEditParaCruzada(s.razonSocial);
      else setEditParaCuentaCorriente(s.razonSocial);
    }
    setShowSujetoList(false);
  };

  // Gestión de artículos en la venta
  const handleUpdateItemCantidad = (id: string, cant: number) => {
    const val = Math.max(0, cant);
    setEditItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, cantidad: val, subtotal: val * i.precio_unit } : i
      )
    );
  };

  const handleUpdateItemPrecio = (id: string, precio: number) => {
    const p = Math.max(0, precio);
    setEditItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, precio_unit: p, subtotal: i.cantidad * p } : i
      )
    );
  };

  const handleAplicarMarcacion = (item: ItemVenta) => {
    const nuevoMargen = Number(tempMarcacionVal);
    if (tempMarcacionVal.trim() === "" || isNaN(nuevoMargen) || !item.costo || item.costo <= 0) {
      setEditingMarcacionId(null);
      setTempMarcacionVal("");
      return;
    }
    const nuevoPrecio = calcularPrecioArt(item.costo, nuevoMargen);
    setEditItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              precio_unit: nuevoPrecio,
              subtotal: i.cantidad * nuevoPrecio,
            }
          : i
      )
    );
    setEditingMarcacionId(null);
    setTempMarcacionVal("");
  };

  const handleAgregarItemManual = () => {
    if (!manualNombre.trim()) {
      alert("Ingrese un nombre o concepto para el ítem.");
      return;
    }
    const cant = Math.max(1, manualCantidad || 1);
    const precio = Math.max(0, manualPrecio || 0);
    setEditItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nombre: manualNombre.trim(),
        cantidad: cant,
        precio_unit: precio,
        subtotal: cant * precio,
        stock: 0,
        costo: 0,
        esNota: false,
      },
    ]);
    setManualNombre("");
    setManualCantidad(1);
    setManualPrecio(0);
    setShowNuevoItemManual(false);
  };

  const handleAgregarNota = () => {
    const txt = prompt("Ingrese el texto de la nota o aclaración:");
    if (!txt || !txt.trim()) return;
    setEditItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nombre: txt.trim(),
        cantidad: 0,
        precio_unit: 0,
        subtotal: 0,
        stock: 0,
        costo: 0,
        esNota: true,
      },
    ]);
  };

  // Gestión de proveedores cruzada
  const agregarProveedorCruzada = () => {
    setEditProveedoresCruzada((prev) => [
      ...prev,
      { id: crypto.randomUUID(), razonSocial: "", monto: 0 },
    ]);
  };

  const eliminarProveedorCruzada = (idx: number) => {
    setEditProveedoresCruzada((prev) => {
      const nuevaLista = prev.filter((_, i) => i !== idx);
      if (nuevaLista.length === 1) {
        return [{ ...nuevaLista[0], monto: totalFinalCalculadoEdit }];
      }
      return nuevaLista;
    });
  };

  const actualizarProveedorCruzada = (idx: number, campo: string, valor: any) => {
    setEditProveedoresCruzada((prev) => {
      const copia = [...prev];
      copia[idx] = { ...copia[idx], [campo]: valor };
      return copia;
    });
  };

  // Guardar edición
  const handleGuardarEdicion = async () => {
    if (!venta) return;
    if (editItems.length === 0) {
      alert("Debe haber al menos un artículo en la venta.");
      return;
    }
    if (!editCliente.trim()) {
      alert("El nombre o razón social del cliente no puede estar vacío.");
      return;
    }

    setIsSubmitting(true);
    try {
      const metodoFinal = isEditPagoMixto
        ? `${editMetodoPago} + ${editMetodoPago2}`
        : editMetodoPago;

      let infoFinal = editInfo || "";
      if (isEditPagoMixto) {
        const infoLimpia = (editInfo || "").replace(/\[Mixto\s*->[^\]]+\]\s*-?\s*/i, "").trim();
        const detMixto = `[Mixto -> ${editMetodoPago}: $${final1.toLocaleString("es-AR")} | ${editMetodoPago2}: $${final2.toLocaleString("es-AR")}]`;
        infoFinal = infoLimpia ? `${detMixto} - ${infoLimpia}` : detMixto;
      }

      let paraFinal: string | null = editParaCruzada || null;
      if (esMixtoCruzadaCC) {
        const montoCruzada = editMetodoPago === "Cruzada" ? final1 : final2;
        const montoCC = editMetodoPago === "A Cuenta Corriente" ? final1 : final2;
        paraFinal = JSON.stringify([
          { razonSocial: editParaCruzada, monto: montoCruzada },
          { razonSocial: editParaCuentaCorriente, monto: montoCC },
        ]);
      } else if (requiereCruzada && !isEditPagoMixto) {
        if (editProveedoresCruzada.length > 1) {
          paraFinal = JSON.stringify(editProveedoresCruzada);
        } else {
          paraFinal = editProveedoresCruzada[0]?.razonSocial || editParaCruzada || null;
        }
      } else if (requiereCuentaCorriente) {
        paraFinal = editParaCuentaCorriente || editParaCruzada || null;
      }

      const res = await actualizarVentaMostrador(
        venta.id,
        {
          cliente: editCliente,
          vendedor: editVendedor || "Martin Jakson",
          sujetoId: editSujetoId || null,
          total: totalBaseEdit,
          interes: editInteresTarjeta,
          totalFinal: totalFinalCalculadoEdit,
          metodo_pago: metodoFinal,
          items: editItems,
          dni: editDni || editDocNro || null,
          telefono: editTelefono || null,
          email: editEmail || null,
          info: infoFinal || null,
          cupon: editCupon || null,
          transaccionId: editTransaccionId || null,
          de: editDeCruzada || null,
          para: paraFinal,
          tipoEnvio: editTipoEnvio || "andreani",
          eventoOffline: editEventoOffline,
          puntoVentaId: editPuntoVentaId || null,
          mlIdVenta: editMlIdVenta || null,
          mlIdEnvio: editMlIdEnvio || null,
          mlPackId: editMlPackId || null,
          mlMla: editMlMla || null,
          mlDni: editMlDni || null,
          docTipo: editDocTipo,
          docNro: editDocNro || null,
          condicionIva: editCondicionIva,
        },
        "Mostrador",
        `Edición integral de venta #${venta.numeroVenta || venta.id.slice(0, 8)} (${editCliente})`
      );

      if (res.success) {
        onVentaActualizada();
        onOpenChange(false);
      } else {
        alert("Error al actualizar la venta: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al actualizar la venta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVolverAPedido = async () => {
    if (!venta) return;
    if (venta.cae) {
      alert("La venta tiene CAE fiscal de AFIP. No se puede revertir a pedido sin anular la factura mediante Nota de Crédito.");
      return;
    }
    if (!confirm("¿Deseas revertir esta venta a estado de Pedido de Venta?")) return;
    setIsSubmitting(true);
    try {
      const res = await revertirVentaAPedido(venta.id, "Mostrador");
      if (res.success) {
        onVentaActualizada();
        onOpenChange(false);
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al revertir a pedido.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px] max-w-[95vw] p-0 overflow-hidden rounded-2xl border border-amber-300 shadow-2xl bg-white">
        <div className="max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* CABECERA */}
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
                  <Edit className="h-5 w-5 text-amber-600" /> Editando Venta {venta?.numeroVenta ? `#${venta.numeroVenta}` : `(${venta?.id?.slice(0, 8)})`}
                  {venta?.cae ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                      <ShieldCheck className="h-3 w-3 mr-1 text-emerald-600" /> Factura ARCA ({venta.cae})
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-bold">
                      Venta Mostrador
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-medium">
                  Modifica los artículos, la forma de pago, el cliente o la entrega de esta venta registrada.
                </DialogDescription>
              </div>

              {/* Total flotante en cabecera */}
              <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl text-right">
                <span className="text-[10px] font-bold uppercase text-amber-800 block">Total Final Venta</span>
                <span className="text-lg font-black text-slate-900 leading-tight">
                  $ {totalFinalCalculadoEdit.toLocaleString("es-AR")}
                </span>
              </div>
            </div>
          </DialogHeader>

          {/* SECCIÓN 1: ARTÍCULOS EN LA VENTA */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4 text-amber-600" /> Artículos en la Venta ({editItems.length})
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={onAbrirBuscadorArticulosEdit}
                  className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5 h-8 px-3 rounded-xl text-xs font-bold shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Catálogo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNuevoItemManual(!showNuevoItemManual)}
                  className="border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5 h-8 px-3 rounded-xl text-xs font-bold"
                >
                  <Plus className="h-3.5 w-3.5 text-amber-600" /> + Ítem Libre
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleAgregarNota}
                  className="text-slate-600 hover:text-slate-900 text-xs font-semibold h-8 px-2 rounded-xl"
                >
                  <FileText className="h-3.5 w-3.5 mr-1 text-slate-400" /> + Nota
                </Button>
              </div>
            </div>

            {/* Formulario rápido para ítem libre */}
            {showNuevoItemManual && (
              <div className="bg-amber-50/90 border border-amber-200 p-3 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-900">Agregar Concepto Libre / Manual</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNuevoItemManual(false)}
                    className="h-5 w-5 p-0 text-amber-800"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600 uppercase">Concepto *</Label>
                    <Input
                      placeholder="Flete, Mano de obra, Accesorio..."
                      value={manualNombre}
                      onChange={(e) => setManualNombre(e.target.value)}
                      className="h-8 text-xs bg-white rounded-lg border-amber-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600 uppercase">Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={manualCantidad}
                      onChange={(e) => setManualCantidad(Number(e.target.value))}
                      className="h-8 text-xs bg-white text-center font-bold rounded-lg border-amber-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600 uppercase">Precio ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={manualPrecio}
                      onChange={(e) => setManualPrecio(Number(e.target.value))}
                      className="h-8 text-xs bg-white font-bold rounded-lg border-amber-200"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAgregarItemManual}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-7 rounded-lg px-3"
                  >
                    Agregar
                  </Button>
                </div>
              </div>
            )}

            {/* Tabla de artículos */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold uppercase py-2">Artículo</TableHead>
                    <TableHead className="text-center text-xs font-bold uppercase py-2 w-20">Costo</TableHead>
                    <TableHead className="text-center text-xs font-bold uppercase py-2 w-24">% Marc.</TableHead>
                    <TableHead className="text-center text-xs font-bold uppercase py-2 w-28">Cant.</TableHead>
                    <TableHead className="text-center text-xs font-bold uppercase py-2 w-32">Precio Unit.</TableHead>
                    <TableHead className="text-right text-xs font-bold uppercase py-2 w-28">Subtotal</TableHead>
                    <TableHead className="w-10 py-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-slate-400 italic text-xs">
                        No hay artículos cargados en la venta
                      </TableCell>
                    </TableRow>
                  ) : (
                    editItems.map((item) => {
                      const costoNum = Number(item.costo || 0);
                      const marcActual = calcularMarcacion(costoNum, item.precio_unit);

                      return (
                        <TableRow key={item.id} className="hover:bg-slate-50/70 border-b border-slate-100">
                          <TableCell className="py-2 text-xs font-medium text-slate-800">
                            {item.esNota ? (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-bold">
                                Nota: {item.nombre}
                              </Badge>
                            ) : (
                              <span className="font-semibold text-slate-800">{item.nombre}</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center py-2 text-xs text-slate-500 font-mono">
                            {costoNum > 0 ? `$${costoNum.toLocaleString("es-AR")}` : "-"}
                          </TableCell>

                          <TableCell className="text-center py-2 text-xs">
                            {item.esNota || costoNum <= 0 ? (
                              <span className="text-slate-400 text-[11px]">-</span>
                            ) : editingMarcacionId === item.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  value={tempMarcacionVal}
                                  onChange={(e) => setTempMarcacionVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAplicarMarcacion(item);
                                    if (e.key === "Escape") setEditingMarcacionId(null);
                                  }}
                                  autoFocus
                                  className="h-6 w-14 text-xs text-center font-bold px-1"
                                />
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => handleAplicarMarcacion(item)}
                                  className="h-6 w-5 p-0 text-emerald-600 font-bold"
                                >
                                  ✓
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMarcacionId(item.id);
                                  setTempMarcacionVal(marcActual !== null ? String(Number(marcActual.toFixed(1))) : "");
                                }}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                  marcActual !== null ? claseColorMarcacion(marcActual) : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                                title="Click para cambiar marcación"
                              >
                                {marcActual !== null ? `${Number(marcActual.toFixed(1))}%` : "0%"}
                              </button>
                            )}
                          </TableCell>

                          <TableCell className="text-center py-2">
                            {item.esNota ? (
                              <span className="text-slate-400 text-xs">-</span>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemCantidad(item.id, item.cantidad - 1)}
                                  className="h-6 w-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs"
                                >
                                  -
                                </button>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.cantidad}
                                  onChange={(e) => handleUpdateItemCantidad(item.id, Number(e.target.value))}
                                  className="w-12 h-6 text-xs text-center font-bold px-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemCantidad(item.id, item.cantidad + 1)}
                                  className="h-6 w-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-center py-2">
                            {item.esNota ? (
                              <span className="text-slate-400 text-xs">-</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                value={item.precio_unit}
                                onChange={(e) => handleUpdateItemPrecio(item.id, Number(e.target.value))}
                                className="h-6 text-xs text-right font-bold w-24 mx-auto bg-slate-50 focus:bg-white"
                              />
                            )}
                          </TableCell>

                          <TableCell className="text-right py-2 font-black text-slate-900 text-xs">
                            ${Number(item.subtotal).toLocaleString("es-AR")}
                          </TableCell>

                          <TableCell className="text-center py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditItems((prev) => prev.filter((i) => i.id !== item.id))}
                              className="text-red-400 hover:text-red-600 h-6 w-6 rounded"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* SECCIÓN 2: FORMULARIO EN 2 COLUMNAS (IDÉNTICO A FINALIZAR VENTA) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-1">
            {/* COLUMNA 1: CLIENTE Y DATOS */}
            <div className="space-y-4">
              <div className={`grid grid-cols-1 gap-3 ${editDocNro ? "" : "md:grid-cols-[3fr_2fr]"}`}>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">
                    CUIT / DNI (Padrón AFIP)
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1" ref={searchSujetoRef}>
                      <Input
                        value={editCuitBusqueda}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditCuitBusqueda(val);
                          handleSearchSujetos(val);
                          if (!val.trim()) {
                            setEditCliente("Consumidor Final");
                            setEditDocNro("");
                            setEditCondicionIva(5);
                            setEditDocTipo(99);
                            setEditSujetoId(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleBuscarPadronEdit();
                          }
                        }}
                        onFocus={() => {
                          if (editCuitBusqueda.trim() && sujetosEncontrados.length > 0) {
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
                      onClick={handleBuscarPadronEdit}
                      disabled={isSearchingPadronEdit}
                      className="rounded-xl h-10 px-3 shrink-0 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100"
                      title="Buscar en Padrón AFIP"
                    >
                      {isSearchingPadronEdit ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditCuitBusqueda("");
                        setEditCliente("Consumidor Final");
                        setEditSujetoId(null);
                        setEditDocNro("");
                        setEditDocTipo(99);
                        setEditCondicionIva(5);
                      }}
                      className="rounded-xl h-10 px-3 shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-100"
                      title="Limpiar y volver a Consumidor Final"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!editDocNro && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-600 uppercase">
                      Cliente / Razón Social
                    </Label>
                    <div className="relative">
                      <Input
                        value={editCliente}
                        onChange={(e) => setEditCliente(e.target.value)}
                        className="pl-9 h-10 text-xs bg-slate-50 border-slate-200 rounded-xl font-bold"
                      />
                      <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                )}
              </div>

              {editDocNro && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Label className="text-[10px] font-bold uppercase text-emerald-700">
                        Razón Social
                      </Label>
                      <Input
                        value={editCliente}
                        onChange={(e) => setEditCliente(e.target.value)}
                        className="h-7 px-0 border-0 border-b border-emerald-300 rounded-none bg-transparent text-sm font-bold text-emerald-950 shadow-none focus-visible:ring-0"
                      />
                    </div>
                    <Badge
                      className={`${
                        editCondicionIva === 1
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : editCondicionIva === 6
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      } font-bold text-[10px] border shadow-none shrink-0`}
                    >
                      {editCondicionIva === 1
                        ? "RESP. INSCRIPTO"
                        : editCondicionIva === 6
                        ? "MONOTRIBUTISTA"
                        : "CONSUMIDOR FINAL"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-bold">
                    {editDocTipo === 80 ? "CUIT" : "DNI"}: {editDocNro}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Punto de Venta</Label>
                  <select
                    value={editPuntoVentaId || ""}
                    onChange={(e) => setEditPuntoVentaId(e.target.value)}
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
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                    className="bg-white border-slate-200 h-10 text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Vendedor</Label>
                  <Input
                    value={editVendedor}
                    onChange={(e) => setEditVendedor(e.target.value)}
                    className="bg-white border-slate-200 h-10 text-xs rounded-xl font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Tipo de Envío</Label>
                  <select
                    value={editTipoEnvio}
                    onChange={(e) => setEditTipoEnvio(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold focus:outline-none"
                  >
                    <option value="andreani">📦 Andreani</option>
                    <option value="retiro">🏬 Retiro en Mostrador</option>
                    <option value="mensajeria">🛵 Mensajería</option>
                    <option value="expreso">🚛 Expreso</option>
                    <option value="otro">📋 Otro</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 pt-1 col-span-1 md:col-span-2">
                  <input
                    type="checkbox"
                    id="eventoOfflineModalEdit"
                    checked={editEventoOffline}
                    onChange={(e) => setEditEventoOffline(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <Label htmlFor="eventoOfflineModalEdit" className="text-xs font-semibold text-slate-700 cursor-pointer">
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
                  value={editInfo}
                  onChange={(e) => setEditInfo(e.target.value)}
                  placeholder="Dirección, referencias, método de entrega, notas..."
                  className="min-h-[70px] text-xs rounded-xl border-slate-200 resize-none bg-slate-50/40 focus:bg-white"
                />
                {editSujetoId && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500">
                      Para: <span className="font-semibold text-slate-700">{editCliente}</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSavingObsProveedor}
                      onClick={async () => {
                        if (!editSujetoId) return;
                        setIsSavingObsProveedor(true);
                        const res = await actualizarObservacionesProveedor(editSujetoId, editInfo.trim());
                        setIsSavingObsProveedor(false);
                        if (res.success) alert("¡Observaciones guardadas en la ficha del cliente!");
                        else alert("No se pudieron guardar las observaciones.");
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

            {/* COLUMNA 2: FORMA DE PAGO Y DETALLES */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="pagoMixtoModalEdit"
                  checked={isEditPagoMixto}
                  onChange={(e) => {
                    setIsEditPagoMixto(e.target.checked);
                    if (e.target.checked && editMontoPago1 === 0) {
                      setEditMontoPago1(redondearA50(totalBaseEdit / 2));
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <Label htmlFor="pagoMixtoModalEdit" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Pago Mixto (Dividir en 2 métodos de pago)
                </Label>
              </div>

              {isEditPagoMixto ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-blue-800 uppercase">Método 1</Label>
                    <select
                      value={editMetodoPago}
                      onChange={(e) => setEditMetodoPago(e.target.value)}
                      style={{ borderLeftWidth: 3, borderLeftColor: colorMetodoPago(editMetodoPago) }}
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
                          onClick={() => setEditMontoPago1(redondearA50(totalBaseEdit / 2))}
                          className="text-[10px] font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded"
                        >
                          50% / 50%
                        </button>
                      </div>
                      <Input
                        type="number"
                        value={editMontoPago1}
                        onChange={(e) => setEditMontoPago1(Number(e.target.value))}
                        className="font-bold border-blue-200 h-9 text-xs"
                      />
                    </div>
                    {isCredito1 && (
                      <p className="text-[11px] font-bold text-blue-700 bg-blue-100 p-1.5 rounded-lg border border-blue-200">
                        Total P1 (+{editInteresTarjeta}%): $ {final1.toLocaleString("es-AR")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-blue-800 uppercase">Método 2</Label>
                    <select
                      value={editMetodoPago2}
                      onChange={(e) => setEditMetodoPago2(e.target.value)}
                      style={{ borderLeftWidth: 3, borderLeftColor: colorMetodoPago(editMetodoPago2) }}
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
                        Total P2 (+{editInteresTarjeta}%): $ {final2.toLocaleString("es-AR")}
                      </p>
                    )}
                  </div>

                  <div className="col-span-1 md:col-span-2 bg-blue-700 text-white p-3 rounded-xl flex justify-between items-center shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Final Calculado</span>
                    <span className="text-xl font-black">$ {totalFinalCalculadoEdit.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Forma de Pago</Label>
                  <select
                    value={editMetodoPago}
                    onChange={(e) => setEditMetodoPago(e.target.value)}
                    style={{ borderLeftWidth: 4, borderLeftColor: colorMetodoPago(editMetodoPago) }}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-center focus:outline-none cursor-pointer"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.value} value={m.value} style={{ color: m.color, fontWeight: "bold" }}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(isCredito1 || isCredito2) && (
                <div className="space-y-1.5 pt-1 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-blue-700 uppercase">
                        Procesador (Crédito)
                      </Label>
                      <select
                        value={editProcesadorTarjeta}
                        onChange={(e) => setEditProcesadorTarjeta(e.target.value)}
                        className="w-full h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs focus:outline-none font-semibold text-slate-800"
                      >
                        <option value="Posnet Intercap">🏦 Posnet Intercap</option>
                        <option value="Go Cuotas">📅 Go Cuotas</option>
                        <option value="Posnet Mercadopago">🔵 Posnet Mercadopago</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-blue-700 uppercase">
                        % Interés
                      </Label>
                      <Input
                        type="number"
                        value={editInteresTarjeta}
                        onChange={(e) => setEditInteresTarjeta(Number(e.target.value))}
                        className="h-8 text-xs font-bold text-blue-600 bg-white border-blue-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Campos dinámicos por medio de pago */}
              {requiereTarjeta && (
                <div className="grid grid-cols-2 gap-2.5 bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">DNI</Label>
                    <Input
                      value={editDni}
                      onChange={(e) => setEditDni(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">Teléfono</Label>
                    <Input
                      value={editTelefono}
                      onChange={(e) => setEditTelefono(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">N° Cupón</Label>
                    <Input
                      value={editCupon}
                      onChange={(e) => setEditCupon(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-blue-700">ID Transacción</Label>
                    <Input
                      value={editTransaccionId}
                      onChange={(e) => setEditTransaccionId(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>
              )}

              {requiereMercadoLibre && (
                <div className="grid grid-cols-2 gap-2.5 bg-amber-50/60 p-3 rounded-xl border border-amber-100 text-xs">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">Id Venta</Label>
                    <Input
                      value={editMlIdVenta}
                      onChange={(e) => setEditMlIdVenta(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">Id Envío</Label>
                    <Input
                      value={editMlIdEnvio}
                      onChange={(e) => setEditMlIdEnvio(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">MLA</Label>
                    <Input
                      value={editMlMla}
                      onChange={(e) => setEditMlMla(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-800">DNI (Opcional)</Label>
                    <Input
                      value={editMlDni}
                      onChange={(e) => setEditMlDni(e.target.value)}
                      className="bg-white border-amber-200 h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>
              )}

              {requiereMercadoPago && (
                <div className="bg-sky-50/60 p-3 rounded-xl border border-sky-100 text-xs space-y-1">
                  <Label className="text-xs font-bold text-sky-700">Id de pago</Label>
                  <Input
                    value={editMlIdVenta}
                    onChange={(e) => setEditMlIdVenta(e.target.value)}
                    className="bg-white border-sky-200 h-8 text-xs rounded-lg"
                    placeholder="Identificador de cobro MP..."
                  />
                </div>
              )}

              {requiereCruzada && !isEditPagoMixto && (
                <div className="space-y-3 bg-teal-50/60 p-3.5 rounded-xl border border-teal-100 text-xs">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-bold text-teal-800 uppercase">
                      Pago Cruzada: Proveedores
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-teal-300 text-teal-700 hover:bg-teal-100 rounded-lg"
                        onClick={onAbrirNuevoProveedor}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Nuevo Proveedor
                      </Button>
                      {editProveedoresCruzada.length < 4 && (
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
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-teal-700 uppercase">
                        Origen (De)
                      </Label>
                      <Input
                        value={editDeCruzada}
                        onChange={(e) => setEditDeCruzada(e.target.value)}
                        className="h-8 bg-white border-teal-200 text-xs rounded-lg"
                        placeholder="¿Quién envía el dinero?"
                      />
                    </div>

                    {editProveedoresCruzada.map((item, idx) => (
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
                                setShowProvListMultiEdit(idx);
                              }}
                              onFocus={() => setShowProvListMultiEdit(idx)}
                              className="h-8 bg-white border-teal-200 text-xs rounded-lg"
                              placeholder="Buscar..."
                            />
                            {showProvListMultiEdit === idx && proveedores.length > 0 && (
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
                                        actualizarProveedorCruzada(idx, "razonSocial", p.razonSocial);
                                        actualizarProveedorCruzada(idx, "id", p.id);
                                        setShowProvListMultiEdit(null);
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
                            disabled={editProveedoresCruzada.length === 1}
                            onChange={(e) =>
                              actualizarProveedorCruzada(idx, "monto", Number(e.target.value))
                            }
                            className="h-8 bg-white disabled:bg-teal-100/50 disabled:text-teal-950 border-teal-200 text-xs font-bold text-teal-900 rounded-lg"
                          />
                        </div>

                        {editProveedoresCruzada.length > 1 && (
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
                    <span className="text-xs font-bold text-teal-900">
                      $ {editProveedoresCruzada.reduce((acc, curr) => acc + curr.monto, 0).toLocaleString("es-AR")} / $ {totalFinalCalculadoEdit.toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              )}

              {/* MIXTO: Cruzada + Cuenta Corriente */}
              {esMixtoCruzadaCC && (
                <div className="space-y-3">
                  <div className="bg-teal-50/70 p-3 rounded-xl border border-teal-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-teal-800 uppercase">
                        1. Pago Cruzada
                      </Label>
                      <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md">
                        $ {(editMetodoPago === "Cruzada" ? final1 : final2).toLocaleString("es-AR")}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-teal-700 uppercase">
                          Quien Envía (De)
                        </Label>
                        <Input
                          value={editDeCruzada}
                          onChange={(e) => setEditDeCruzada(e.target.value)}
                          className="bg-white border-teal-200 h-8 text-xs rounded-lg"
                          placeholder="Nombre de quien envía..."
                        />
                      </div>
                      <div className="space-y-1 relative">
                        <Label className="text-[10px] font-bold text-teal-700 uppercase">
                          Proveedor (Para)
                        </Label>
                        <div className="relative">
                          <Input
                            value={editParaCruzada}
                            onChange={(e) => {
                              setEditParaCruzada(e.target.value);
                              setShowProvListEdit(true);
                            }}
                            onFocus={() => setShowProvListEdit(true)}
                            className="bg-white border-teal-200 h-8 text-xs rounded-lg"
                            placeholder="Buscar proveedor..."
                          />
                          {showProvListEdit && proveedores.length > 0 && (
                            <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                              {proveedores
                                .filter(
                                  (p) =>
                                    p.razonSocial
                                      .toLowerCase()
                                      .includes(editParaCruzada.toLowerCase()) ||
                                    p.cuit.includes(editParaCruzada)
                                )
                                .map((p) => (
                                  <div
                                    key={p.id}
                                    className="p-2 hover:bg-teal-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setEditParaCruzada(p.razonSocial);
                                      setShowProvListEdit(false);
                                    }}
                                  >
                                    <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                    <p className="text-[9px] text-slate-400">{p.cuit}</p>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-emerald-800 uppercase">
                        2. Cuenta Corriente
                      </Label>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                        $ {(editMetodoPago === "A Cuenta Corriente" ? final1 : final2).toLocaleString("es-AR")}
                      </span>
                    </div>
                    <div className="space-y-1 relative">
                      <Label className="text-[10px] font-bold text-emerald-700 uppercase">
                        Proveedor / Cuenta
                      </Label>
                      <div className="relative">
                        <Input
                          value={editParaCuentaCorriente}
                          onChange={(e) => {
                            setEditParaCuentaCorriente(e.target.value);
                            setShowProvListCCEdit(true);
                          }}
                          onFocus={() => setShowProvListCCEdit(true)}
                          className="bg-white border-emerald-200 h-8 text-xs rounded-lg"
                          placeholder="Buscar proveedor..."
                        />
                        {showProvListCCEdit && proveedores.length > 0 && (
                          <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                            {proveedores
                              .filter(
                                (p) =>
                                  p.razonSocial
                                    .toLowerCase()
                                    .includes(editParaCuentaCorriente.toLowerCase()) ||
                                  p.cuit.includes(editParaCuentaCorriente)
                              )
                              .map((p) => (
                                <div
                                  key={p.id}
                                  className="p-2 hover:bg-emerald-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setEditParaCuentaCorriente(p.razonSocial);
                                    setShowProvListCCEdit(false);
                                  }}
                                >
                                  <p className="font-bold text-slate-800">{p.razonSocial}</p>
                                  <p className="text-[9px] text-slate-400">{p.cuit}</p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cuenta Corriente Simple o Mixto con CC */}
              {((requiereCruzada && isEditPagoMixto && !esMixtoCruzadaCC) ||
                (requiereCuentaCorriente && !esMixtoCruzadaCC)) && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-2 ${
                    requiereCruzada
                      ? "bg-teal-50/60 border-teal-100"
                      : "bg-emerald-50/60 border-emerald-100"
                  }`}
                >
                  {isEditPagoMixto && (
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                      <span className={`text-[11px] font-bold uppercase ${requiereCruzada ? "text-teal-800" : "text-emerald-800"}`}>
                        {requiereCruzada ? "Pago Cruzada" : "A Cuenta Corriente"}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${requiereCruzada ? "bg-teal-100 text-teal-800" : "bg-emerald-100 text-emerald-800"}`}>
                        $ {(editMetodoPago === (requiereCruzada ? "Cruzada" : "A Cuenta Corriente") ? final1 : final2).toLocaleString("es-AR")}
                      </span>
                    </div>
                  )}
                  {requiereCruzada && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-teal-700">De</Label>
                      <Input
                        value={editDeCruzada}
                        onChange={(e) => setEditDeCruzada(e.target.value)}
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
                      {requiereCuentaCorriente ? "Cuenta / Proveedor" : "Para"}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={editParaCruzada}
                          onChange={(e) => {
                            setEditParaCruzada(e.target.value);
                            setShowProvListEdit(true);
                          }}
                          onFocus={() => setShowProvListEdit(true)}
                          className={`h-8 text-xs rounded-lg ${
                            requiereCruzada
                              ? "bg-white border-teal-200"
                              : "bg-white border-emerald-200"
                          }`}
                          placeholder="Buscar proveedor..."
                        />
                        {showProvListEdit && proveedores.length > 0 && (
                          <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                            {proveedores
                              .filter(
                                (p) =>
                                  p.razonSocial
                                    .toLowerCase()
                                    .includes(editParaCruzada.toLowerCase()) ||
                                  p.cuit.includes(editParaCruzada)
                              )
                              .map((p) => (
                                <div
                                  key={p.id}
                                  className="p-2 cursor-pointer text-xs border-b border-slate-50 last:border-0 hover:bg-slate-50"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setEditParaCruzada(p.razonSocial);
                                    setShowProvListEdit(false);
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

          {/* PIE DE PÁGINA */}
          <DialogFooter className="p-0 pt-3 border-t border-slate-200 gap-2 shrink-0 flex flex-wrap items-center justify-between">
            <Button
              variant="outline"
              onClick={handleVolverAPedido}
              disabled={isSubmitting || !!venta?.cae}
              title={
                venta?.cae
                  ? "Tiene factura ARCA emitida: anulala con NC antes de revertir."
                  : "Vuelve la venta a estado 'pedido de venta'"
              }
              className="border-orange-200 text-orange-700 hover:bg-orange-50 mr-auto rounded-xl text-xs font-bold h-10"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-orange-600" /> Volver a Pedido de Venta
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs h-10 px-4"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleGuardarEdicion}
                disabled={isSubmitting}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold px-6 text-xs shadow-md shadow-amber-600/20 h-10"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar Modificación de Venta
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

