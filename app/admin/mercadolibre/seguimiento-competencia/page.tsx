import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getSeguimientoData } from "@/app/actions/seguimiento-competencia"
import { SeguimientoTable } from "./seguimiento-table"

export const dynamic = "force-dynamic"

export default async function SeguimientoCompetenciaPage() {
  const data = await getSeguimientoData()

  return (
    <div className="flex flex-col h-screen bg-slate-50/50 overflow-hidden">
      <div className="flex items-center gap-4 px-8 py-4 border-b bg-white">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Seguimiento Competencia</h1>
          <p className="text-xs text-slate-500">
            Configurá las keywords de búsqueda y activá el seguimiento por artículo o pack.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <SeguimientoTable data={data} />
      </div>
    </div>
  )
}
