"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Search,
  ChevronLeft,
  Loader2,
  Minus,
  Plus,
  Package,
  CheckCircle2,
  Check,
  ArrowRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  iniciarSesionControlStock,
  obtenerArticulosPorProveedor,
  registrarConteoStock,
  obtenerEntradasSesion,
  actualizarEntradaConteo,
  eliminarEntradaConteo,
} from "@/app/actions/control-stock"

interface ProveedorLite {
  id: string
  nombre: string
}

interface ArticuloLite {
  id: string
  nombre: string
  codigoProveedor: string | null
}

interface EntradaLite {
  id: string
  articuloId: string
  cantidad: number
  comentario: string | null
  createdAt: string | Date
}

const quitarAcentos = (texto: string) => {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function coincide(nombre: string, busqueda: string) {
  const palabras = quitarAcentos(busqueda.toLowerCase()).trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const nombreNormalizado = quitarAcentos(nombre.toLowerCase())
  return palabras.every((p) => nombreNormalizado.includes(p))
}

function agruparPorArticulo(entradas: EntradaLite[]) {
  const mapa: Record<string, EntradaLite[]> = {}
  for (const e of entradas) {
    if (!mapa[e.articuloId]) mapa[e.articuloId] = []
    mapa[e.articuloId].push(e)
  }
  return mapa
}

type Paso = "proveedor" | "articulo" | "conteo"

export function ControlStockClient({ proveedoresIniciales }: { proveedoresIniciales: ProveedorLite[] }) {
  const [paso, setPaso] = useState<Paso>("proveedor")

  const [busquedaProveedor, setBusquedaProveedor] = useState("")
  const [proveedor, setProveedor] = useState<ProveedorLite | null>(null)
  const [sesionId, setSesionId] = useState<string | null>(null)
  const [cargandoProveedor, setCargandoProveedor] = useState<string | null>(null)

  const [articulos, setArticulos] = useState<ArticuloLite[]>([])
  const [busquedaArticulo, setBusquedaArticulo] = useState("")
  const [articulo, setArticulo] = useState<ArticuloLite | null>(null)

  const [entradasPorArticulo, setEntradasPorArticulo] = useState<Record<string, EntradaLite[]>>({})

  const [cantidad, setCantidad] = useState(0)
  const [comentario, setComentario] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editCantidad, setEditCantidad] = useState(0)
  const [editComentario, setEditComentario] = useState("")
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(null), 2200)
    return () => clearTimeout(t)
  }, [mensaje])

  const proveedoresFiltrados = useMemo(
    () => proveedoresIniciales.filter((p) => coincide(p.nombre, busquedaProveedor)),
    [proveedoresIniciales, busquedaProveedor]
  )

  const articulosFiltrados = useMemo(
    () => articulos.filter((a) => coincide(a.nombre, busquedaArticulo)),
    [articulos, busquedaArticulo]
  )

  const entradasArticulo = articulo ? entradasPorArticulo[articulo.id] || [] : []
  const totalContadoArticulo = entradasArticulo.reduce((acc, e) => acc + e.cantidad, 0)

  async function refrescarEntradas() {
    if (!sesionId) return
    const res = await obtenerEntradasSesion(sesionId)
    if (res.success) setEntradasPorArticulo(agruparPorArticulo(res.data as EntradaLite[]))
  }

  async function seleccionarProveedor(p: ProveedorLite) {
    setCargandoProveedor(p.id)
    const [resSesion, resArticulos] = await Promise.all([
      iniciarSesionControlStock(p.id),
      obtenerArticulosPorProveedor(p.id),
    ])
    setCargandoProveedor(null)

    if (!resSesion.success || !resSesion.data) {
      alert(resSesion.error || "No se pudo iniciar el control de stock.")
      return
    }

    setProveedor(p)
    setSesionId(resSesion.data.sesionId)
    setArticulos(resArticulos.success ? resArticulos.data! : [])
    setEntradasPorArticulo(agruparPorArticulo((resSesion.data.entradas || []) as EntradaLite[]))
    setBusquedaArticulo("")
    setPaso("articulo")
  }

  function seleccionarArticulo(a: ArticuloLite) {
    setArticulo(a)
    setCantidad(0)
    setComentario("")
    setEditandoId(null)
    setPaso("conteo")
  }

  function volverAProveedores() {
    setPaso("proveedor")
    setProveedor(null)
    setSesionId(null)
    setArticulos([])
    setEntradasPorArticulo({})
  }

  function volverAArticulos() {
    setPaso("articulo")
    setArticulo(null)
    setEditandoId(null)
  }

  async function guardarConteo(avanzarAOtroArticulo: boolean) {
    if (!sesionId || !articulo) return
    setGuardando(true)
    const res = await registrarConteoStock({
      sesionId,
      articuloId: articulo.id,
      cantidad,
      comentario,
    })
    setGuardando(false)

    if (!res.success) {
      alert(res.error || "No se pudo registrar el conteo.")
      return
    }

    await refrescarEntradas()

    if (avanzarAOtroArticulo) {
      setMensaje(`Contado: ${articulo.nombre} — ${cantidad} u.`)
      volverAArticulos()
    } else {
      setMensaje(`Guardado: ${cantidad} u.${comentario ? ` (${comentario})` : ""}`)
      setCantidad(0)
      setComentario("")
    }
  }

  function iniciarEdicion(e: EntradaLite) {
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
    await refrescarEntradas()
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
    await refrescarEntradas()
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)] bg-[#f6f7f8] dark:bg-[#101922]">
      {mensaje && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4" />
          {mensaje}
        </div>
      )}

      {paso === "proveedor" && (
        <div className="flex flex-col flex-1">
          <div className="sticky top-14 z-10 bg-[#f6f7f8]/95 dark:bg-[#101922]/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Conteo de Stock</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Elegí el proveedor a controlar</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                value={busquedaProveedor}
                onChange={(e) => setBusquedaProveedor(e.target.value)}
                placeholder="Buscar proveedor..."
                className="pl-10 h-12 rounded-xl bg-white dark:bg-slate-900 text-base"
              />
            </div>
          </div>

          <div className="flex-1 px-4 py-3 space-y-2">
            {proveedoresFiltrados.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-8">No se encontraron proveedores.</p>
            )}
            {proveedoresFiltrados.map((p) => (
              <button
                key={p.id}
                onClick={() => seleccionarProveedor(p)}
                disabled={cargandoProveedor !== null}
                className="w-full flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-4 text-left active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-100">{p.nombre}</span>
                {cargandoProveedor === p.id ? (
                  <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                ) : (
                  <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {paso === "articulo" && proveedor && (
        <div className="flex flex-col flex-1">
          <div className="sticky top-14 z-10 bg-[#f6f7f8]/95 dark:bg-[#101922]/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={volverAProveedores}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-[#2b8cee] mb-2"
            >
              <ChevronLeft className="h-4 w-4" /> Cambiar proveedor
            </button>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{proveedor.nombre}</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                value={busquedaArticulo}
                onChange={(e) => setBusquedaArticulo(e.target.value)}
                placeholder="Buscar artículo..."
                className="pl-10 h-12 rounded-xl bg-white dark:bg-slate-900 text-base"
              />
            </div>
          </div>

          <div className="flex-1 px-4 py-3 space-y-2">
            {articulos.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-8">
                Este proveedor no tiene artículos cargados en Artículos Mostrador.
              </p>
            )}
            {articulos.length > 0 && articulosFiltrados.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-8">No se encontraron artículos.</p>
            )}
            {articulosFiltrados.map((a) => {
              const entradas = entradasPorArticulo[a.id] || []
              const total = entradas.reduce((acc, e) => acc + e.cantidad, 0)
              const yaContado = entradas.length > 0
              return (
                <button
                  key={a.id}
                  onClick={() => seleccionarArticulo(a)}
                  className="w-full flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-4 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    {yaContado ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <Package className="h-5 w-5 text-slate-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{a.nombre}</p>
                      {yaContado && (
                        <p className="text-xs text-emerald-600 font-medium mt-0.5">Contado: {total} u.</p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {paso === "conteo" && articulo && (
        <div className="flex flex-col flex-1 px-4 py-4">
          <button
            onClick={volverAArticulos}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-[#2b8cee] mb-4 self-start"
          >
            <ChevronLeft className="h-4 w-4" /> Otro artículo
          </button>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col items-center text-center mb-4">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-bold mb-1">{proveedor?.nombre}</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{articulo.nombre}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Contado hasta el momento: <span className="font-bold text-slate-700 dark:text-slate-200">{totalContadoArticulo} u.</span>
            </p>
          </div>

          {entradasArticulo.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {entradasArticulo.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2"
                >
                  {editandoId === e.id ? (
                    <>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={editCantidad}
                        onChange={(ev) => setEditCantidad(Math.max(0, Number(ev.target.value) || 0))}
                        className="h-9 w-20"
                      />
                      <Input
                        value={editComentario}
                        onChange={(ev) => setEditComentario(ev.target.value)}
                        placeholder="Comentario"
                        className="h-9 flex-1"
                      />
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => guardarEdicion(e.id)} disabled={guardandoEdicion}>
                        {guardandoEdicion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-emerald-600" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setEditandoId(null)} disabled={guardandoEdicion}>
                        <X className="h-4 w-4 text-slate-400" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 w-12 shrink-0">{e.cantidad} u.</span>
                      <span className="flex-1 text-slate-500 dark:text-slate-400 truncate">{e.comentario || "—"}</span>
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => iniciarEdicion(e)}>
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 shrink-0"
                        onClick={() => borrarEntrada(e.id)}
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
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 mb-2">
            <button
              onClick={() => setCantidad((c) => Math.max(0, c - 1))}
              className="h-16 w-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Minus className="h-7 w-7 text-slate-600 dark:text-slate-300" />
            </button>

            <Input
              type="number"
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
              className="h-16 w-24 text-center text-3xl font-bold rounded-2xl bg-white dark:bg-slate-900"
            />

            <button
              onClick={() => setCantidad((c) => c + 1)}
              className="h-16 w-16 rounded-2xl bg-[#2b8cee] flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="h-7 w-7 text-white" />
            </button>

            <button
              onClick={() => guardarConteo(false)}
              disabled={guardando}
              aria-label="Guardar y cargar otra ubicación"
              className="h-16 w-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/30 active:scale-95 transition-transform disabled:opacity-60"
            >
              {guardando ? (
                <Loader2 className="h-7 w-7 text-white animate-spin" />
              ) : (
                <Check className="h-8 w-8 text-white" strokeWidth={3} />
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400 text-center mb-6">
            El ✓ guarda esta cantidad y queda el mismo artículo para cargar otra ubicación
          </p>

          <div className="mb-6">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">
              Comentario (ej: Cuarto 1, Estante B)
            </label>
            <Input
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ubicación o nota libre..."
              className="h-11 rounded-xl bg-white dark:bg-slate-900"
            />
          </div>

          <div className="mt-auto">
            <div className="flex flex-col gap-2 pb-4">
              <Button
                onClick={() => guardarConteo(true)}
                disabled={guardando}
                className="h-14 rounded-xl text-base font-semibold bg-[#2b8cee] hover:bg-[#2b8cee]/90 gap-2"
              >
                {guardando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Continuar con otro artículo <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </Button>
              <p className="text-xs text-slate-400 text-center px-2">
                Guarda esta cantidad y vuelve al buscador de artículos
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
