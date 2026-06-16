"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, TrendingDown, TrendingUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { type ResultadoGrupo } from "@/app/actions/seguimiento-competencia"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

function formatPrecio(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

export function ResultadosView({ grupos }: { grupos: ResultadoGrupo[] }) {
  const [expandido, setExpandido] = React.useState<string | null>(
    grupos[0]?.referencia ?? null
  )

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
        <p className="text-lg font-medium">Sin resultados todavía</p>
        <p className="text-sm">Ejecutá <code className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">npm run sync</code> en tu PC local para obtener datos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 overflow-auto h-[calc(100vh-200px)] pr-1">
      {grupos.map((grupo) => {
        const abierto = expandido === grupo.referencia
        const hace = formatDistanceToNow(new Date(grupo.scrapedAt), { locale: es, addSuffix: true })

        return (
          <div key={grupo.referencia} className="border rounded-lg bg-white overflow-hidden shadow-sm">
            {/* Header del grupo */}
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
              onClick={() => setExpandido(abierto ? null : grupo.referencia)}
            >
              <div className="flex items-center gap-3">
                <Badge className={cn(
                  "text-[10px] font-bold shrink-0",
                  grupo.tipo === "ARTICULO"
                    ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                    : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                )}>
                  {grupo.tipo === "ARTICULO" ? "Artículo" : "Pack"}
                </Badge>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{grupo.nombre}</p>
                  <p className="text-[11px] text-slate-400">keyword: "{grupo.keyword}" · {hace}</p>
                </div>
              </div>

              {/* Stats rápidos */}
              <div className="flex items-center gap-6 shrink-0 mr-2">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Mín</p>
                  <p className="text-sm font-bold text-green-600">{formatPrecio(grupo.precioMin)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Promedio</p>
                  <p className="text-sm font-bold text-slate-700">{formatPrecio(grupo.precioPromedio)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Máx</p>
                  <p className="text-sm font-bold text-red-500">{formatPrecio(grupo.precioMax)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Competidores</p>
                  <p className="text-sm font-bold text-slate-600">{grupo.resultados.length}</p>
                </div>
                <span className="text-slate-300 text-lg">{abierto ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Tabla de resultados */}
            {abierto && (
              <div className="border-t overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold text-slate-500 w-8">#</th>
                      <th className="text-left px-3 py-2 font-bold text-slate-500">TÍTULO</th>
                      <th className="text-right px-3 py-2 font-bold text-slate-500 w-32">PRECIO</th>
                      <th className="text-left px-3 py-2 font-bold text-slate-500 w-36">VENDEDOR</th>
                      <th className="text-left px-3 py-2 font-bold text-slate-500 w-28">ENVÍO</th>
                      <th className="text-left px-3 py-2 font-bold text-slate-500 w-32">CUOTAS</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 w-10">LINK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.resultados.map((r, i) => {
                      const esMinimo = r.precio === grupo.precioMin
                      const esMaximo = r.precio === grupo.precioMax && grupo.resultados.length > 1

                      return (
                        <tr
                          key={r.mlaId}
                          className={cn(
                            "border-t hover:bg-slate-50 transition-colors",
                            esMinimo && "bg-green-50/60"
                          )}
                        >
                          <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2 max-w-xs">
                            <div className="flex items-center gap-1.5">
                              {r.imagen && (
                                <img src={r.imagen} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
                              )}
                              <span className="truncate text-slate-700 font-medium" title={r.titulo}>
                                {r.titulo}
                              </span>
                              {r.esTiendaOficial && (
                                <Badge className="text-[8px] bg-blue-600 text-white hover:bg-blue-600 shrink-0 px-1 py-0">Oficial</Badge>
                              )}
                            </div>
                            {r.stock && (
                              <p className="text-[10px] text-orange-500 mt-0.5">{r.stock}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {esMinimo && <TrendingDown className="h-3 w-3 text-green-500" />}
                              {esMaximo && <TrendingUp className="h-3 w-3 text-red-400" />}
                              <span className={cn(
                                "font-bold",
                                esMinimo ? "text-green-600" : esMaximo ? "text-red-500" : "text-slate-700"
                              )}>
                                {formatPrecio(r.precio)}
                              </span>
                            </div>
                            {r.precioOriginal && (
                              <p className="text-[10px] text-slate-400 line-through text-right">
                                {formatPrecio(r.precioOriginal)}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600 truncate max-w-[140px]" title={r.vendedor ?? ""}>
                            {r.vendedor || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.envio ? (
                              <span className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                r.envio.includes("Full") ? "bg-green-100 text-green-700" : "bg-blue-50 text-blue-600"
                              )}>
                                {r.envio}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500 truncate max-w-[130px]">
                            {r.cuotas || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <a href={r.link} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-blue-50 text-blue-500 transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
