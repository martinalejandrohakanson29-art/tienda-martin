import { getInstagramArticlesSummary } from "@/app/actions/instagram-sales"
import { getMarketingPerformance } from "@/app/actions/marketing"
import { InstagramSalesClient } from "./instagram-sales-client"
import { MarketingClient } from "./marketing-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default async function InstagramSalesPage() {
  // Traemos los datos de ambas secciones en paralelo (más rápido)
  const [salesData, marketingData] = await Promise.all([
    getInstagramArticlesSummary(),
    getMarketingPerformance()
  ]);

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestión Instagram</h2>
          <p className="text-slate-500 text-sm">Control de ventas de artículos y rendimiento de pauta publicitaria.</p>
        </div>
      </div>

      <Tabs defaultValue="ventas" className="w-full space-y-6">
        <TabsList className="bg-white border shadow-sm p-1">
          <TabsTrigger value="ventas" className="px-8 font-semibold data-[state=active]:bg-slate-100">
            Ventas Instagram
          </TabsTrigger>
          <TabsTrigger value="marketing" className="px-8 font-semibold data-[state=active]:bg-slate-100">
            Marketing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ventas" className="space-y-4 border-none p-0 outline-none">
          <InstagramSalesClient data={salesData} />
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4 border-none p-0 outline-none">
          <MarketingClient data={marketingData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
