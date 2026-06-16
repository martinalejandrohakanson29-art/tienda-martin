"use client"

import * as React from "react"
import { Search, Check, X } from "lucide-react"
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
import { cn } from "@/lib/utils"
import {
  type SeguimientoItem,
  updateArticuloSeguimiento,
  upsertPackSeguimiento,
} from "@/app/actions/seguimiento-competencia"

type TipoFilter = "TODOS" | "ARTICULO" | "PACK"

export function SeguimientoTable({ data }: { data: SeguimientoItem[] }) {
  const [filtroTexto, setFiltroTexto] = React.useState("")
  const [filtroTipo, setFiltroTipo] = React.useState<TipoFilter>("TODOS")
  const [pendingKeywords, setPendingKeywords] = React.useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = React.useState<Set<string>>(new Set())
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set())

  const filtered = React.useMemo(() => {
    const texto = filtroTexto.toLowerCase()
    return data.filter((item) => {
      const matchTipo = filtroTipo === "TODOS" || item.tipo === filtroTipo
      const matchTexto =
        !texto ||
        item.nombre.toLowerCase().includes(texto) ||
        item.referencia.toLowerCase().includes(texto) ||
        (item.keywordBusqueda ?? "").toLowerCase().includes(texto)
      return matchTipo && matchTexto
    })
  }, [data, filtroTexto, filtroTipo])

  const getKeyword = (item: SeguimientoItem) =>
    pendingKeywords[item.referencia] !== undefined
      ? pendingKeywords[item.referencia]
      : (item.keywordBusqueda ?? "")

  async function handleKeywordSave(item: SeguimientoItem) {
    const keyword = pendingKeywords[item.referencia]
    if (keyword === undefined) return
    if (keyword === (item.keywordBusqueda ?? "")) {
      setPendingKeywords((prev) => { const n = { ...prev }; delete n[item.referencia]; return n })
      return
    }
    setSavingIds((prev) => new Set(prev).add(item.referencia))
    try {
      if (item.tipo === "ARTICULO") {
        await updateArticuloSeguimiento(item.referencia, keyword || null, item.activo)
      } else {
        await upsertPackSeguimiento(item.referencia, item.nombre, keyword || null, item.activo)
      }
      setPendingKeywords((prev) => { const n = { ...prev }; delete n[item.referencia]; return n })
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); n.delete(item.referencia); return n })
    }
  }

  async function handleToggleActivo(item: SeguimientoItem) {
    setTogglingIds((prev) => new Set(prev).add(item.referencia))
    try {
      const keyword = getKeyword(item)
      if (item.tipo === "ARTICULO") {
        await updateArticuloSeguimiento(item.referencia, keyword || null, !item.activo)
      } else {
        await upsertPackSeguimiento(item.referencia, item.nombre, keyword || null, !item.activo)
      }
    } finally {
      setTogglingIds((prev) => { const n = new Set(prev); n.delete(item.referencia); return n })
    }
  }

  const activos = data.filter((i) => i.activo).length

  return (
    <div className="flex flex-col h-full space-y-4 p-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2 rounded-lg border">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar nombre, SKU o keyword..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="pl-9 h-9 bg-white"
            />
          </div>

          <div className="flex gap-1 bg-white border rounded-md p-1">
            {(["TODOS", "ARTICULO", "PACK"] as TipoFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                className={cn(
                  "px-3 py-1 text-[11px] font-bold rounded transition-colors",
                  filtroTipo === t
                    ? t === "ARTICULO"
                      ? "bg-blue-600 text-white"
                      : t === "PACK"
                      ? "bg-orange-500 text-white"
                      : "bg-slate-700 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {t === "TODOS" ? "Todos" : t === "ARTICULO" ? "Artículos" : "Packs"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="font-semibold text-green-600">{activos} activos</span>
          <span>·</span>
          <span>{data.length} ítems totales</span>
          <span>·</span>
          <span>mostrando {filtered.length}</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-white">
        <div className="overflow-auto h-[calc(100vh-230px)]">
          <Table className="relative border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20 bg-slate-100 shadow-sm">
              <TableRow>
                <TableHead className="h-10 text-[11px] font-bold text-slate-700 border-b border-r px-3 w-24">TIPO</TableHead>
                <TableHead className="h-10 text-[11px] font-bold text-slate-700 border-b border-r px-3">NOMBRE</TableHead>
                <TableHead className="h-10 text-[11px] font-bold text-slate-700 border-b border-r px-3 w-36">SKU / MLA</TableHead>
                <TableHead className="h-10 text-[11px] font-bold text-slate-700 border-b border-r px-3">KEYWORD DE BÚSQUEDA</TableHead>
                <TableHead className="h-10 text-[11px] font-bold text-slate-700 border-b text-center w-24">ACTIVO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const isSaving = savingIds.has(item.referencia)
                const isToggling = togglingIds.has(item.referencia)
                const hasPending = pendingKeywords[item.referencia] !== undefined &&
                  pendingKeywords[item.referencia] !== (item.keywordBusqueda ?? "")

                return (
                  <TableRow
                    key={`${item.tipo}-${item.referencia}`}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    {/* Tipo */}
                    <TableCell className="p-2 border-b border-r">
                      <Badge
                        className={cn(
                          "text-[10px] font-bold",
                          item.tipo === "ARTICULO"
                            ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                            : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                        )}
                      >
                        {item.tipo === "ARTICULO" ? "Artículo" : "Pack"}
                      </Badge>
                    </TableCell>

                    {/* Nombre */}
                    <TableCell className="p-2 border-b border-r">
                      <span className="text-[12px] font-medium text-slate-800">{item.nombre}</span>
                    </TableCell>

                    {/* Referencia */}
                    <TableCell className="p-2 border-b border-r">
                      <span className="font-mono text-[10px] text-slate-500">{item.referencia}</span>
                    </TableCell>

                    {/* Keyword */}
                    <TableCell className="p-1 border-b border-r">
                      <div className="flex items-center gap-1">
                        <Input
                          value={getKeyword(item)}
                          onChange={(e) =>
                            setPendingKeywords((prev) => ({ ...prev, [item.referencia]: e.target.value }))
                          }
                          onBlur={() => handleKeywordSave(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur()
                            }
                          }}
                          placeholder="Ej: cigüeñal 200 varillero"
                          className={cn(
                            "h-7 text-[11px] border-slate-200",
                            hasPending && "border-amber-400 bg-amber-50/30"
                          )}
                          disabled={isSaving}
                        />
                        {isSaving && (
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">Guardando...</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Toggle activo */}
                    <TableCell className="p-2 border-b text-center">
                      <button
                        onClick={() => handleToggleActivo(item)}
                        disabled={isToggling}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-all",
                          item.activo
                            ? "bg-green-500 hover:bg-green-600 text-white shadow-sm"
                            : "bg-slate-200 hover:bg-slate-300 text-slate-400",
                          isToggling && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {item.activo ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 text-sm py-12">
                    No se encontraron ítems
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
