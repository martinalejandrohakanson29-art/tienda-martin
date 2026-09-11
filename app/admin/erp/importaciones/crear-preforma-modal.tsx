"use client"

import React, { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  Trash2,
  Package,
  Building2,
  FileDigit,
  Calendar,
  DollarSign,
  Download,
  Loader2,
  Search,
  CheckCircle2,
  X,
  FileSpreadsheet,
  ExternalLink,
  Zap,
} from "lucide-react"
import { ArticuloCatalogo, BuscadorArticulosImportacionModal } from "./buscador-articulos-importacion-modal"
import {
  CrearPreformaManualInput,
  CrearPreformaManualItemInput,
} from "@/app/actions/preformas"
import { exportarPreformaAExcel } from "@/lib/exportar-preforma-excel"
import {
  PROVEEDORES_IMPORTACION_PRECARGADOS,
  buscarProveedorPorNombre,
  ProveedorImportacionInfo,
} from "@/lib/proveedores-importacion"
import { toast } from "sonner"

interface ItemBorrador extends CrearPreformaManualItemInput {
  articuloNombre: string
  articuloStock: number
  articuloCodigoProveedor?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  articulosCatalogo: ArticuloCatalogo[]
  cargandoCatalogo?: boolean
  onPreformaCreada: (nuevaPreforma: any) => void
  crearPreformaActionFn: (input: CrearPreformaManualInput) => Promise<any>
}

export function CrearPreformaModal({
  open,
  onOpenChange,
  articulosCatalogo,
  cargandoCatalogo = false,
  onPreformaCreada,
  crearPreformaActionFn,
}: Props) {
  // Proveedor precargado por defecto (Fuding Guansheng)
  const defaultProv = PROVEEDORES_IMPORTACION_PRECARGADOS[0]
  const [proveedorKey, setProveedorKey] = useState<string>(defaultProv.id)
  const [proveedorManual, setProveedorManual] = useState("")

  // Datos cabecera
  const [numeroFactura, setNumeroFactura] = useState("")
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split("T")[0])
  const [observaciones, setObservaciones] = useState(
    'PACKING: STANDARD CARTON PACKING with " made in china " | PAYMENT TERM: 50% advance - 50% boarded | PORT OF LOADING: CHINA | DESTINATION: CORDOBA - ARGENTINA'
  )

  // Ítems del borrador
  const [items, setItems] = useState<ItemBorrador[]>([])

  // Modal buscador de artículos
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)

  // Estados de guardado
  const [guardando, setGuardando] = useState(false)

  // Proveedor actual seleccionado
  const proveedorInfoActual: ProveedorImportacionInfo | undefined =
    proveedorKey !== "otro"
      ? PROVEEDORES_IMPORTACION_PRECARGADOS.find((p) => p.id === proveedorKey)
      : undefined

  const nombreProveedorFinal =
    proveedorKey === "otro"
      ? proveedorManual.trim()
      : proveedorInfoActual?.nombre || ""

  const handleCambiarProveedorKey = (key: string) => {
    setProveedorKey(key)
    if (key !== "otro") {
      const p = PROVEEDORES_IMPORTACION_PRECARGADOS.find((prov) => prov.id === key)
      if (p) {
        setObservaciones(
          `PACKING: ${p.condicionesGenerales.packing} | PAYMENT TERM: ${p.condicionesGenerales.paymentTerm} | PORT OF LOADING: ${p.condicionesGenerales.portOfLoading} | DESTINATION: ${p.condicionesGenerales.destination}`
        )
      }
    }
  }

  // Limpiar formulario
  const limpiarFormulario = () => {
    setProveedorKey(defaultProv.id)
    setProveedorManual("")
    setNumeroFactura("")
    setFechaEmision(new Date().toISOString().split("T")[0])
    setObservaciones(
      'PACKING: STANDARD CARTON PACKING with " made in china " | PAYMENT TERM: 50% advance - 50% boarded | PORT OF LOADING: CHINA | DESTINATION: CORDOBA - ARGENTINA'
    )
    setItems([])
  }


  // Totales
  const totalArticulos = items.length
  const totalUnidades = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0)
  const totalFobUsd = items.reduce((acc, it) => {
    const cant = Number(it.cantidad) || 0
    const pUnit = Number(it.precioUnitarioUsd) || 0
    return acc + cant * pUnit
  }, 0)

  // Artículos vinculados al proveedor seleccionado
  const articulosDelProveedor = useMemo(() => {
    if (!proveedorInfoActual) return []
    return articulosCatalogo.filter((art) => {
      if (art.proveedorId && art.proveedorId === proveedorInfoActual.id) return true
      if (art.proveedorNombre && proveedorInfoActual.nombre && art.proveedorNombre.toLowerCase() === proveedorInfoActual.nombre.toLowerCase()) return true
      return false
    })
  }, [articulosCatalogo, proveedorInfoActual])

  const handleCargarTodosDelProveedor = () => {
    if (articulosDelProveedor.length === 0) return
    const nuevosItems: ItemBorrador[] = articulosDelProveedor.map((art) => ({
      articuloId: art.id,
      articuloNombre: art.nombre,
      articuloStock: art.stock,
      articuloCodigoProveedor: art.codigoProveedor,
      supplierItemNo: art.supplierItemNoSugerido || art.codigoProveedor || art.id,
      descripcionOriginal: art.nombre,
      precioUnitarioUsd: art.fobUsdSugerido || 0,
      cantidad: 100,
      fotoStorageKey: null,
    }))
    setItems(nuevosItems)
    toast.success(`Se agregaron los ${nuevosItems.length} artículos vinculados a ${proveedorInfoActual?.nombre}`)
  }

  // Agregar artículo desde el buscador
  const handleSeleccionarArticulo = (art: ArticuloCatalogo) => {
    // Si ya está en la lista, aumentamos cantidad
    const indexExistente = items.findIndex((i) => i.articuloId === art.id)
    if (indexExistente !== -1) {
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === indexExistente
            ? { ...it, cantidad: it.cantidad + 10 }
            : it
        )
      )
      toast.info(`Se sumaron unidades a "${art.nombre}"`)
    } else {
      const nuevoItem: ItemBorrador = {
        articuloId: art.id,
        articuloNombre: art.nombre,
        articuloStock: art.stock,
        articuloCodigoProveedor: art.codigoProveedor,
        supplierItemNo: art.supplierItemNoSugerido || art.codigoProveedor || art.id,
        descripcionOriginal: art.nombre,
        cantidad: 100,
        precioUnitarioUsd: art.fobUsdSugerido || 0,
        logo: "ITALY",
        size: null,
      }
      setItems((prev) => [nuevoItem, ...prev])
      toast.success(`"${art.nombre}" agregado al pedido`)
    }
  }

  // Modificar cantidad de un ítem
  const handleCambiarCantidad = (idx: number, valor: string) => {
    const cant = parseInt(valor, 10)
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, cantidad: isNaN(cant) || cant < 1 ? 1 : cant } : it
      )
    )
  }

  // Modificar precio USD de un ítem
  const handleCambiarPrecioUnitario = (idx: number, valor: string) => {
    const p = parseFloat(valor)
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, precioUnitarioUsd: isNaN(p) || p < 0 ? 0 : p } : it
      )
    )
  }

  // Modificar Supplier Item No
  const handleCambiarSupplierNo = (idx: number, valor: string) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, supplierItemNo: valor } : it))
    )
  }

  // Quitar ítem del borrador
  const handleQuitarItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  // Guardar preforma
  const handleGuardar = async (descargarExcelDespues = false) => {
    if (items.length === 0) {
      toast.error("Por favor agrega al menos un artículo a la preforma.")
      return
    }

    setGuardando(true)
    try {
      const payload: CrearPreformaManualInput = {
        proveedor: nombreProveedorFinal || null,
        numeroFactura: numeroFactura.trim() || null,
        fechaEmision: fechaEmision ? new Date(fechaEmision) : new Date(),
        observaciones: observaciones.trim() || null,
        items: items.map((it) => ({
          articuloId: it.articuloId,
          supplierItemNo: it.supplierItemNo || it.articuloId,
          descripcionOriginal: it.descripcionOriginal || it.articuloNombre,
          cantidad: it.cantidad,
          precioUnitarioUsd: it.precioUnitarioUsd && it.precioUnitarioUsd > 0 ? it.precioUnitarioUsd : null,
          logo: it.logo || null,
          size: it.size || null,
        })),
      }

      const res = await crearPreformaActionFn(payload)
      if (!res.success) {
        toast.error(res.error || "No se pudo crear la preforma")
        return
      }

      toast.success(res.message || "Preforma creada con éxito!")
      if (res.data) {
        onPreformaCreada(res.data)
        if (descargarExcelDespues) {
          exportarPreformaAExcel(res.data)
          toast.success("Archivo Excel generado y descargado.")
        }
      }

      limpiarFormulario()
      onOpenChange(false)
    } catch (err: any) {
      console.error("Error al crear preforma:", err)
      toast.error("Ocurrió un error inesperado al guardar la preforma")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl p-0 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900 flex flex-col max-h-[92vh]">
          {/* HEADER DEL MODAL */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Crear Nueva Preforma de Importación
                </DialogTitle>
                <p className="text-xs text-slate-400">
                  Selecciona artículos del catálogo, define cantidades y exporta a Excel para enviar al proveedor
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* DATOS DE CABECERA */}
            <div className="bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Datos de la Factura / Pedido
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Proveedor / Seller
                  </Label>
                  <select
                    value={proveedorKey}
                    onChange={(e) => handleCambiarProveedorKey(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PROVEEDORES_IMPORTACION_PRECARGADOS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombreCorto}
                      </option>
                    ))}
                    <option value="otro">✍️ Otro proveedor (manual)...</option>
                  </select>

                  {proveedorKey === "otro" && (
                    <Input
                      value={proveedorManual}
                      onChange={(e) => setProveedorManual(e.target.value)}
                      placeholder="Razón social del proveedor..."
                      className="rounded-xl text-xs bg-white dark:bg-slate-900 mt-2"
                      autoFocus
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    N° Factura / Proforma / Ref.
                  </Label>
                  <Input
                    value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    placeholder="Ej: PI-2026-001 o HL2026..."
                    className="rounded-xl text-xs font-mono bg-white dark:bg-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Fecha de Emisión
                  </Label>
                  <Input
                    type="date"
                    value={fechaEmision}
                    onChange={(e) => setFechaEmision(e.target.value)}
                    className="rounded-xl text-xs bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              {/* Ficha resumen de datos fijos del proveedor precargado */}
              {proveedorInfoActual && (
                <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 rounded-2xl text-[11px] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs text-emerald-950 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        {proveedorInfoActual.nombre}
                      </span>
                      {proveedorInfoActual.nombreOriginalFabrica && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 font-medium">
                          Fábrica: <strong className="text-slate-800 dark:text-slate-100">{proveedorInfoActual.nombreOriginalFabrica}</strong>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                        Tax ID: {proveedorInfoActual.taxId}
                      </span>
                      <a
                        href="/admin/listas/proveedores"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 underline flex items-center gap-1 font-bold"
                        title="Ver y editar en /admin/listas/proveedores"
                      >
                        <span>Editar en Proveedores</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                    <div>
                      📍 <span className="text-slate-500">Dirección:</span> {proveedorInfoActual.direccion}, {proveedorInfoActual.provincia}, {proveedorInfoActual.pais}
                    </div>
                    <div>
                      📞 <span className="text-slate-500">Contacto:</span> {proveedorInfoActual.telefono}
                    </div>
                    <div>
                      🏦 <span className="text-slate-500">Banco:</span> {proveedorInfoActual.datosBancarios.bankName} (SWIFT: {proveedorInfoActual.datosBancarios.swift.split(" ")[0]})
                    </div>
                    <div>
                      💳 <span className="text-slate-500">N° Cuenta:</span> {proveedorInfoActual.datosBancarios.accountNumber}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Observaciones / Términos de entrega o empaque
                </Label>
                <Input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Ej: PACKING: STANDARD CARTON PACKING with made in china | PAYMENT TERM: 50% advance..."
                  className="rounded-xl text-xs bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            {/* SECCIÓN DE ARTÍCULOS */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-600" />
                    Artículos del Pedido ({items.length})
                  </h4>
                  <p className="text-xs text-slate-400">
                    Agrega los productos que deseas incluir en este embarque
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {items.length === 0 && articulosDelProveedor.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCargarTodosDelProveedor}
                      className="border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span>Cargar todos de {proveedorInfoActual?.nombre} ({articulosDelProveedor.length})</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    onClick={() => setBuscadorAbierto(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Artículo del Catálogo</span>
                  </Button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center transition-all bg-slate-50/50 dark:bg-slate-800/10">
                  <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Aún no agregaste ningún artículo a la preforma
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Puedes buscarlos individualmente con el buscador instantáneo o cargar en 1 clic los artículos ya asociados a este proveedor.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    {articulosDelProveedor.length > 0 && (
                      <Button
                        type="button"
                        onClick={handleCargarTodosDelProveedor}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm"
                      >
                        <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                        <span>Cargar todos los {articulosDelProveedor.length} artículos vinculados de {proveedorInfoActual?.nombre}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBuscadorAbierto(true)}
                      className="rounded-xl text-xs font-bold flex items-center gap-2 border-slate-300 dark:border-slate-700"
                    >
                      <Plus className="w-4 h-4 text-emerald-600" />
                      <span>Abrir Buscador Manual</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Supplier Item No.</th>
                          <th className="py-2.5 px-3">Artículo / Descripción</th>
                          <th className="py-2.5 px-3 text-center">Stock Actual</th>
                          <th className="py-2.5 px-3 text-center w-28">Cantidad (Pcs)</th>
                          <th className="py-2.5 px-3 text-right w-28">Precio USD</th>
                          <th className="py-2.5 px-3 text-right w-28">Total USD</th>
                          <th className="py-2.5 px-3 text-center w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.map((it, idx) => {
                          const cant = it.cantidad || 0
                          const pUnit = it.precioUnitarioUsd || 0
                          const total = cant * pUnit

                          return (
                            <tr
                              key={it.articuloId}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                            >
                              <td className="py-2.5 px-3 text-slate-400 font-mono">
                                {idx + 1}
                              </td>

                              {/* Supplier Item No editable */}
                              <td className="py-2.5 px-3">
                                <input
                                  type="text"
                                  value={it.supplierItemNo || ""}
                                  onChange={(e) => handleCambiarSupplierNo(idx, e.target.value)}
                                  className="w-32 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  placeholder="Código..."
                                />
                              </td>

                              {/* Nombre del artículo */}
                              <td className="py-2.5 px-3 max-w-sm">
                                <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {it.articuloNombre}
                                </p>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  ID Local: {it.articuloId}
                                </span>
                              </td>

                              {/* Stock Actual */}
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                                    it.articuloStock <= 0
                                      ? "bg-red-50 text-red-600 dark:bg-red-900/20"
                                      : it.articuloStock <= 5
                                      ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20"
                                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20"
                                  }`}
                                >
                                  {it.articuloStock}
                                </span>
                              </td>

                              {/* Cantidad editable */}
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  value={it.cantidad}
                                  onChange={(e) => handleCambiarCantidad(idx, e.target.value)}
                                  className="w-24 text-center px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>

                              {/* Precio Unitario USD editable */}
                              <td className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={it.precioUnitarioUsd || ""}
                                  onChange={(e) => handleCambiarPrecioUnitario(idx, e.target.value)}
                                  placeholder="0.00"
                                  className="w-24 text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </td>

                              {/* Total USD */}
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                                ${total.toFixed(2)}
                              </td>

                              {/* Botón quitar */}
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleQuitarItem(idx)}
                                  className="text-slate-400 hover:text-rose-500 p-1"
                                  title="Quitar artículo"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen al pie de la tabla */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 text-xs font-bold">
                    <span className="text-slate-500">
                      Total Artículos: {totalArticulos}
                    </span>
                    <div className="flex items-center gap-6">
                      <span className="text-slate-700 dark:text-slate-200">
                        Total Unidades:{" "}
                        <span className="text-sky-600 dark:text-sky-400 font-extrabold font-mono">
                          {totalUnidades.toLocaleString("es-AR")}
                        </span>
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400 text-sm">
                        Total FOB:{" "}
                        <span className="font-black font-mono">
                          ${totalFobUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER DEL MODAL */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              {items.length > 0 && (
                <span>
                  Se creará vinculada al 100% con los {items.length} artículos del catálogo.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={guardando}
                onClick={() => onOpenChange(false)}
                className="text-xs font-bold text-slate-500"
              >
                Cancelar
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={guardando || items.length === 0}
                onClick={() => handleGuardar(true)}
                className="text-xs font-bold rounded-xl border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-1.5"
              >
                {guardando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Guardar y Descargar Excel</span>
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={guardando || items.length === 0}
                onClick={() => handleGuardar(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl px-5 shadow-sm"
              >
                {guardando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Creando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Crear Preforma
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Buscador de artículos tipo mostrador que reutilizamos */}
      <BuscadorArticulosImportacionModal
        open={buscadorAbierto}
        onOpenChange={setBuscadorAbierto}
        itemParaVincular={{
          id: "nuevo-borrador",
          supplierItemNo: "",
          cantidad: 100,
        }}
        articulos={articulosCatalogo}
        cargandoArticulos={cargandoCatalogo}
        filtroProveedorId={proveedorKey !== "otro" ? proveedorKey : null}
        filtroProveedorNombre={proveedorInfoActual?.nombreCorto || proveedorInfoActual?.nombre || null}
        onSelectArticulo={(art) => {
          handleSeleccionarArticulo(art)
          setBuscadorAbierto(false)
        }}
      />
    </>
  )
}
