import { getInstagramArticlesSummary } from "@/app/actions/instagram-sales"
import { getMarketingPerformance, obtenerArticulosParaAsignacion } from "@/app/actions/marketing"
import { getInstagramGeneralDashboard } from "@/app/actions/instagram-dashboard"
import { InstagramGeneralClient } from "./instagram-general-client"
import { InstagramSalesClient } from "./instagram-sales-client"
import { MarketingClient } from "./marketing-client"
import { InstagramIaClient } from "./instagram-ia-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles } from "lucide-react"

export default async function InstagramSalesPage() {
  // Traemos los datos de todas las secciones en paralelo
  const [generalData, salesData, marketingData, articulosData] = await Promise.all([
    getInstagramGeneralDashboard({ preset: "last_15d" }),
    getInstagramArticlesSummary(),
    getMarketingPerformance(),
    obtenerArticulosParaAsignacion()
  ]);

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Gestión Instagram & Marketing</h2>
          <p className="text-slate-500 text-sm">Tablero general de Instagram, salud publicitaria, atribución de ventas y rendimiento de campañas.</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full space-y-6">
        <TabsList className="bg-white border shadow-sm p-1">
          <TabsTrigger value="general" className="px-6 font-semibold data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
            Panel General Instagram
          </TabsTrigger>
          <TabsTrigger value="marketing" className="px-6 font-semibold data-[state=active]:bg-slate-100">
            Tablero de Salud & Marketing
          </TabsTrigger>
          <TabsTrigger value="ventas" className="px-6 font-semibold data-[state=active]:bg-slate-100">
            Ventas Instagram Directas
          </TabsTrigger>
          <TabsTrigger value="consulta-ia" className="px-6 font-semibold data-[state=active]:bg-purple-50 data-[state=active]:text-purple-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Consulta IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 border-none p-0 outline-none">
          <InstagramGeneralClient initialData={generalData} />
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4 border-none p-0 outline-none">
          <MarketingClient 
            data={marketingData} 
            articulosDisponibles={articulosData.data || []} 
          />
        </TabsContent>

        <TabsContent value="ventas" className="space-y-4 border-none p-0 outline-none">
          <InstagramSalesClient data={salesData} />
        </TabsContent>

        <TabsContent value="consulta-ia" className="space-y-4 border-none p-0 outline-none">
          <InstagramIaClient 
            initialGeneralData={generalData}
            initialMarketingData={marketingData}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

