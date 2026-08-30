"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  inputSinFlechas,
  formatearPrecioMiles,
} from "../../constants";
import { consultarPadron } from "@/app/actions/afip";
import {
  actualizarVentaMostrador,
  revertirVentaAPedido,
} from "@/app/actions/ventas-mostrador";

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
  puntosVenta,
  proveedores,
  onVentaActualizada,
  onAbrirBuscadorArticulosEdit,
  onAbrirFastUpdateDb,
  onAbrirNuevoProveedor,
  editItems,
  setEditItems,
}: Props) {
  const [editCliente, setEditCliente] = useState("");
  const [editInteresTarjeta, setEditInteresTarjeta] = useState<number>(0);
  const [editMetodoPago, setEditMetodoPago] = useState("Efectivo");
  const [isEditPagoMixto, setIsEditPagoMixto] = useState(false);
  const [editMontoPago1, setEditMontoPago1] = useState<number>(0);
  const [editMetodoPago2, setEditMetodoPago2] = useState("Tarjeta de Crédito");
  const [editProcesadorTarjeta, setEditProcesadorTarjeta] = useState("Posnet Intercap");
  const [editDni, setEditDni] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editInfo, setEditInfo] = useState("");
  const [editCupon, setEditCupon] = useState("");
  const [editTransaccionId, setEditTransaccionId] = useState("");
  const [editDeCruzada, setEditDeCruzada] = useState("");
  const [editParaCruzada, setEditParaCruzada] = useState("");
  const [editProveedoresCruzada, setEditProveedoresCruzada] = useState<
    { id: string; razonSocial: string; monto: number }[]
  >([]);
  const [editParaCuentaCorriente, setEditParaCuentaCorriente] = useState("");
  const [editMlIdVenta, setEditMlIdVenta] = useState("");
  const [editMlIdEnvio, setEditMlIdEnvio] = useState("");
  const [editMlMla, setEditMlMla] = useState("");
  const [editMlDni, setEditMlDni] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEventoOffline, setEditEventoOffline] = useState(false);
  const [editPuntoVentaId, setEditPuntoVentaId] = useState("");
  const [editDocTipo, setEditDocTipo] = useState<number>(99);
  const [editDocNro, setEditDocNro] = useState<string>("");
  const [editCondicionIva, setEditCondicionIva] = useState<number>(5);
  const [editCuitBusqueda, setEditCuitBusqueda] = useState("");
  const [isSearchingPadronEdit, setIsSearchingPadronEdit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showProvListEdit, setShowProvListEdit] = useState(false);
  const [showProvListCCEdit, setShowProvListCCEdit] = useState(false);
  const [showProvListMultiEdit, setShowProvListMultiEdit] = useState<number | null>(null);

  // Edición en línea
  const [marcacionItemEditId, setMarcacionItemEditId] = useState<string | null>(null);
  const [marcacionItemTemp, setMarcacionItemTemp] = useState<string>("");
  const [precioItemEditId, setPrecioItemEditId] = useState<string | null>(null);
  const [precioItemTemp, setPrecioItemTemp] = useState<string>("");

  useEffect(() => {
    if (venta && open) {
      setEditCliente(venta.cliente || "Consumidor Final");
      setEditInteresTarjeta(Number(venta.interes || 0));
      setEditDni(venta.dni || "");
      setEditTelefono(venta.telefono || "");
      setEditInfo(venta.info || "");
      setEditCupon(venta.cupon || "");
      setEditTransaccionId(venta.transaccionId || "");
      setEditDeCruzada(venta.de || "");
      setEditEmail(venta.email || "");
      setEditEventoOffline(venta.eventoOffline || false);
      setEditPuntoVentaId(venta.puntoVentaId || "");
      setEditDocTipo(venta.docTipo || 99);
      setEditDocNro(venta.docNro || "");
      setEditCondicionIva(venta.condicionIva || 5);
      setEditCuitBusqueda(venta.docNro || "");
      setEditMlIdVenta(venta.mlIdVenta || "");
      setEditMlIdEnvio(venta.mlIdEnvio || "");
      setEditMlMla(venta.mlMla || "");
      setEditMlDni(venta.mlDni || "");

      // Parsear métodos de pago
      const mp = venta.metodo_pago || "Efectivo";
      if (mp.includes(" + ")) {
        setIsEditPagoMixto(true);
        const partes = mp.split(" + ");
        setEditMetodoPago(partes[0] || "Efectivo");
        setEditMetodoPago2(partes[1] || "Tarjeta de Crédito");
      } else {
        setIsEditPagoMixto(false);
        setEditMetodoPago(mp);
        setEditMetodoPago2("Tarjeta de Crédito");
      }

      setEditItems(
        (venta.items || []).map((i: any) => ({
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
    }
  }, [venta, open, setEditItems]);

  const totalBaseEdit = useMemo(
    () => editItems.reduce((acc, item) => acc + (item.subtotal || 0), 0),
    [editItems]
  );

  const base1 = isEditPagoMixto ? Number(editMontoPago1 || 0) : totalBaseEdit;
  const base2 = isEditPagoMixto ? Math.max(0, totalBaseEdit - base1) : 0;
  const isCredito1 = editMetodoPago === "Tarjeta de Crédito";
  const isCredito2 = editMetodoPago2 === "Tarjeta de Crédito";
  const final1 = isCredito1 ? redondearA50(base1 * (1 + editInteresTarjeta / 100)) : base1;
  const final2 = isCredito2 ? redondearA50(base2 * (1 + editInteresTarjeta / 100)) : base2;
  const totalFinalCalculadoEdit = isEditPagoMixto
    ? final1 + final2
    : isCredito1
    ? redondearA50(totalBaseEdit * (1 + editInteresTarjeta / 100))
    : totalBaseEdit;

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

  const handleGuardarEdicion = async () => {
    if (!venta) return;
    if (editItems.length === 0) {
      alert("Debe haber al menos un artículo en la venta.");
      return;
    }
    setIsSubmitting(true);
    try {
      const metodoFinal = isEditPagoMixto
        ? `${editMetodoPago} + ${editMetodoPago2}`
        : editMetodoPago;

      const res = await actualizarVentaMostrador(
        venta.id,
        {
          cliente: editCliente,
          total: totalBaseEdit,
          interes: editInteresTarjeta,
          totalFinal: totalFinalCalculadoEdit,
          metodo_pago: metodoFinal,
          items: editItems,
          dni: editDni,
          telefono: editTelefono,
          info: editInfo,
          cupon: editCupon,
          transaccionId: editTransaccionId,
          de: editDeCruzada,
          para: editParaCruzada,
          email: editEmail,
          eventoOffline: editEventoOffline,
          puntoVentaId: editPuntoVentaId,
          mlIdVenta: editMlIdVenta,
          mlIdEnvio: editMlIdEnvio,
          mlMla: editMlMla,
          mlDni: editMlDni,
          docTipo: editDocTipo,
          docNro: editDocNro,
          condicionIva: editCondicionIva,
        },
        "Mostrador",
        "Edición de venta desde Mostrador"
      );

      if (res.success) {
        onVentaActualizada();
        onOpenChange(false);
      } else {
        alert("Error al actualizar la venta: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al actualizar venta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVolverAPedido = async () => {
    if (!venta) return;
    if (venta.cae) {
      alert("La venta tiene CAE de AFIP. No se puede revertir a pedido sin anular la factura.");
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
      alert("Error de conexión.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-amber-200 shadow-2xl">
        <DialogHeader className="p-5 bg-amber-50/70 border-b border-amber-100 shrink-0">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-950">
            <Edit className="h-5 w-5 text-amber-600" /> Editando Venta #{venta?.numeroVenta || venta?.id?.slice(0, 8)}
          </DialogTitle>
          <DialogDescription className="text-amber-800 text-xs">
            Modifica los artículos, el cliente o la forma de pago.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto p-5 space-y-4 bg-slate-50/40 text-xs">
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">
                  CUIT / DNI (Padrón AFIP)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={editCuitBusqueda}
                    onChange={(e) => setEditCuitBusqueda(e.target.value)}
                    placeholder="CUIT o DNI..."
                    className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleBuscarPadronEdit}
                    disabled={isSearchingPadronEdit}
                    className="rounded-xl h-9 px-3 bg-blue-50 text-blue-600 border border-blue-100"
                  >
                    {isSearchingPadronEdit ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">
                  Cliente / Razón Social
                </Label>
                <Input
                  value={editCliente}
                  onChange={(e) => setEditCliente(e.target.value)}
                  className="bg-slate-50 h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase">% Interés</Label>
                <Input
                  type="number"
                  value={editInteresTarjeta}
                  onChange={(e) => setEditInteresTarjeta(Number(e.target.value))}
                  className="font-bold text-blue-600 bg-slate-50 h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                type="button"
                onClick={onAbrirBuscadorArticulosEdit}
                className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5 px-4 h-9 rounded-xl text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5" /> Añadir Artículo a esta Venta
              </Button>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 font-bold uppercase block">
                  Total Final
                </span>
                <span className="text-lg font-black text-slate-900">
                  $ {totalFinalCalculadoEdit.toLocaleString("es-AR")}
                </span>
              </div>
            </div>
          </div>

          {/* Tabla de artículos en edición */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase">Artículo</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase">Costo</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase">Cant.</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase">Precio Unit.</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase">Subtotal</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-400 italic">
                      No hay artículos cargados en la venta
                    </TableCell>
                  </TableRow>
                ) : (
                  editItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold text-slate-800">
                        {item.nombre}
                      </TableCell>
                      <TableCell className="text-center">
                        ${Number(item.costo || 0).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) =>
                            setEditItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id
                                  ? {
                                      ...i,
                                      cantidad: Number(e.target.value),
                                      subtotal: Number(e.target.value) * i.precio_unit,
                                    }
                                  : i
                              )
                            )
                          }
                          className="w-16 h-8 text-xs mx-auto text-center font-bold"
                        />
                      </TableCell>
                      <TableCell className="text-center font-bold text-slate-700">
                        ${Number(item.precio_unit).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900">
                        ${Number(item.subtotal).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditItems((prev) => prev.filter((i) => i.id !== item.id))
                          }
                          className="text-red-400 hover:text-red-600 h-8 w-8"
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

        <DialogFooter className="p-4 bg-white border-t border-slate-200 gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={handleVolverAPedido}
            disabled={isSubmitting || !!venta?.cae}
            title={
              venta?.cae
                ? "Tiene factura ARCA emitida: anulala con NC antes de revertir."
                : "Vuelve la venta a estado 'pedido de venta'"
            }
            className="border-orange-200 text-orange-700 hover:bg-orange-50 mr-auto rounded-xl text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Volver a Pedido de Venta
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGuardarEdicion}
            disabled={isSubmitting}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold px-6 text-xs shadow-md shadow-amber-600/20"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar Modificación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
