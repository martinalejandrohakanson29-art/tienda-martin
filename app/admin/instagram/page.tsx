import { getInstagramArticlesSummary } from "@/app/actions/instagram-sales"
import { InstagramSalesClient } from "./instagram-sales-client"

export default async function InstagramSalesPage() {
  const data = await getInstagramArticlesSummary();

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Saldos de Artículos (Instagram)</h2>
          <p className="text-slate-500 text-sm">Resumen acumulado de productos vendidos y recaudación total.</p>
        </div>
      </div>
      <InstagramSalesClient data={data} />
    </div>
  )
}
