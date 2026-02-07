import { getMarketingPerformance } from "@/app/actions/marketing"
import { MarketingClient } from "./marketing-client"

export default async function MarketingPage() {
  const data = await getMarketingPerformance();

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Rendimiento Marketing</h2>
          <p className="text-slate-500 text-sm">Métricas en tiempo real de campañas de Meta Ads y respuestas automáticas.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium text-slate-600">API Meta Conectada</span>
        </div>
      </div>
      <MarketingClient initialData={data} />
    </div>
  )
}
