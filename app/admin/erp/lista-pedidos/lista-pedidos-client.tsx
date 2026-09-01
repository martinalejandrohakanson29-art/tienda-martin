"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import {
  Search,
  Plus,
  CheckCircle2,
  Clock,
  Package,
  Loader2,
  Trash2,
  ChevronLeft,
} from "lucide-react"
import Link from "next/link"
import {
  crearFaltante,
  finalizarFaltante,
  eliminarFaltante,
  obtenerFaltantes,
  obtenerArticulosParaFaltantes,
  obtenerProveedoresParaFaltantes,
} from "@/app/actions/articulos-faltantes"

type Faltante = {
  id: string
  articuloId: string
  articuloNombre: string
  stockActual: number
  cantidadEstimada: number
  prioridad: string
  proveedorId: string | null
  proveedorNombre: string | null
  creadoPor: string
  finalizado: boolean
  finalizadoAt: string | null
  finalizadoPor: string | null
  createdAt: string
}

type ArticuloSimple = {
  id: string
  nombre: string
  stock: number
  codigoProveedor?: string | null
  proveedorId?: string | null
}

type ProveedorSimple = {
  id: string
  nombre: string
}

const PRIORIDADES = [
  { value: "alta",  label: "Alta",  cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
  { value: "media", label: "Media", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
  { value: "baja",  label: "Baja",  cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
]

const badgePrioridad = (p: string) =>
  PRIORIDADES.find((x) => x.value === p) ?? PRIORIDADES[1]

interface ListaPedidosClientProps {
  faltantesIniciales: Faltante[]
  usuarioNombre: string
}

const quitarAcentos = (texto: string) =>
  texto ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const idCorto = (id: string) => id.slice(-6).toUpperCase()

export function ListaPedidosClient({
  faltantesIniciales,
  usuarioNombre,
}: ListaPedidosClientProps) {
  const [faltantes, setFaltantes] = useState<Faltante[]>(faltantesIniciales)
  const [tab, setTab] = useState<"pendientes" | "finalizados">("pendientes")

  // Modal de nuevo faltante
  const [modalOpen, setModalOpen] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [articuloSeleccionado, setArticuloSeleccionado] = useState<ArticuloSimple | null>(null)
  const [cantidad, setCantidad] = useState("")
  const [prioridad, setPrioridad] = useState("media")
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<ProveedorSimple | null>(null)
  const [busquedaProv, setBusquedaProv] = useState("")
  const [guardando, setGuardando] = useState(false)

  // Artículos y proveedores: se cargan lazily la primera vez que se abre el modal
  const [articulos, setArticulos] = useState<ArticuloSimple[]>([])
  const [cargandoArticulos, setCargandoArticulos] = useState(false)
  const articulosCargados = useRef(false)
  const [proveedores, setProveedores] = useState<ProveedorSimple[]>([])
  const proveedoresCargados = useRef(false)

  // Confirmaciones
  const [finalizarId, setFinalizarId] = useState<string | null>(null)
  const [eliminarId, setEliminarId] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)

  const articulosFiltrados = useMemo(() => {
    const term = quitarAcentos(busqueda).trim()
    if (!term) return articulos.slice(0, 10)
    const words = term.split(/\s+/).filter(Boolean)
    return articulos
      .filter((a) => {
        const nombre = quitarAcentos(a.nombre)
        const id = quitarAcentos(a.id)
        const codProv = a.codigoProveedor ? quitarAcentos(a.codigoProveedor) : ""
        return words.every((w) => nombre.includes(w) || id.includes(w) || codProv.includes(w))
      })
      .slice(0, 30)
  }, [busqueda, articulos])

  const proveedoresFiltrados = useMemo(() => {
    const term = quitarAcentos(busquedaProv).trim()
    if (!term) return proveedores.slice(0, 8)
    const words = term.split(/\s+/).filter(Boolean)
    return proveedores
      .filter((p) => {
        const nombre = quitarAcentos(p.nombre)
        return words.every((w) => nombre.includes(w))
      })
      .slice(0, 15)
  }, [busquedaProv, proveedores])

  const abrirModal = async () => {
    setModalOpen(true)
    if (!articulosCargados.current) {
      setCargandoArticulos(true)
      const [arts, provs] = await Promise.all([
        obtenerArticulosParaFaltantes(),
        obtenerProveedoresParaFaltantes(),
      ])
      setArticulos(arts)
      setProveedores(provs)
      articulosCargados.current = true
      proveedoresCargados.current = true
      setCargandoArticulos(false)
    }
  }

  const faltantesFiltrados = useMemo(
    () => faltantes.filter((f) => (tab === "pendientes" ? !f.finalizado : f.finalizado)),
    [faltantes, tab]
  )

  const recargar = async () => {
    const data = await obtenerFaltantes(false)
    setFaltantes(data)
  }

  const handleGuardar = async () => {
    if (!articuloSeleccionado) {
      toast.error("Seleccioná un artículo")
      return
    }
    const cant = parseInt(cantidad)
    if (!cant || cant <= 0) {
      toast.error("Ingresá una cantidad válida")
      return
    }

    setGuardando(true)
    const res = await crearFaltante({
      articuloId: articuloSeleccionado.id,
      cantidadEstimada: cant,
      prioridad,
      proveedorId: proveedorSeleccionado?.id ?? null,
      creadoPor: usuarioNombre,
    })
    setGuardando(false)

    if (res.success) {
      toast.success("Artículo agregado a la lista")
      setModalOpen(false)
      setBusqueda("")
      setBusquedaProv("")
      setArticuloSeleccionado(null)
      setProveedorSeleccionado(null)
      setCantidad("")
      setPrioridad("media")
      await recargar()
    } else {
      toast.error(res.error ?? "Error al guardar")
    }
  }

  const handleFinalizar = async () => {
    if (!finalizarId) return
    setProcesando(true)
    const res = await finalizarFaltante(finalizarId, usuarioNombre)
    setProcesando(false)
    setFinalizarId(null)
    if (res.success) {
      toast.success("Pedido marcado como finalizado")
      await recargar()
    } else {
      toast.error(res.error ?? "Error al finalizar")
    }
  }

  const handleEliminar = async () => {
    if (!eliminarId) return
    setProcesando(true)
    const res = await eliminarFaltante(eliminarId)
    setProcesando(false)
    setEliminarId(null)
    if (res.success) {
      toast.success("Registro eliminado")
      await recargar()
    } else {
      toast.error(res.error ?? "Error al eliminar")
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/erp"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Artículos Faltantes
              </h1>
              <p className="text-xs text-slate-500">
                {faltantes.filter((f) => !f.finalizado).length} pendiente
                {faltantes.filter((f) => !f.finalizado).length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            onClick={abrirModal}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar faltante
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("pendientes")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "pendientes"
                ? "bg-orange-500 text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            Pendientes
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                tab === "pendientes"
                  ? "bg-orange-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {faltantes.filter((f) => !f.finalizado).length}
            </span>
          </button>
          <button
            onClick={() => setTab("finalizados")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "finalizados"
                ? "bg-emerald-500 text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Finalizados
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                tab === "finalizados"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {faltantes.filter((f) => f.finalizado).length}
            </span>
          </button>
        </div>

        {/* Tabla */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {faltantesFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {tab === "pendientes"
                  ? "No hay artículos pendientes"
                  : "No hay artículos finalizados"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-24">
                    ID
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Artículo
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Fecha
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                    Cant. a pedir
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                    Stock actual
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                    Prioridad
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Proveedor
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Cargado por
                  </TableHead>
                  {tab === "finalizados" && (
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Finalizado por
                    </TableHead>
                  )}
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {faltantesFiltrados.map((f) => (
                  <TableRow
                    key={f.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <TableCell>
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded">
                        #{idCorto(f.articuloId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {f.articuloNombre}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">{formatFecha(f.createdAt)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold text-sm">
                        {f.cantidadEstimada}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm ${
                          f.stockActual <= 0
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            : f.stockActual <= 3
                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                            : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {f.stockActual}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const p = badgePrioridad(f.prioridad)
                        return (
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${p.cls}`}>
                            {p.label}
                          </span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">
                        {f.proveedorNombre ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">{f.creadoPor}</span>
                    </TableCell>
                    {tab === "finalizados" && (
                      <TableCell>
                        <div>
                          <span className="text-sm text-slate-500">{f.finalizadoPor}</span>
                          {f.finalizadoAt && (
                            <p className="text-xs text-slate-400">{formatFecha(f.finalizadoAt)}</p>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        {!f.finalizado && (
                          <Button
                            size="sm"
                            onClick={() => setFinalizarId(f.id)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 h-8 px-3 text-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Finalizar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEliminarId(f.id)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Modal: nuevo faltante */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) { setBusqueda(""); setBusquedaProv(""); setArticuloSeleccionado(null); setProveedorSeleccionado(null); setCantidad(""); setPrioridad("media") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar artículo faltante</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Buscador de artículo */}
            <div className="space-y-1.5">
              <Label>Artículo</Label>
              {articuloSeleccionado ? (
                <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {articuloSeleccionado.nombre}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      {articuloSeleccionado.codigoProveedor && (
                        <span className="font-mono bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded font-medium">
                          Cód: {articuloSeleccionado.codigoProveedor}
                        </span>
                      )}
                      <span>Stock actual: {articuloSeleccionado.stock}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setArticuloSeleccionado(null); setBusqueda("") }}
                    className="text-xs text-slate-400 hover:text-slate-600 underline ml-2 shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  {cargandoArticulos ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando artículos...
                    </div>
                  ) : (
                    <>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Buscar por nombre, código o ID..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="pl-9"
                        autoFocus
                      />
                      {busqueda.trim() && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {articulosFiltrados.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-slate-400">Sin resultados</p>
                          ) : (
                            articulosFiltrados.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                  setArticuloSeleccionado(a)
                                  if (a.proveedorId && !proveedorSeleccionado) {
                                    const prov = proveedores.find((p) => p.id === a.proveedorId)
                                    if (prov) setProveedorSeleccionado(prov)
                                  }
                                  setBusqueda("")
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0"
                              >
                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                  {a.nombre}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                                  {a.codigoProveedor && (
                                    <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
                                      Cód: {a.codigoProveedor}
                                    </span>
                                  )}
                                  <span>Stock: {a.stock}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Cantidad */}
            <div className="space-y-1.5">
              <Label htmlFor="cantidad">Cantidad estimada a pedir</Label>
              <Input
                id="cantidad"
                type="number"
                min={1}
                placeholder="Ej: 10"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>

            {/* Prioridad */}
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <div className="flex gap-2">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPrioridad(p.value)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                      prioridad === p.value
                        ? `${p.cls} border-current`
                        : "border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Proveedor (opcional) */}
            <div className="space-y-1.5">
              <Label>Proveedor <span className="text-slate-400 font-normal">(opcional)</span></Label>
              {proveedorSeleccionado ? (
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {proveedorSeleccionado.nombre}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setProveedorSeleccionado(null); setBusquedaProv("") }}
                    className="text-xs text-slate-400 hover:text-slate-600 underline ml-2 shrink-0"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar proveedor..."
                    value={busquedaProv}
                    onChange={(e) => setBusquedaProv(e.target.value)}
                    className="pl-9"
                    disabled={cargandoArticulos}
                  />
                  {busquedaProv.trim() && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {proveedoresFiltrados.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-slate-400">Sin resultados</p>
                      ) : (
                        proveedoresFiltrados.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setProveedorSeleccionado(p); setBusquedaProv("") }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm text-slate-900 dark:text-white"
                          >
                            {p.nombre}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGuardar}
              disabled={guardando || !articuloSeleccionado || !cantidad}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: finalizar */}
      <ConfirmDialog
        open={!!finalizarId}
        onOpenChange={(o) => { if (!o) setFinalizarId(null) }}
        title="¿Finalizar pedido?"
        description="Esto marca el artículo como ya pedido. Podés verlo en la pestaña Finalizados."
        confirmLabel="Sí, finalizar"
        onConfirm={handleFinalizar}
        isLoading={procesando}
      />

      {/* Confirm: eliminar */}
      <ConfirmDialog
        open={!!eliminarId}
        onOpenChange={(o) => { if (!o) setEliminarId(null) }}
        title="¿Eliminar registro?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleEliminar}
        isLoading={procesando}
        variant="danger"
      />
    </div>
  )
}
