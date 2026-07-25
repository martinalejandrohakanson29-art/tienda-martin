"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCcw,
  PackageCheck,
  ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  obtenerSesionesConteo,
  obtenerDetalleSesionConteo,
  actualizarEntradaConteo,
  eliminarEntradaConteo,
  aplicarConteoStock,
  eliminarSesionConteo,
} from "@/app/actions/control-stock"

interface SesionLite {
  id: string
  proveedorNombre: string
  estado: string
  iniciadoPor: string
  createdAt: Date
  finalizadoAt: Date | null
  totalArticulos: number
  totalEntradas: number
}

interface EntradaDetalle {
  id: string
  cantidad: number
  comentario: string | null
  contadoPor: string
  createdAt: Date
}

interface ArticuloDetalle {
  articulo: { id: string; nombre: string; stock: number; codigoProveedor: string | null }
  entradas: EntradaDetalle[]
}

interface SesionDetalle {
  id: string
  estado: string
  iniciadoPor: string
  createdAt: Date
  finalizadoAt: Date | null
  proveedorNombre: string
  articulos: ArticuloDetalle[]
}

function fmtFecha(fecha: Date | string) {
  return new Date(fecha).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function estadoBadge(estado: string): { label: string; variant: "default" | "secondary" | "outline" } {
  if (estado === "FINALIZADA") return { label: "Aplicado", variant: "secondary" }
  if (estado === "COMPLETADO") return { label: "Completado", variant: "outline" }
  return { label: "En progreso", variant: "default" }
}

type DiffFiltro = "TODAS" | "FAVOR" | "CONTRA"
type SortKey = "nombre" | "stock" | "total" | "diferencia"
type SortDir = "asc" | "desc"

export function ControlStockResultadosClient({ sesionesIniciales }: { sesionesIniciales: SesionLite[] }) {
  const [sesiones, setSesiones] = useState<SesionLite[]>(sesionesIniciales)
  const [filtro, setFiltro] = useState<"PENDIENTES" | "FINALIZADA" | "TODAS">("PENDIENTES")
  const [cargandoLista, setCargandoLista] = useState(false)

  const [sesionActual, setSesionActual] = useState<SesionDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const [busquedaArticulo, setBusquedaArticulo] = useState("")
  const [diffFiltro, setDiffFiltro] = useState<DiffFiltro>("TODAS")
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "nombre", dir: "asc" })

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editCantidad, setEditCantidad] = useState(0)
  const [editComentario, setEditComentario] = useState("")
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const [confirmAplicarOpen, setConfirmAplicarOpen] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [sesionAEliminar, setSesionAEliminar] = useState<{ id: string; proveedorNombre: string } | null>(null)
  const [eliminandoSesion, setEliminandoSesion] = useState(false)

  const sesionesFiltradas = sesiones.filter((s) => {
    if (filtro === "TODAS") return true
    if (filtro === "PENDIENTES") return s.estado !== "FINALIZADA"
    return s.estado === filtro
  })

  async function refrescarLista() {
    setCargandoLista(true)
    const res = await obtenerSesionesConteo()
    if (res.success) setSesiones(res.data!)
    setCargandoLista(false)
  }

  async function abrirDetalle(sesionId: string) {
    setCargandoDetalle(sesionId)
    const res = await obtenerDetalleSesionConteo(sesionId)
    setCargandoDetalle(null)
    if (!res.success || !res.data) {
      alert(res.error || "No se pudo cargar el conteo.")
      return
    }
    setSesionActual(res.data as SesionDetalle)
  }

  function cerrarDetalle() {
    setSesionActual(null)
    setEditandoId(null)
    setExpandidos(new Set())
    setBusquedaArticulo("")
    setDiffFiltro("TODAS")
    setSort({ key: "nombre", dir: "asc" })
    refrescarLista()
  }

  function ordenarPor(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))
  }

  function iconoOrden(key: SortKey) {
    if (sort.key !== key) return <ChevronsUpDown className="h-3 w-3 text-slate-300" />
    return sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  function toggleExpandido(articuloId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(articuloId)) next.delete(articuloId)
      else next.add(articuloId)
      return next
    })
  }

  function iniciarEdicion(e: EntradaDetalle) {
    setEditandoId(e.id)
    setEditCantidad(e.cantidad)
    setEditComentario(e.comentario || "")
  }

  async function guardarEdicion(entradaId: string) {
    setGuardandoEdicion(true)
    const res = await actualizarEntradaConteo({
      entradaId,
      cantidad: editCantidad,
      comentario: editComentario,
    })
    setGuardandoEdicion(false)
    if (!res.success) {
      alert(res.error || "No se pudo actualizar el conteo.")
      return
    }
    setEditandoId(null)
    if (sesionActual) abrirDetalle(sesionActual.id)
  }

  async function borrarEntrada(entradaId: string) {
    if (!confirm("¿Eliminar este registro de conteo?")) return
    setEliminandoId(entradaId)
    const res = await eliminarEntradaConteo(entradaId)
    setEliminandoId(null)
    if (!res.success) {
      alert(res.error || "No se pudo eliminar el conteo.")
      return
    }
    if (sesionActual) abrirDetalle(sesionActual.id)
  }

  async function confirmarAplicar() {
    if (!sesionActual) return
    setAplicando(true)
    const res = await aplicarConteoStock(sesionActual.id)
    setAplicando(false)
    setConfirmAplicarOpen(false)
    if (!res.success) {
      alert(res.error || "No se pudo aplicar el control de stock.")
      return
    }
    setMensaje(`Stock actualizado en ${res.data?.articulosActualizados ?? 0} artículo(s).`)
    abrirDetalle(sesionActual.id)
    setTimeout(() => setMensaje(null), 3000)
  }

  async function confirmarEliminarSesion() {
    if (!sesionAEliminar) return
    setEliminandoSesion(true)
    const res = await eliminarSesionConteo(sesionAEliminar.id)
    setEliminandoSesion(false)
    if (!res.success) {
      alert(res.error || "No se pudo eliminar el conteo.")
      return
    }
    const eraElAbierto = sesionActual?.id === sesionAEliminar.id
    setSesionAEliminar(null)
    if (eraElAbierto) setSesionActual(null)
    refrescarLista()
  }

  const esFinalizada = sesionActual?.estado === "FINALIZADA"

  const articulosConDatos = sesionActual
    ? sesionActual.articulos.map(({ articulo, entradas }) => {
        const total = entradas.reduce((acc, e) => acc + e.cantidad, 0)
        const diferencia = total - articulo.stock
        return { articulo, entradas, total, diferencia }
      })
    : []

  const articulosConDiferencia = articulosConDatos.filter((a) => a.diferencia !== 0).length

  const diffStats = articulosConDatos.reduce(
    (acc, { diferencia }) => {
      if (diferencia > 0) {
        acc.favorCount++
        acc.favorTotal += diferencia
      } else if (diferencia < 0) {
        acc.contraCount++
        acc.contraTotal += diferencia
      }
      return acc
    },
    { favorCount: 0, favorTotal: 0, contraCount: 0, contraTotal: 0 }
  )

  const articulosFiltrados = articulosConDatos.filter(({ articulo, diferencia }) => {
    if (diffFiltro === "FAVOR" && diferencia <= 0) return false
    if (diffFiltro === "CONTRA" && diferencia >= 0) return false
    const q = busquedaArticulo.trim().toLowerCase()
    if (q) {
      const matchNombre = articulo.nombre.toLowerCase().includes(q)
      const matchCodigo = (articulo.codigoProveedor || "").toLowerCase().includes(q)
      if (!matchNombre && !matchCodigo) return false
    }
    return true
  })

  const articulosOrdenados = [...articulosFiltrados].sort((a, b) => {
    let cmp = 0
    if (sort.key === "nombre") cmp = a.articulo.nombre.localeCompare(b.articulo.nombre)
    else if (sort.key === "stock") cmp = a.articulo.stock - b.articulo.stock
    else if (sort.key === "total") cmp = a.total - b.total
    else cmp = a.diferencia - b.diferencia
    return sort.dir === "asc" ? cmp : -cmp
  })

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#101922]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {mensaje && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg">
            {mensaje}
          </div>
        )}

        {!sesionActual && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <ClipboardList className="h-7 w-7 text-[#2b8cee]" />
                  Control de Stock
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Revisá los conteos físicos, corregí lo que haga falta y aplicalos al stock real.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/admin/erp/control-stock">
                  <Button variant="outline" size="sm">Ir a Conteo de Stock</Button>
                </Link>
                <Button variant="outline" size="sm" onClick={refrescarLista} disabled={cargandoLista}>
                  {cargandoLista ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              {(["PENDIENTES", "FINALIZADA", "TODAS"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filtro === f
                      ? "bg-[#2b8cee] text-white border-[#2b8cee]"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {f === "PENDIENTES" ? "Pendientes" : f === "FINALIZADA" ? "Aplicados" : "Todos"}
                </button>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Artículos</TableHead>
                    <TableHead>Iniciado por</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sesionesFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                        No hay conteos para mostrar.
                      </TableCell>
                    </TableRow>
                  )}
                  {sesionesFiltradas.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.proveedorNombre}</TableCell>
                      <TableCell>
                        <Badge variant={estadoBadge(s.estado).variant}>{estadoBadge(s.estado).label}</Badge>
                      </TableCell>
                      <TableCell>{s.totalArticulos} ({s.totalEntradas} registros)</TableCell>
                      <TableCell>{s.iniciadoPor}</TableCell>
                      <TableCell>{fmtFecha(s.finalizadoAt || s.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => abrirDetalle(s.id)} disabled={cargandoDetalle === s.id}>
                            {cargandoDetalle === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver"}
                          </Button>
                          {s.estado !== "FINALIZADA" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9"
                              onClick={() => setSesionAEliminar({ id: s.id, proveedorNombre: s.proveedorNombre })}
                              title="Eliminar conteo"
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {sesionActual && (
          <div className="space-y-4">
            <button
              onClick={cerrarDetalle}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-[#2b8cee]"
            >
              <ChevronLeft className="h-4 w-4" /> Volver al listado
            </button>

            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{sesionActual.proveedorNombre}</h1>
                  <Badge variant={estadoBadge(sesionActual.estado).variant}>
                    {esFinalizada ? "Aplicado al stock" : estadoBadge(sesionActual.estado).label}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Iniciado por {sesionActual.iniciadoPor} · {fmtFecha(sesionActual.createdAt)}
                  {esFinalizada && sesionActual.finalizadoAt && (
                    <> · Aplicado {fmtFecha(sesionActual.finalizadoAt)}</>
                  )}
                  {" · "}
                  {sesionActual.articulos.length} artículo(s)
                  {articulosConDiferencia > 0 && (
                    <span className="text-amber-600 dark:text-amber-500 font-medium">
                      {" "}· {articulosConDiferencia} con diferencia vs. sistema
                    </span>
                  )}
                </p>
              </div>

              {!esFinalizada && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSesionAEliminar({ id: sesionActual.id, proveedorNombre: sesionActual.proveedorNombre })}
                    className="h-10 rounded-lg font-semibold text-rose-600 hover:text-rose-700 gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar conteo
                  </Button>
                  {sesionActual.articulos.length > 0 && (
                    <Button
                      onClick={() => setConfirmAplicarOpen(true)}
                      className="h-10 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 gap-2"
                    >
                      <PackageCheck className="h-4 w-4" />
                      Aplicar conteo al stock real
                    </Button>
                  )}
                </div>
              )}
            </div>

            {sesionActual.articulos.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-12">Este conteo todavía no tiene artículos cargados.</p>
            )}

            {sesionActual.articulos.length > 0 && (
              <>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">A favor</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {diffStats.favorCount} art. (+{diffStats.favorTotal} u.)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">En contra</span>
                    <span className="text-sm font-bold text-rose-700 dark:text-rose-400">
                      {diffStats.contraCount} art. ({diffStats.contraTotal} u.)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    placeholder="Buscar artículo o código..."
                    value={busquedaArticulo}
                    onChange={(e) => setBusquedaArticulo(e.target.value)}
                    className="max-w-xs h-9"
                  />
                  <div className="flex gap-2">
                    {(["TODAS", "FAVOR", "CONTRA"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setDiffFiltro(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          diffFiltro === f
                            ? "bg-[#2b8cee] text-white border-[#2b8cee]"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        {f === "TODAS" ? "Todas" : f === "FAVOR" ? "A favor" : "En contra"}
                      </button>
                    ))}
                  </div>
                </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => ordenarPor("nombre")}>
                        <span className="inline-flex items-center gap-1">Artículo {iconoOrden("nombre")}</span>
                      </TableHead>
                      <TableHead className="w-[12%] cursor-pointer select-none" onClick={() => ordenarPor("stock")}>
                        <span className="inline-flex items-center gap-1">Stock sistema {iconoOrden("stock")}</span>
                      </TableHead>
                      <TableHead className="w-[12%] text-right cursor-pointer select-none" onClick={() => ordenarPor("total")}>
                        <span className="inline-flex items-center justify-end gap-1">Total contado {iconoOrden("total")}</span>
                      </TableHead>
                      <TableHead className="w-[12%] text-right cursor-pointer select-none" onClick={() => ordenarPor("diferencia")}>
                        <span className="inline-flex items-center justify-end gap-1">Diferencia {iconoOrden("diferencia")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articulosOrdenados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                          No se encontraron artículos con esos filtros.
                        </TableCell>
                      </TableRow>
                    )}
                    {articulosOrdenados.map(({ articulo, entradas, total, diferencia }) => {
                      const expandido = expandidos.has(articulo.id)
                      return (
                        <Fragment key={articulo.id}>
                          <TableRow
                            onClick={() => toggleExpandido(articulo.id)}
                            className="cursor-pointer"
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {expandido ? (
                                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                                )}
                                <div>
                                  {articulo.nombre}
                                  {articulo.codigoProveedor && (
                                    <p className="text-xs text-slate-400 font-normal mt-0.5">{articulo.codigoProveedor}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-500">{articulo.stock}</TableCell>
                            <TableCell className="text-right font-bold text-slate-900 dark:text-white">{total} u.</TableCell>
                            <TableCell className="text-right">
                              {diferencia !== 0 ? (
                                <span className={`font-semibold ${diferencia > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {diferencia > 0 ? "+" : ""}{diferencia}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {expandido && (
                            <TableRow>
                              <TableCell colSpan={4} className="bg-slate-50 dark:bg-slate-950/40 py-3">
                                <div className="space-y-1.5 pl-6">
                                  {entradas.map((e) => (
                                    <div
                                      key={e.id}
                                      className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-800"
                                    >
                                      {editandoId === e.id ? (
                                        <>
                                          <Input
                                            type="number"
                                            inputMode="numeric"
                                            value={editCantidad}
                                            onChange={(ev) => setEditCantidad(Math.max(0, Number(ev.target.value) || 0))}
                                            onClick={(ev) => ev.stopPropagation()}
                                            className="h-8 w-20"
                                          />
                                          <Input
                                            value={editComentario}
                                            onChange={(ev) => setEditComentario(ev.target.value)}
                                            onClick={(ev) => ev.stopPropagation()}
                                            placeholder="Comentario"
                                            className="h-8 flex-1 max-w-xs"
                                          />
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            onClick={(ev) => { ev.stopPropagation(); guardarEdicion(e.id) }}
                                            disabled={guardandoEdicion}
                                          >
                                            {guardandoEdicion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-emerald-600" />}
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            onClick={(ev) => { ev.stopPropagation(); setEditandoId(null) }}
                                            disabled={guardandoEdicion}
                                          >
                                            <X className="h-4 w-4 text-slate-400" />
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-semibold text-slate-700 dark:text-slate-200 w-12 shrink-0">{e.cantidad} u.</span>
                                          <span className="flex-1 text-slate-500 dark:text-slate-400 truncate">
                                            {e.comentario || "—"} · {e.contadoPor}
                                          </span>
                                          {!esFinalizada && (
                                            <>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 shrink-0"
                                                onClick={(ev) => { ev.stopPropagation(); iniciarEdicion(e) }}
                                              >
                                                <Pencil className="h-3.5 w-3.5 text-slate-400" />
                                              </Button>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 shrink-0"
                                                onClick={(ev) => { ev.stopPropagation(); borrarEntrada(e.id) }}
                                                disabled={eliminandoId === e.id}
                                              >
                                                {eliminandoId === e.id ? (
                                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                                                )}
                                              </Button>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmAplicarOpen}
          onOpenChange={setConfirmAplicarOpen}
          title="Aplicar conteo al stock real"
          description={`Se actualizará el stock de ${sesionActual?.articulos.length ?? 0} artículo(s) según lo contado y quedará registrado en la auditoría de cada artículo. Esta acción no se puede deshacer.`}
          confirmLabel="Aplicar"
          onConfirm={confirmarAplicar}
          isLoading={aplicando}
        />

        <ConfirmDialog
          open={sesionAEliminar !== null}
          onOpenChange={(open) => { if (!open) setSesionAEliminar(null) }}
          title="Eliminar conteo"
          description={`Se va a eliminar por completo el conteo de "${sesionAEliminar?.proveedorNombre ?? ""}" junto con todos sus registros cargados. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={confirmarEliminarSesion}
          isLoading={eliminandoSesion}
        />
      </div>
    </div>
  )
}
