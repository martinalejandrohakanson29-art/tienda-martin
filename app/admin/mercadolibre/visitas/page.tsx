// app/admin/mercadolibre/visitas/page.tsx
import { Metadata } from "next"
import VisitasClient from "./visitas-client"
import { getVisitasComparativas } from "@/app/actions/visitas"

export const metadata: Metadata = {
  title: "Visitas MercadoLibre",
  description: "Monitor de visitas y estadísticas de productos",
}

export default async function VisitasPage() {
  // CONFIGURA TUS RANGOS AQUÍ MANUALMENTE
  const r1 = { 
    from: '2026-01-01', 
    to: '2026-01-17' 
  };
  
  const r2 = { 
    from: '2026-02-01', 
    to: '2026-02-17' 
  };

  const { comparativa } = await getVisitasComparativas(r1, r2);

  return (
    <div className="flex h-full flex-1 flex-col space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-blue-700">
            Comparativa de Visitas
          </h2>
          <p className="text-muted-foreground text-sm">
            Rango 1: <span className="font-bold text-gray-800">{r1.from} al {r1.to}</span>
            <span className="mx-2">vs</span> 
            Rango 2: <span className="font-bold text-gray-800">{r2.from} al {r2.to}</span>
          </p>
        </div>
      </div>
      
      <VisitasClient data={comparativa} />
    </div>
  )
}
