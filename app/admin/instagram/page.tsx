import { getInstagramSales } from "@/app/actions/instagram-sales"
import { InstagramSalesClient } from "./instagram-sales-client"

export default async function InstagramSalesPage() {
  const sales = await getInstagramSales();

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Ventas de Instagram</h2>
          <p className="text-slate-500 text-sm">Gestiona y visualiza las ventas importadas desde n8n.</p>
        </div>
      </div>
      <InstagramSalesClient initialData={sales} />
    </div>
  )
}
