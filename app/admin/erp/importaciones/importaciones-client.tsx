"use client"

import React, { useState, useRef, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Swal from "sweetalert2"
import {
  ArrowLeft,
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  X,
  Link2,
  Package,
  Layers,
  DollarSign,
  Building2,
  FileDigit,
} from "lucide-react"
import {
  cargarPreformasAction,
  obtenerPreformasAction,
  cambiarEstadoPreformaAction,
  eliminarPreformaAction,
  vincularItemManualAction,
  buscarArticulosParaVinculacionAction,
} from "@/app/actions/preformas"

export interface PreformaItemView {
  id: string
  supplierItemNo: string
  descripcionOriginal?: string | null
  logo?: string | null
  size?: string | null
  fotoUrl?: string | null
  cantidad: number
  precioUnitarioUsd?: number | null
  precioTotalUsd?: number | null
  articuloId?: string | null
  articuloNombre?: string | null
  articuloStock?: number | null
  articuloCodigoProveedor?: string | null
}

export interface PreformaView {
  id: string
  numero: number
  nombreArchivo: string
  archivoUrl?: string | null
  tipoArchivo?: string | null
  estado: string
  numeroFactura?: string | null
  fechaEmision?: string | null
  proveedor?: string | null
  totalFob?: number | null
  totalArticulos: number
  totalUnidades: number
  vinculados: number
  noVinculados: number
  createdAt: string
  updatedAt: string
  items: PreformaItemView[]
}

export function ImportacionesClient({ initialData }: { initialData: PreformaView[] }) {
  const router = useRouter()
  const [preformas, setPreformas] = useState<PreformaView[]>(initialData)
  const [isPending, startTransition] = useTransition()

  React.useEffect(() => {
    setPreformas(initialData)
  }, [initialData])

  const recargarPreformas = async () => {
    startTransition(async () => {
      const res = await obtenerPreformasAction()
      if (res.success && res.data) {
        setPreformas(res.data)
      }
      router.refresh()
    })
  }

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<"TODAS" | "EN_CURSO" | "FINALIZADO">("TODAS")
  const [busqueda, setBusqueda] = useState("")

  // Subida de archivos
  const [modalSubidaAbierto, setModalSubidaAbierto] = useState(false)
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Detalle de Preforma
  const [preformaSeleccionada, setPreformaSeleccionada] = useState<PreformaView | null>(null)
  const [busquedaItemDetalle, setBusquedaItemDetalle] = useState("")

  // Zoom de Foto
  const [fotoEnZoom, setFotoEnZoom] = useState<{ url: string; titulo: string } | null>(null)

  // Vinculación manual
  const [itemParaVincular, setItemParaVincular] = useState<PreformaItemView | null>(null)
  const [busquedaArticuloManual, setBusquedaArticuloManual] = useState("")
  const [resultadosBusquedaArticulo, setResultadosBusquedaArticulo] = useState<any[]>([])
  const [buscandoArticulos, setBuscandoArticulos] = useState(false)

  // Métricas
  const totalPreformas = preformas.length
  const enCursoCount = preformas.filter((p) => p.estado === "EN_CURSO").length
  const finalizadasCount = preformas.filter((p) => p.estado === "FINALIZADO").length
  const totalUnidadesGlobal = preformas.reduce((acc, p) => acc + p.totalUnidades, 0)
  const totalFobGlobal = preformas.reduce((acc, p) => acc + (p.totalFob || 0), 0)

  // Filtrado de lista
  const preformasFiltradas = preformas.filter((p) => {
    if (filtroEstado !== "TODAS" && p.estado !== filtroEstado) return false
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return (
      p.nombreArchivo.toLowerCase().includes(q) ||
      `preforma #${p.numero}`.toLowerCase().includes(q) ||
      (p.numeroFactura && p.numeroFactura.toLowerCase().includes(q)) ||
      (p.proveedor && p.proveedor.toLowerCase().includes(q)) ||
      p.items.some(
        (it) =>
          it.supplierItemNo.toLowerCase().includes(q) ||
          (it.descripcionOriginal && it.descripcionOriginal.toLowerCase().includes(q)) ||
          (it.articuloNombre && it.articuloNombre.toLowerCase().includes(q)) ||
          (it.articuloId && it.articuloId.toLowerCase().includes(q))
      )
    )
  })

  // Manejador de selección de archivos
  const handleArchivosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = Array.from(e.target.files)
      setArchivosSeleccionados((prev) => [...prev, ...filesArr])
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArr = Array.from(e.dataTransfer.files)
      setArchivosSeleccionados((prev) => [...prev, ...filesArr])
    }
  }

  const removerArchivoSeleccionado = (idx: number) => {
    setArchivosSeleccionados((prev) => prev.filter((_, i) => i !== idx))
  }

  // Procesar subida de preformas
  const handleProcesarSubida = async () => {
    if (archivosSeleccionados.length === 0) {
      toast.error("Por favor selecciona al menos un archivo (Excel, PDF o Imagen).")
      return
    }

    setSubiendo(true)
    const formData = new FormData()
    archivosSeleccionados.forEach((f) => {
      formData.append("files", f)
    })

    try {
      const res = await cargarPreformasAction(formData)
      if (!res.success) {
        toast.error(res.error || "Error al procesar archivos")
        setSubiendo(false)
        return
      }

      toast.success(res.message || "Preformas procesadas exitosamente")
      if (res.data) {
        setPreformas(res.data)
      }
      setArchivosSeleccionados([])
      setModalSubidaAbierto(false)

      startTransition(() => {
        router.refresh()
      })
    } catch (err: any) {
      console.error(err)
      toast.error("Ocurrió un error inesperado al subir los archivos")
    } finally {
      setSubiendo(false)
    }
  }

  // Alternar estado En curso / Finalizado
  const handleToggleEstado = async (preforma: PreformaView) => {
    const nuevoEstado = preforma.estado === "EN_CURSO" ? "FINALIZADO" : "EN_CURSO"

    setPreformas((prev) =>
      prev.map((p) => (p.id === preforma.id ? { ...p, estado: nuevoEstado } : p))
    )
    if (preformaSeleccionada && preformaSeleccionada.id === preforma.id) {
      setPreformaSeleccionada((prev) => (prev ? { ...prev, estado: nuevoEstado } : null))
    }

    const res = await cambiarEstadoPreformaAction(preforma.id, nuevoEstado as any)
    if (!res.success) {
      toast.error(res.error || "No se pudo actualizar el estado")
      setPreformas((prev) =>
        prev.map((p) => (p.id === preforma.id ? { ...p, estado: preforma.estado } : p))
      )
    } else {
      toast.success(`Preforma #${preforma.numero} marcada como ${nuevoEstado === "FINALIZADO" ? "Finalizada" : "En curso"}`)
    }
  }

  // Eliminar preforma
  const handleEliminarPreforma = async (preforma: PreformaView) => {
    const result = await Swal.fire({
      title: `¿Eliminar Preforma #${preforma.numero}?`,
      text: `Se eliminarán el registro y sus ${preforma.totalArticulos} artículos detectados.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    })

    if (!result.isConfirmed) return

    setPreformas((prev) => prev.filter((p) => p.id !== preforma.id))
    if (preformaSeleccionada && preformaSeleccionada.id === preforma.id) {
      setPreformaSeleccionada(null)
    }

    const res = await eliminarPreformaAction(preforma.id)
    if (res.success) {
      toast.success("Preforma eliminada correctamente")
    } else {
      toast.error(res.error || "Error al eliminar la preforma")
      router.refresh()
    }
  }

  // Búsqueda para vinculación manual
  const handleBuscarArticulosParaVincular = async (query: string) => {
    setBusquedaArticuloManual(query)
    if (query.trim().length < 2) {
      setResultadosBusquedaArticulo([])
      return
    }

    setBuscandoArticulos(true)
    try {
      const res = await buscarArticulosParaVinculacionAction(query)
      if (res.success && res.data) {
        setResultadosBusquedaArticulo(res.data)
      }
    } finally {
      setBuscandoArticulos(false)
    }
  }

  // Confirmar vinculación manual
  const handleConfirmarVinculacion = async (articulo: any) => {
    if (!itemParaVincular) return

    const res = await vincularItemManualAction(itemParaVincular.id, articulo.id)
    if (res.success) {
      toast.success(`Artículo ${articulo.nombre} vinculado con éxito`)

      if (preformaSeleccionada) {
        const updatedItems = preformaSeleccionada.items.map((it) =>
          it.id === itemParaVincular.id
            ? {
                ...it,
                articuloId: articulo.id,
                articuloNombre: articulo.nombre,
                articuloStock: articulo.stock,
                articuloCodigoProveedor: articulo.codigoProveedor,
              }
            : it
        )
        const vinculados = updatedItems.filter((i) => i.articuloId !== null).length
        const updatedPreforma = {
          ...preformaSeleccionada,
          items: updatedItems,
          vinculados,
          noVinculados: updatedItems.length - vinculados,
        }
        setPreformaSeleccionada(updatedPreforma)
        setPreformas((prev) =>
          prev.map((p) => (p.id === updatedPreforma.id ? updatedPreforma : p))
        )
      }

      setItemParaVincular(null)
      setResultadosBusquedaArticulo([])
      setBusquedaArticuloManual("")
    } else {
      toast.error(res.error || "No se pudo vincular el artículo")
    }
  }

  const getTipoIcono = (tipo?: string | null) => {
    if (tipo === "PDF") return <FileText className="w-5 h-5 text-rose-500" />
    if (tipo === "IMAGEN") return <ImageIcon className="w-5 h-5 text-purple-500" />
    return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* HEADER DE LA SECCIÓN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/erp"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              title="Volver a ERP"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-3xl text-sky-600 dark:text-sky-400">
                local_shipping
              </span>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Gestión de Importaciones
              </h1>
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 pl-11">
            Carga de preformas (Excel / PDF), extracción de fotos, detección de Supplier Item No. y cantidades
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={recargarPreformas}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Refrescar lista"
          >
            <RefreshCw className={`w-5 h-5 ${isPending ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setModalSubidaAbierto(true)}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-sky-600/20 transition-all duration-200 active:scale-95"
          >
            <UploadCloud className="w-5 h-5" />
            <span>Cargar Pre-forma</span>
          </button>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Preformas</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{totalPreformas}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">En Curso</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{enCursoCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Finalizadas</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{finalizadasCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Unidades Totales</p>
            <p className="text-2xl font-black text-sky-600 dark:text-sky-400">
              {totalUnidadesGlobal.toLocaleString("es-AR")}
            </p>
            {totalFobGlobal > 0 && (
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                FOB: ${totalFobGlobal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
            )}
          </div>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por archivo, factura o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFiltroEstado("TODAS")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filtroEstado === "TODAS"
                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            Todas ({totalPreformas})
          </button>
          <button
            onClick={() => setFiltroEstado("EN_CURSO")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroEstado === "EN_CURSO"
                ? "bg-amber-500 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            En curso ({enCursoCount})
          </button>
          <button
            onClick={() => setFiltroEstado("FINALIZADO")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroEstado === "FINALIZADO"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Finalizadas ({finalizadasCount})
          </button>
        </div>
      </div>

      {/* LISTADO DE PREFORMAS */}
      {preformasFiltradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 mx-auto flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No hay preformas cargadas</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Sube tus archivos de preforma en formato Excel o PDF con la columna{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-300">Supplier Item No.</span> para
              detectar automáticamente los artículos, fotos y cantidades.
            </p>
          </div>
          <button
            onClick={() => setModalSubidaAbierto(true)}
            className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl text-sm"
          >
            <UploadCloud className="w-4 h-4" />
            Cargar Primera Pre-forma
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {preformasFiltradas.map((preforma) => {
            const fechaStr = preforma.fechaEmision
              ? new Date(preforma.fechaEmision).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : new Date(preforma.createdAt).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
            const esFinalizado = preforma.estado === "FINALIZADO"
            const porcentajeVinculado =
              preforma.totalArticulos > 0
                ? Math.round((preforma.vinculados / preforma.totalArticulos) * 100)
                : 0

            return (
              <div
                key={preforma.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-all duration-200 group"
              >
                {/* Header de la tarjeta */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        #{preforma.numero}
                      </span>
                      {preforma.numeroFactura && (
                        <span className="text-[11px] font-mono font-bold bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded">
                          {preforma.numeroFactura}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{fechaStr}</span>
                    </div>

                    {/* Botón interactivo de Estado */}
                    <button
                      onClick={() => handleToggleEstado(preforma)}
                      className={`text-xs font-extrabold px-3 py-1 rounded-full flex items-center gap-1.5 transition-all active:scale-95 ${
                        esFinalizado
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                          : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                      }`}
                      title="Haz clic para cambiar el estado"
                    >
                      {esFinalizado ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Finalizado
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          En curso
                        </>
                      )}
                    </button>
                  </div>

                  {/* Nombre y proveedor */}
                  <div className="flex items-start gap-3 pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 shrink-0">
                      {getTipoIcono(preforma.tipoArchivo)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4
                        className="text-sm font-bold text-slate-900 dark:text-white truncate"
                        title={preforma.nombreArchivo}
                      >
                        {preforma.nombreArchivo}
                      </h4>
                      {preforma.proveedor ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 font-medium">
                          <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          {preforma.proveedor}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                          Formato: {preforma.tipoArchivo || "Desconocido"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Métricas del archivo */}
                <div className="p-5 space-y-4 flex-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                      <p className="text-xs text-slate-400 font-medium">Artículos</p>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {preforma.totalArticulos}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                      <p className="text-xs text-slate-400 font-medium">Unidades</p>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {preforma.totalUnidades.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>

                  {preforma.totalFob && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-2.5 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        Total FOB:
                      </span>
                      <span className="font-black text-emerald-900 dark:text-emerald-200 text-sm font-mono">
                        ${preforma.totalFob.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                      </span>
                    </div>
                  )}

                  {/* Barra de artículos vinculados con catálogo */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400">Vinculados con catálogo</span>
                      <span
                        className={
                          porcentajeVinculado === 100
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }
                      >
                        {preforma.vinculados} / {preforma.totalArticulos} ({porcentajeVinculado}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          porcentajeVinculado === 100 ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${porcentajeVinculado}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Acciones de la tarjeta */}
                <div className="p-4 bg-slate-50/60 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {preforma.archivoUrl && (
                      <a
                        href={`/api/importaciones/preformas/${preforma.id}/archivo`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600 text-xs font-semibold flex items-center gap-1.5"
                        title="Ver o descargar archivo original"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Ver Archivo</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreformaSeleccionada(preforma)}
                      className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Detalle</span>
                    </button>

                    <button
                      onClick={() => handleEliminarPreforma(preforma)}
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                      title="Eliminar preforma"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL PARA CARGAR PREFORMAS (MÚLTIPLES ARCHIVOS) */}
      {modalSubidaAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cargar Pre-forma(s)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Soporta Excel (.xlsx, .xls, .csv), PDF o Fotos/Imágenes
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!subiendo) {
                    setModalSubidaAbierto(false)
                    setArchivosSeleccionados([])
                  }
                }}
                disabled={subiendo}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-500 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-sky-50/20"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleArchivosChange}
                  className="hidden"
                />
                <UploadCloud className="w-12 h-12 text-sky-500 mx-auto mb-3 animate-bounce" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Arrastra tus archivos aquí o haz clic para explorar
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Puedes seleccionar múltiples archivos a la vez. Cada uno generará una nueva preforma.
                </p>
              </div>

              {/* Lista de archivos seleccionados */}
              {archivosSeleccionados.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Archivos seleccionados ({archivosSeleccionados.length})</span>
                    <button
                      onClick={() => setArchivosSeleccionados([])}
                      disabled={subiendo}
                      className="text-rose-500 hover:underline"
                    >
                      Limpiar todo
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {archivosSeleccionados.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate mr-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {file.name}
                          </span>
                          <span className="text-slate-400 shrink-0">
                            ({(file.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        {!subiendo && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removerArchivoSeleccionado(idx)
                            }}
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Información sobre el formato */}
              <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 rounded-xl p-3.5 flex items-start gap-3 text-xs text-sky-900 dark:text-sky-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                <div>
                  <span className="font-bold">Formato oficial:</span> Detecta la columna{" "}
                  <code className="bg-sky-100 dark:bg-sky-900/60 px-1 py-0.5 rounded font-mono font-bold">
                    Supplier Item No.
                  </code>
                  , la columna de foto, detalle, logo, medida y cantidad. Extrae automáticamente cada fotografía a S3 y vincula con los códigos del catálogo.
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setModalSubidaAbierto(false)
                  setArchivosSeleccionados([])
                }}
                disabled={subiendo}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcesarSubida}
                disabled={subiendo || archivosSeleccionados.length === 0}
                className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-sky-600/20 transition-all active:scale-95"
              >
                {subiendo ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Procesando archivos y fotos...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Procesar {archivosSeleccionados.length} archivo(s)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE COMPLETO DE PREFORMA */}
      {preformaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-6xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header del modal de detalle */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Preforma #{preformaSeleccionada.numero}
                  </span>
                  {preformaSeleccionada.numeroFactura && (
                    <span className="text-xs font-mono font-bold bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2.5 py-1 rounded-md flex items-center gap-1">
                      <FileDigit className="w-3.5 h-3.5" />
                      {preformaSeleccionada.numeroFactura}
                    </span>
                  )}
                  <button
                    onClick={() => handleToggleEstado(preformaSeleccionada)}
                    className={`text-xs font-extrabold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                      preformaSeleccionada.estado === "FINALIZADO"
                        ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                        : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    {preformaSeleccionada.estado === "FINALIZADO" ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Finalizado
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        En curso
                      </>
                    )}
                  </button>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {preformaSeleccionada.nombreArchivo}
                </h3>
                {preformaSeleccionada.proveedor && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Proveedor: <span className="text-slate-200 font-semibold">{preformaSeleccionada.proveedor}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                {preformaSeleccionada.totalFob && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-xl text-right">
                    <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Total FOB</p>
                    <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      ${preformaSeleccionada.totalFob.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </p>
                  </div>
                )}
                {preformaSeleccionada.archivoUrl && (
                  <a
                    href={`/api/importaciones/preformas/${preformaSeleccionada.id}/archivo`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Ver Archivo</span>
                  </a>
                )}
                <button
                  onClick={() => setPreformaSeleccionada(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Buscador dentro del detalle */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar artículos de la preforma..."
                  value={busquedaItemDetalle}
                  onChange={(e) => setBusquedaItemDetalle(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="text-xs font-bold text-slate-500 flex items-center gap-4">
                <span>Total: {preformaSeleccionada.items.length} artículos</span>
                <span className="text-sky-600 dark:text-sky-400 font-extrabold">
                  {preformaSeleccionada.totalUnidades.toLocaleString("es-AR")} unidades
                </span>
              </div>
            </div>

            {/* Tabla de artículos */}
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="pb-3 px-2">#</th>
                    <th className="pb-3 px-2">Foto</th>
                    <th className="pb-3 px-2">Supplier Item No.</th>
                    <th className="pb-3 px-2">Detalle / Medida</th>
                    <th className="pb-3 px-2">Artículo Local (Nuestro ID)</th>
                    <th className="pb-3 px-2 text-right">Cantidad</th>
                    <th className="pb-3 px-2 text-right">Stock Actual</th>
                    <th className="pb-3 px-2 text-right">Precio USD</th>
                    <th className="pb-3 px-2 text-right">Total USD</th>
                    <th className="pb-3 px-2 text-center">Estado</th>
                    <th className="pb-3 px-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preformaSeleccionada.items
                    .filter((it) => {
                      if (!busquedaItemDetalle.trim()) return true
                      const q = busquedaItemDetalle.toLowerCase()
                      return (
                        it.supplierItemNo.toLowerCase().includes(q) ||
                        (it.articuloNombre && it.articuloNombre.toLowerCase().includes(q)) ||
                        (it.articuloId && it.articuloId.toLowerCase().includes(q)) ||
                        (it.descripcionOriginal && it.descripcionOriginal.toLowerCase().includes(q)) ||
                        (it.logo && it.logo.toLowerCase().includes(q)) ||
                        (it.size && it.size.toLowerCase().includes(q))
                      )
                    })
                    .map((item, idx) => {
                      const estaVinculado = !!item.articuloId
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-2 text-slate-400">{idx + 1}</td>

                          {/* FOTO */}
                          <td className="py-3 px-2">
                            {(() => {
                              const itemFotoSrc = item.fotoUrl
                                ? item.fotoUrl.startsWith("http") && !item.fotoUrl.includes(typeof window !== "undefined" ? window.location.host : "")
                                  ? `/api/importaciones/items/${item.id}/foto`
                                  : item.fotoUrl
                                : null

                              return itemFotoSrc ? (
                                <button
                                  onClick={() =>
                                    setFotoEnZoom({
                                      url: itemFotoSrc,
                                      titulo: `${item.supplierItemNo} - ${item.descripcionOriginal || ""}`,
                                    })
                                  }
                                  className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center hover:scale-105 transition-transform"
                                  title="Ver foto ampliada"
                                >
                                  <img
                                    src={itemFotoSrc}
                                    alt={item.supplierItemNo}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = `/api/importaciones/items/${item.id}/foto`
                                    }}
                                  />
                                </button>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )
                            })()}
                          </td>

                          {/* CÓDIGO */}
                          <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">
                            {item.supplierItemNo}
                          </td>

                          {/* DETALLE Y MEDIDA */}
                          <td className="py-3 px-2 max-w-xs">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.descripcionOriginal || "-"}
                            </p>
                            {(item.logo || item.size) && (
                              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                {item.logo && (
                                  <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                                    {item.logo}
                                  </span>
                                )}
                                {item.size && (
                                  <span className="text-slate-500 font-semibold">{item.size}</span>
                                )}
                              </p>
                            )}
                          </td>

                          {/* ARTICULO LOCAL VINCULADO */}
                          <td className="py-3 px-2 max-w-xs">
                            {estaVinculado ? (
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                                  {item.articuloNombre}
                                </span>
                                <p className="text-[11px] text-slate-400 font-mono">ID: {item.articuloId}</p>
                              </div>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 italic">
                                Sin vincular con artículo
                              </span>
                            )}
                          </td>

                          {/* CANTIDAD */}
                          <td className="py-3 px-2 text-right font-black text-slate-900 dark:text-white text-sm">
                            {item.cantidad.toLocaleString("es-AR")}
                          </td>

                          {/* STOCK ACTUAL */}
                          <td className="py-3 px-2 text-right">
                            {item.articuloStock !== null && item.articuloStock !== undefined ? (
                              <span
                                className={`font-bold px-2 py-0.5 rounded ${
                                  item.articuloStock > 0
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                    : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {item.articuloStock}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">-</span>
                            )}
                          </td>

                          {/* PRECIO UNITARIO USD */}
                          <td className="py-3 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                            {item.precioUnitarioUsd ? `$${item.precioUnitarioUsd.toFixed(2)}` : "-"}
                          </td>

                          {/* TOTAL USD */}
                          <td className="py-3 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {item.precioTotalUsd ? `$${item.precioTotalUsd.toFixed(2)}` : "-"}
                          </td>

                          {/* ESTADO */}
                          <td className="py-3 px-2 text-center">
                            {estaVinculado ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Vinculado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" />
                                Pendiente
                              </span>
                            )}
                          </td>

                          {/* ACCIÓN */}
                          <td className="py-3 px-2 text-center">
                            <button
                              onClick={() => {
                                setItemParaVincular(item)
                                handleBuscarArticulosParaVincular(item.supplierItemNo)
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-600 dark:text-sky-400 transition-colors"
                              title="Cambiar o vincular artículo manualmente"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{preformaSeleccionada.nombreArchivo}</span>
              <button
                onClick={() => setPreformaSeleccionada(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZOOM DE FOTO */}
      {fotoEnZoom && (
        <div
          onClick={() => setFotoEnZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 p-4 space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {fotoEnZoom.titulo}
              </h5>
              <button onClick={() => setFotoEnZoom(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full h-80 bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-700">
              <img src={fotoEnZoom.url} alt="Foto producto" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VINCULACIÓN MANUAL */}
      {itemParaVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  Vincular con Artículo del Catálogo
                </h4>
                <p className="text-xs text-slate-400">
                  Código Supplier Item No:{" "}
                  <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                    {itemParaVincular.supplierItemNo}
                  </span>
                </p>
                {itemParaVincular.descripcionOriginal && (
                  <p className="text-xs text-slate-500 italic mt-0.5 truncate">
                    {itemParaVincular.descripcionOriginal}
                  </p>
                )}
              </div>
              <button
                onClick={() => setItemParaVincular(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Buscar por nombre, ID o código:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busquedaArticuloManual}
                  onChange={(e) => handleBuscarArticulosParaVincular(e.target.value)}
                  placeholder="Ej: Varilla, B0246, 479881..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
              {buscandoArticulos ? (
                <div className="p-4 text-center text-xs text-slate-400">Buscando artículos...</div>
              ) : resultadosBusquedaArticulo.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No se encontraron artículos con ese criterio.
                </div>
              ) : (
                resultadosBusquedaArticulo.map((art) => (
                  <div
                    key={art.id}
                    onClick={() => handleConfirmarVinculacion(art)}
                    className="p-2.5 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-900/20 cursor-pointer transition-colors flex items-center justify-between text-xs group"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600">
                        {art.nombre}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        ID: {art.id} {art.codigoProveedor ? `| Cód: ${art.codigoProveedor}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        Stock: {art.stock}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setItemParaVincular(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
