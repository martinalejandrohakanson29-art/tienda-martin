"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, ChevronLeft, Loader2, Minus, Plus, Package, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  iniciarSesionControlStock,
  obtenerArticulosPorProveedor,
  registrarConteoStock,
} from "@/app/actions/control-stock"

interface ProveedorLite {
  id: string
  nombre: string
}

interface ArticuloLite {
  id: string
  nombre: string
  stock: number
  codigoProveedor: string | null
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

  const [cantidad, setCantidad] = useState(0)
  const [comentario, setComentario] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

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
    setBusquedaArticulo("")
    setPaso("articulo")
  }

  function seleccionarArticulo(a: ArticuloLite) {
    setArticulo(a)
    setCantidad(0)
    setComentario("")
    setPaso("conteo")
  }

  function volverAProveedores() {
    setPaso("proveedor")
    setProveedor(null)
    setSesionId(null)
    setArticulos([])
  }

  function volverAArticulos() {
    setPaso("articulo")
    setArticulo(null)
  }

  async function guardarConteo(esConteoFinal: boolean) {
    if (!sesionId || !articulo) return
    setGuardando(true)
    const res = await registrarConteoStock({
      sesionId,
      articuloId: articulo.id,
      cantidad,
      comentario,
      esConteoFinal,
    })
    setGuardando(false)

    if (!res.success) {
      alert(res.error || "No se pudo registrar el conteo.")
      return
    }

    if (esConteoFinal) {
      setMensaje(`Contado: ${articulo.nombre} — ${cantidad} u.`)
      volverAArticulos()
    } else {
      setMensaje(`Guardado parcial: ${cantidad} u.${comentario ? ` (${comentario})` : ""}`)
      setCantidad(0)
      setComentario("")
    }
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
            <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Control de Stock</h1>
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
            {articulosFiltrados.map((a) => (
              <button
                key={a.id}
                onClick={() => seleccionarArticulo(a)}
                className="w-full flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{a.nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Stock sistema: {a.stock}</p>
                </div>
                <Package className="h-5 w-5 text-slate-300 shrink-0" />
              </button>
            ))}
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
            <p className="text-sm text-slate-400">Stock en sistema: {articulo.stock}</p>
          </div>

          <div className="flex items-center justify-center gap-4 mb-4">
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
              className="h-16 w-28 text-center text-3xl font-bold rounded-2xl bg-white dark:bg-slate-900"
            />

            <button
              onClick={() => setCantidad((c) => c + 1)}
              className="h-16 w-16 rounded-2xl bg-[#2b8cee] flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="h-7 w-7 text-white" />
            </button>
          </div>

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
                onClick={() => guardarConteo(false)}
                disabled={guardando}
                variant="outline"
                className="h-12 rounded-xl text-base font-semibold border-slate-300 dark:border-slate-700"
              >
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : "Ingreso parcial"}
              </Button>
              <p className="text-xs text-slate-400 text-center px-2">
                Guarda esta cantidad y queda el mismo artículo para cargar otra ubicación
              </p>
            </div>

            <div className="flex items-center gap-3 py-3">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">o bien</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            </div>

            <div className="flex flex-col gap-2 pb-4">
              <Button
                onClick={() => guardarConteo(true)}
                disabled={guardando}
                className="h-14 rounded-xl text-base font-semibold bg-[#2b8cee] hover:bg-[#2b8cee]/90"
              >
                {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : "Finalizar conteo de este artículo"}
              </Button>
              <p className="text-xs text-slate-400 text-center px-2">
                Guarda y pasa a buscar el próximo artículo a contar
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
