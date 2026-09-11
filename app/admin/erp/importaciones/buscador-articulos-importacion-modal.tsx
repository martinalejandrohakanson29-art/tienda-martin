"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import { Search, Link2, Loader2, Check, Package, X, Unlink, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { PreformaItemView } from "./importaciones-client"

export interface ArticuloCatalogo {
  id: string
  nombre: string
  stock: number
  precio: number
  costo?: number | null
  codigoProveedor?: string | null
  proveedorId?: string | null
  proveedorNombre?: string | null
  fobUsdSugerido?: number | null
  supplierItemNoSugerido?: string | null
  oculto?: boolean
  esPack?: boolean
  ultimaModificacion?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemParaVincular: PreformaItemView | null
  articulos: ArticuloCatalogo[]
  cargandoArticulos?: boolean
  filtroProveedorId?: string | null
  filtroProveedorNombre?: string | null
  onSelectArticulo: (articulo: ArticuloCatalogo) => Promise<void> | void
  onDesvincularArticulo?: () => Promise<void> | void
}

function normalizeText(text?: string | number | null): string {
  if (!text) return ""
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function BuscadorArticulosImportacionModal({
  open,
  onOpenChange,
  itemParaVincular,
  articulos,
  cargandoArticulos = false,
  filtroProveedorId,
  filtroProveedorNombre,
  onSelectArticulo,
  onDesvincularArticulo,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("")
  const [incluirOcultos, setIncluirOcultos] = useState(false)
  const [soloProveedor, setSoloProveedor] = useState(true)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [desvinculando, setDesvinculando] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Inicializar búsqueda con el código del ítem si existe, o dejar en blanco
  useEffect(() => {
    if (open && itemParaVincular) {
      setSearchTerm(itemParaVincular.supplierItemNo || "")
      setSelectedIndex(0)
      if (filtroProveedorId) {
        setSoloProveedor(true)
      }
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    } else if (!open) {
      setSearchTerm("")
      setSelectedIndex(0)
      setGuardandoId(null)
      setDesvinculando(false)
    }
  }, [open, itemParaVincular, filtroProveedorId])

  // Artículos que corresponden a este proveedor (por ID o por Nombre)
  const matchProveedor = (a: ArticuloCatalogo) => {
    if (filtroProveedorId && a.proveedorId === filtroProveedorId) return true
    if (
      filtroProveedorNombre &&
      a.proveedorNombre &&
      normalizeText(a.proveedorNombre) === normalizeText(filtroProveedorNombre)
    )
      return true
    return false
  }

  const articulosDelProveedor = useMemo(() => {
    if (!filtroProveedorId && !filtroProveedorNombre) return []
    return articulos.filter(matchProveedor)
  }, [articulos, filtroProveedorId, filtroProveedorNombre])

  const poolArticulos = useMemo(() => {
    let pool = incluirOcultos ? articulos : articulos.filter((a) => !a.oculto)
    if ((filtroProveedorId || filtroProveedorNombre) && soloProveedor) {
      pool = pool.filter(matchProveedor)
    }
    return pool
  }, [articulos, incluirOcultos, filtroProveedorId, filtroProveedorNombre, soloProveedor])

  const searchResults = useMemo(() => {
    const term = normalizeText(searchTerm).trim()
    if (!term) return poolArticulos.slice(0, 50)

    const words = term.split(/\s+/)
    return poolArticulos
      .filter((p) => {
        const fullText = normalizeText(
          `${p.nombre} ${p.id} ${p.codigoProveedor || ""} ${p.supplierItemNoSugerido || ""}`
        )
        return words.every((w) => fullText.includes(w))
      })
      .slice(0, 50)
  }, [poolArticulos, searchTerm])

  useEffect(() => {
    setSelectedIndex(0)
  }, [searchTerm, soloProveedor])

  const scrollToIndex = (idx: number) => {
    if (!listRef.current) return
    const elements = listRef.current.querySelectorAll("[data-item-index]")
    if (elements[idx]) {
      elements[idx].scrollIntoView({ block: "nearest" })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => {
        const next = prev < searchResults.length - 1 ? prev + 1 : prev
        scrollToIndex(next)
        return next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0
        scrollToIndex(next)
        return next
      })
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (searchResults[selectedIndex]) {
        handleSeleccionar(searchResults[selectedIndex])
      }
    }
  }

  const handleSeleccionar = async (prod: ArticuloCatalogo) => {
    try {
      setGuardandoId(prod.id)
      await onSelectArticulo(prod)
    } finally {
      setGuardandoId(null)
    }
  }

  const handleDesvincular = async () => {
    if (!onDesvincularArticulo) return
    try {
      setDesvinculando(true)
      await onDesvincularArticulo()
    } finally {
      setDesvinculando(false)
    }
  }

  if (!itemParaVincular) return null

  const esModoCrearBorrador = itemParaVincular.id === "nuevo-borrador"
  const estaVinculado = !!itemParaVincular.articuloId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[950px] p-0 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
        {/* ENCABEZADO */}
        <div className="p-5 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  esModoCrearBorrador
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                    : "bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400"
                }`}
              >
                {esModoCrearBorrador ? <Package className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {esModoCrearBorrador
                    ? `Agregar Artículos al Pedido (${filtroProveedorNombre || "Proveedor"})`
                    : "Vincular con Artículo del Catálogo"}
                </DialogTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {esModoCrearBorrador
                    ? `Listando por defecto los artículos vinculados a ${filtroProveedorNombre || "este proveedor"}. Puedes alternar para ver todo el catálogo.`
                    : "Selecciona el producto del sistema que corresponde a este renglón de la preforma"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={incluirOcultos}
                  onCheckedChange={(v) => setIncluirOcultos(!!v)}
                  className="data-[state=checked]:bg-slate-700 data-[state=checked]:border-slate-700"
                />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Incluir ocultos
                </span>
              </label>
            </div>
          </div>

          {/* FICHA RESUMEN DEL ÍTEM DE PREFORMA (Solo si no es nuevo borrador) */}
          {!esModoCrearBorrador && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {itemParaVincular.fotoUrl ? (
                  <img
                    src={itemParaVincular.fotoUrl}
                    alt={itemParaVincular.supplierItemNo}
                    className="w-12 h-12 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    SIN FOTO
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      {itemParaVincular.supplierItemNo}
                    </span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Cant: {itemParaVincular.cantidad.toLocaleString("es-AR")} u.
                    </span>
                    {itemParaVincular.precioUnitarioUsd && (
                      <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        ${itemParaVincular.precioUnitarioUsd.toFixed(2)} USD
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 font-semibold truncate mt-0.5">
                    {itemParaVincular.descripcionOriginal || "Sin descripción"}
                  </p>
                  {(itemParaVincular.logo || itemParaVincular.size) && (
                    <p className="text-[11px] text-slate-400">
                      {itemParaVincular.logo ? `Marca: ${itemParaVincular.logo} ` : ""}
                      {itemParaVincular.size ? `| Medida: ${itemParaVincular.size}` : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* VINCULACIÓN ACTUAL */}
              {estaVinculado && (
                <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-800 pt-2 sm:pt-0 sm:pl-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                      Vinculado con
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 max-w-[180px] truncate block">
                      {itemParaVincular.articuloNombre}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      ID: {itemParaVincular.articuloId}
                    </span>
                  </div>
                  {onDesvincularArticulo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={desvinculando}
                      onClick={handleDesvincular}
                      className="h-8 px-2.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/50"
                      title="Quitar vinculación de este ítem"
                    >
                      {desvinculando ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Unlink className="w-3.5 h-3.5 mr-1" />
                      )}
                      <span>Desvincular</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* INPUT BUSCADOR INSTANTÁNEO */}
          <div className="relative mt-4">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              ref={inputRef}
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe el nombre, código o ID del artículo... (Usa ↑ ↓ y Enter para elegir rápido)"
              className="flex h-12 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-12 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white transition-all shadow-sm"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("")
                  inputRef.current?.focus()
                }}
                className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* BOTONES DE FILTRADO POR PROVEEDOR */}
          {filtroProveedorId && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSoloProveedor(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  soloProveedor
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                <span>Artículos de {filtroProveedorNombre || "este proveedor"}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    soloProveedor
                      ? "bg-emerald-700 text-white"
                      : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {articulosDelProveedor.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSoloProveedor(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  !soloProveedor
                    ? "bg-sky-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                <span>Todo el Catálogo</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    !soloProveedor
                      ? "bg-sky-700 text-white"
                      : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {articulos.length}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* LISTA DE ARTÍCULOS */}
        <div ref={listRef} className="h-[460px] overflow-y-auto p-3 bg-slate-50/50 dark:bg-slate-950/20 space-y-1.5">
          {cargandoArticulos ? (
            <div className="py-20 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-sky-500" />
              <p className="text-sm">Cargando catálogo de artículos...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">No se encontraron artículos</p>
              <p className="text-xs mt-1">Prueba con otra palabra clave o cambia el filtro</p>
            </div>
          ) : (
            searchResults.map((prod, index) => {
              const isSelected = index === selectedIndex
              const isItemVinculado = itemParaVincular?.articuloId === prod.id
              const guardandoEste = guardandoId === prod.id

              return (
                <div
                  key={prod.id}
                  data-item-index={index}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSeleccionar(prod)}
                  className={`w-full flex items-center justify-between gap-4 p-3 rounded-2xl transition-all border cursor-pointer select-none ${
                    isItemVinculado
                      ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 shadow-sm"
                      : isSelected
                      ? "bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700 shadow-sm"
                      : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        isItemVinculado
                          ? "bg-emerald-600 text-white"
                          : isSelected
                          ? "bg-sky-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {guardandoEste ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isItemVinculado ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                    </div>

                    <div className="text-left flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {prod.esPack && (
                          <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800 uppercase shrink-0">
                            Pack
                          </span>
                        )}
                        {prod.oculto && (
                          <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">
                            Oculto
                          </span>
                        )}
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight">
                          {prod.nombre}
                        </p>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            prod.stock <= 0
                              ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40"
                              : prod.stock <= 5
                              ? "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/40"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40"
                          }`}
                        >
                          Stock: {prod.stock}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono flex-wrap mt-0.5">
                        <span>ID: {prod.id}</span>
                        {(prod.codigoProveedor || prod.supplierItemNoSugerido) && (
                          <span className="bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded text-[11px] font-bold border border-sky-100 dark:border-sky-800">
                            Fábrica: {prod.codigoProveedor || prod.supplierItemNoSugerido}
                          </span>
                        )}
                        {prod.fobUsdSugerido && (
                          <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-bold border border-emerald-100 dark:border-emerald-800">
                            Último FOB: ${prod.fobUsdSugerido.toFixed(2)} USD
                          </span>
                        )}
                        {prod.proveedorNombre && (
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded text-[10px]">
                            {prod.proveedorNombre}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-base font-black text-slate-900 dark:text-white font-mono">
                        $ {Number(prod.precio).toLocaleString("es-AR")}
                      </p>
                      {prod.costo ? (
                        <p className="text-xs text-slate-400">
                          Costo: $ {Number(prod.costo).toLocaleString("es-AR")}
                        </p>
                      ) : null}
                    </div>

                    <Button
                      size="sm"
                      disabled={guardandoEste}
                      className={`rounded-xl text-xs font-bold px-3 ${
                        isItemVinculado
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : esModoCrearBorrador
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : isSelected
                          ? "bg-sky-600 hover:bg-sky-700 text-white"
                          : "bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900"
                      }`}
                    >
                      {guardandoEste ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : esModoCrearBorrador ? (
                        "+ Agregar"
                      ) : isItemVinculado ? (
                        "Vinculado"
                      ) : (
                        "Vincular"
                      )}
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* PIE DEL MODAL */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="kbd bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold">
              ↑ ↓
            </span>
            <span>Navegar</span>
            <span className="kbd bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold ml-2">
              Enter
            </span>
            <span>{esModoCrearBorrador ? "Agregar al Pedido" : "Vincular"}</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs font-bold text-slate-600 dark:text-slate-300"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
