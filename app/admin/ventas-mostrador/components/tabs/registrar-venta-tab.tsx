"use client";

import React from "react";
import {
  Plus,
  FileText,
  Trash2,
  Save,
  Printer,
  X,
  Percent,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemVenta } from "../../types";
import {
  redondearA50,
  esActualizacionVieja,
  calcularMarcacion,
  claseColorMarcacion,
  formatearPrecioMiles,
  inputSinFlechas,
} from "../../constants";

interface Props {
  pedidoEnEdicionId?: string | null;
  numeroPedidoEnEdicion?: number | null;
  onCancelarEdicionPedido: () => void;
  onAbrirBuscadorArticulos: () => void;
  onAbrirCrearArticulo: () => void;
  onAbrirFastUpdateDb: (id: string, precio: number) => void;
  onAbrirFinalizarModal: () => void;
  onAbrirConfirmDiscard: () => void;
  onImprimirPresupuesto: () => void;
  onCopiarTexto: (texto: string) => void;
  cart: {
    items: ItemVenta[];
    setItems: React.Dispatch<React.SetStateAction<ItemVenta[]>>;
    interesTarjeta: number;
    setInteresTarjeta: (val: number) => void;
    descuentoTipo: "porcentaje" | "monto";
    setDescuentoTipo: (val: "porcentaje" | "monto") => void;
    descuentoValor: number;
    setDescuentoValor: (val: number) => void;
    showNotaInput: boolean;
    setShowNotaInput: (val: boolean | ((v: boolean) => boolean)) => void;
    notaTexto: string;
    setNotaTexto: (val: string) => void;
    agregarNota: () => void;
    actualizarCantidad: (id: string, cant: number) => void;
    eliminarItem: (id: string) => void;
    iniciarEdicionMarcacion: (item: ItemVenta) => void;
    cancelarEdicionMarcacion: () => void;
    guardarMarcacion: (item: ItemVenta) => void;
    marcacionItemEditId: string | null;
    marcacionItemTemp: string;
    setMarcacionItemTemp: (val: string) => void;
    iniciarEdicionPrecio: (item: ItemVenta) => void;
    guardarPrecio: (item: ItemVenta) => void;
    precioItemEditId: string | null;
    precioItemTemp: string;
    setPrecioItemTemp: (val: string) => void;
    obtenerPrecioItemEnVivo: (item: ItemVenta) => number;
    totalBase: number;
    montoDescuento: number;
    totalConDescuento: number;
    totalACobrar: number;
  };
  isSubmitting: boolean;
}

export function RegistrarVentaTab({
  pedidoEnEdicionId,
  numeroPedidoEnEdicion,
  onCancelarEdicionPedido,
  onAbrirBuscadorArticulos,
  onAbrirCrearArticulo,
  onAbrirFastUpdateDb,
  onAbrirFinalizarModal,
  onAbrirConfirmDiscard,
  onImprimirPresupuesto,
  onCopiarTexto,
  cart,
  isSubmitting,
}: Props) {
  const {
    items,
    setItems,
    interesTarjeta,
    setInteresTarjeta,
    descuentoTipo,
    setDescuentoTipo,
    descuentoValor,
    setDescuentoValor,
    showNotaInput,
    setShowNotaInput,
    notaTexto,
    setNotaTexto,
    agregarNota,
    actualizarCantidad,
    eliminarItem,
    iniciarEdicionMarcacion,
    cancelarEdicionMarcacion,
    guardarMarcacion,
    marcacionItemEditId,
    marcacionItemTemp,
    setMarcacionItemTemp,
    iniciarEdicionPrecio,
    guardarPrecio,
    precioItemEditId,
    precioItemTemp,
    setPrecioItemTemp,
    obtenerPrecioItemEnVivo,
    totalBase,
    montoDescuento,
    totalConDescuento,
    totalACobrar,
  } = cart;

  return (
    <div className="flex-grow flex flex-col overflow-hidden h-full">
      <main className="flex-grow flex flex-col p-4 md:p-6 max-w-[1800px] mx-auto w-full gap-3.5 overflow-hidden h-full">
        {pedidoEnEdicionId && (
          <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 shrink-0">
            <span className="text-xs font-bold text-indigo-900 flex items-center gap-2">
              <Edit className="h-4 w-4 text-indigo-600" /> Editando Pedido de Venta #{numeroPedidoEnEdicion}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelarEdicionPedido}
              className="text-indigo-700 hover:bg-indigo-100 text-xs font-semibold h-8"
            >
              Cancelar edición
            </Button>
          </div>
        )}

        {/* Barra superior de acciones rápidas */}
        <div className="flex gap-3 items-center flex-wrap shrink-0">
          <Button
            onClick={onAbrirBuscadorArticulos}
            className="bg-slate-900 hover:bg-slate-800 text-white gap-2 px-5 rounded-xl text-xs font-bold shadow-sm"
          >
            <Plus className="h-4 w-4" /> Añadir Artículo (+ / F2)
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowNotaInput((v: boolean) => !v);
              setNotaTexto("");
            }}
            className="border-amber-200 text-amber-800 hover:bg-amber-50 gap-2 px-4 rounded-xl text-xs font-semibold shadow-xs"
          >
            <FileText className="h-4 w-4 text-amber-600" /> Agregar Nota
          </Button>
          <Button
            onClick={onAbrirCrearArticulo}
            variant="outline"
            className="ml-auto border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2 px-4 rounded-xl text-xs font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4 text-indigo-600" /> Crear nuevo artículo
          </Button>
        </div>

        {/* Input para agregar nota */}
        {showNotaInput && (
          <div className="flex gap-2 items-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 shadow-xs shrink-0">
            <FileText className="h-4 w-4 text-amber-600 shrink-0" />
            <Input
              autoFocus
              placeholder="Escribe la nota interna (ej: entregar con bolsa de regalo)..."
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && notaTexto.trim()) {
                  agregarNota();
                } else if (e.key === "Escape") {
                  setShowNotaInput(false);
                  setNotaTexto("");
                }
              }}
              className="flex-1 h-8 text-xs border-amber-200 bg-white"
            />
            <Button
              size="sm"
              onClick={agregarNota}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 h-8 rounded-lg"
            >
              Añadir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowNotaInput(false);
                setNotaTexto("");
              }}
              className="h-8 px-2 text-slate-400"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Tabla principal de artículos del POS */}
        <div className="flex-grow bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-grow h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-xs">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase py-2.5">Artículo</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase py-2.5">Costo</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase py-2.5">Actualizado</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase py-2.5 border-l border-slate-200">Cant.</TableHead>
                  <TableHead className="text-center text-xs font-bold uppercase py-2.5">Precio Unit.</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase py-2.5">Subtotal</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-24 text-center text-slate-400 text-sm italic">
                      No hay artículos en la venta actual. Pulsa &quot;+&quot; o &quot;Añadir Artículo&quot; para comenzar.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) =>
                    item.esNota ? (
                      <TableRow
                        key={item.id}
                        className="bg-amber-50/70 hover:bg-amber-50 transition-colors border-l-4 border-l-amber-400"
                      >
                        <TableCell colSpan={5} className="py-2.5">
                          <div className="flex items-center gap-2 text-amber-900">
                            <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="text-xs font-semibold italic">{item.nombre}</span>
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                              Nota
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-2.5 text-slate-300 text-xs">—</TableCell>
                        <TableCell className="py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => eliminarItem(item.id)}
                            className="text-red-400 hover:text-red-600 h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <TableCell className="font-medium text-slate-800 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              {item.esPack && (
                                <span className="bg-purple-100 text-purple-700 text-xs font-bold px-1.5 py-0.5 rounded border border-purple-200 uppercase shrink-0">
                                  Pack
                                </span>
                              )}
                              <span
                                onClick={() => onCopiarTexto(item.nombre)}
                                className="text-sm font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                                title="Copiar Nombre"
                              >
                                {item.nombre}
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                                  item.stock <= 0
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : item.stock <= 5
                                    ? "bg-orange-50 text-orange-600 border-orange-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                Stock: {item.stock}
                              </span>
                            </div>
                            <span
                              onClick={() => onCopiarTexto(item.productoId ?? item.id)}
                              className="text-xs text-slate-400 font-mono cursor-pointer hover:text-blue-600 transition-colors w-fit"
                              title="Copiar ID"
                            >
                              {item.productoId ?? item.id}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-center py-2.5">
                          {item.costo && item.costo > 0 ? (
                            <span className="text-xs text-slate-700 font-semibold" title="Costo del artículo">
                              $ {redondearA50(Number(item.costo)).toLocaleString("es-AR")}
                            </span>
                          ) : (
                            <span className="text-red-500 font-bold text-xs" title="Sin costo cargado">
                              ✕
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-center py-2.5">
                          {item.ultimaModificacion ? (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                                esActualizacionVieja(item.ultimaModificacion)
                                  ? "text-red-600 bg-red-50 border border-red-200"
                                  : "text-slate-700 bg-slate-100"
                              }`}
                              title="Última actualización en BD"
                            >
                              {new Date(item.ultimaModificacion).toLocaleDateString("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </span>
                          ) : (
                            <span className="text-red-500 font-bold text-xs">✕</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center py-2.5 border-l border-slate-200">
                          <Input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => actualizarCantidad(item.id, Number(e.target.value))}
                            className={`w-16 mx-auto h-8 text-xs text-center font-bold ${inputSinFlechas}`}
                          />
                        </TableCell>

                        <TableCell className="text-center py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-slate-400 text-xs">$</span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={
                                precioItemEditId === item.id
                                  ? precioItemTemp
                                  : formatearPrecioMiles(obtenerPrecioItemEnVivo(item))
                              }
                              onFocus={() => iniciarEdicionPrecio(item)}
                              onChange={(e) => setPrecioItemTemp(e.target.value.replace(/\D/g, ""))}
                              onBlur={() => guardarPrecio(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              className={`w-20 h-8 text-xs text-center ${inputSinFlechas} font-bold text-slate-800`}
                            />

                            {marcacionItemEditId === item.id ? (
                              <input
                                type="number"
                                autoFocus
                                value={marcacionItemTemp}
                                onChange={(e) => setMarcacionItemTemp(e.target.value)}
                                onBlur={() => guardarMarcacion(item)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") guardarMarcacion(item);
                                  if (e.key === "Escape") cancelarEdicionMarcacion();
                                }}
                                className={`w-16 h-8 text-xs font-bold text-center rounded-lg border border-blue-400 outline-none ${inputSinFlechas}`}
                              />
                            ) : (() => {
                              const marc = calcularMarcacion(item.costo, item.precio_unit);
                              if (marc === null) return null;
                              return (
                                <span
                                  onClick={() => iniciarEdicionMarcacion(item)}
                                  title="Clic para editar marcación solo en esta venta"
                                  className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer hover:ring-1 hover:ring-emerald-300 ${claseColorMarcacion(
                                    marc
                                  )}`}
                                >
                                  {marc.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
                                </span>
                              );
                            })()}

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              title="Guardar este precio en Base de Datos"
                              onClick={() =>
                                onAbrirFastUpdateDb(item.productoId ?? item.id, item.precio_unit)
                              }
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>

                        <TableCell className="text-right py-2.5 font-bold text-slate-800 text-sm">
                          $ {Math.ceil(Number(item.subtotal)).toLocaleString("es-AR")}
                        </TableCell>

                        <TableCell className="py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => eliminarItem(item.id)}
                            className="text-red-400 hover:text-red-600 h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {/* Barra inferior fija de cobro (POS Footer) */}
      <footer className="bg-white border-t border-slate-200 p-4 md:px-8 shrink-0 shadow-lg z-20">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase block">Total Base</span>
              <span className="text-2xl font-black text-slate-900">
                $ {totalBase.toLocaleString("es-AR")}
              </span>
            </div>

            <div className="space-y-1 w-28">
              <Label className="text-xs font-bold text-slate-600 uppercase">% Int. Tarjeta</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={interesTarjeta}
                  onChange={(e) => setInteresTarjeta(Number(e.target.value))}
                  className="pl-7 h-9 text-xs font-bold text-blue-600 bg-slate-50/50 rounded-xl"
                />
                <Percent className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-1 w-36">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-600 uppercase">Descuento</Label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDescuentoTipo("porcentaje")}
                    className={`px-2 py-0.5 text-xs font-bold transition-colors ${
                      descuentoTipo === "porcentaje"
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-slate-400"
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescuentoTipo("monto")}
                    className={`px-2 py-0.5 text-xs font-bold transition-colors border-l border-slate-200 ${
                      descuentoTipo === "monto"
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-slate-400"
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  value={descuentoValor || ""}
                  onChange={(e) => setDescuentoValor(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="pl-7 h-9 text-xs font-bold text-emerald-600 bg-slate-50/50 rounded-xl"
                />
                {descuentoTipo === "porcentaje" ? (
                  <Percent className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">$</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-500 uppercase block">Total a Cobrar</span>
            <span
              className={`text-2xl sm:text-3xl font-black ${
                montoDescuento > 0 || interesTarjeta > 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              $ {totalACobrar.toLocaleString("es-AR")}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              onClick={onAbrirConfirmDiscard}
              className="text-red-500 hover:bg-red-50 h-11 px-4 rounded-xl text-xs font-semibold"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Descartar
            </Button>
            <Button
              variant="outline"
              onClick={onImprimirPresupuesto}
              disabled={items.length === 0}
              className="text-slate-700 border-slate-300 hover:bg-slate-50 h-11 px-5 rounded-xl text-xs font-bold"
            >
              <Printer className="h-4 w-4 mr-1.5" /> Presupuesto (F9)
            </Button>
            <Button
              onClick={onAbrirFinalizarModal}
              disabled={items.length === 0 || isSubmitting}
              className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
            >
              {pedidoEnEdicionId ? "Guardar Cambios del Pedido" : "Cobrar / Finalizar (F4)"}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
