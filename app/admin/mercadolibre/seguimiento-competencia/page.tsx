import { ArrowLeft, Settings2, BarChart2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getSeguimientoData, getResultadosCompetencia } from "@/app/actions/seguimiento-competencia"
import { SeguimientoTable } from "./seguimiento-table"
import { ResultadosView } from "./resultados-view"

export const dynamic = "force-dynamic"

export default async function SeguimientoCompetenciaPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab = searchParams.tab === "resultados" ? "resultados" : "configurar"

  const [data, resultados] = await Promise.all([
    getSeguimientoData(),
    getResultadosCompetencia(),
  ])

  return (
    <div className="flex flex-col h-screen bg-slate-50/50 overflow-hidden">
      <div className="flex items-center gap-4 px-8 py-4 border-b bg-white">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Seguimiento Competencia</h1>
          <p className="text-xs text-slate-500">
            Configurá keywords y rastreá precios de la competencia en Mercado Libre.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <Link href="?tab=configurar">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 h-8 text-[12px] font-semibold transition-all ${
                tab === "configurar"
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurar
            </Button>
          </Link>
          <Link href="?tab=resultados">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 h-8 text-[12px] font-semibold transition-all ${
                tab === "resultados"
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              Resultados
              {resultados.length > 0 && (
                <span className="bg-sky-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {resultados.length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        {tab === "configurar" ? (
          <SeguimientoTable data={data} />
        ) : (
          <ResultadosView grupos={resultados} />
        )}
      </div>
    </div>
  )
}
