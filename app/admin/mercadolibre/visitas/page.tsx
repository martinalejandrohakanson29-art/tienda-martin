// app/admin/mercadolibre/visitas/page.tsx
import { Metadata } from "next"
import VisitasClient from "./visitas-client"
import { getVisitasComparativas } from "@/app/actions/visitas"

export const metadata: Metadata = {
  title: "Visitas MercadoLibre",
  description: "Monitor de visitas y estadísticas de productos",
}

export default async function VisitasPage() {
  // AQUÍ PODÉS CAMBIAR LAS FECHAS MANUALMENTE
  // Formato: AAAA-MM-DD (Año-Mes-Día)

  // Periodo 1: (Ejemplo: 1 al 17 de Enero)
  const r1 = { 
    from: '2025-01-01', 
    to: '2025-01-17' 
  };
  
  // Periodo 2: (Ejemplo: 1 al 17 de Febrero)
  const r2 = { 
    from: '2025-02-01', 
    to: '2025-02-17' 
  };

  // Traemos la comparativa real usando esos rangos
  const { comparativa } = await getVisitasComparativas(r1, r2);

  return (
    <div className="hidden h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            MercadoLibre Visitas
          </h2>
          <p className="text-muted-foreground">
            Comparando: {r1.from} al {r1.to} VS {r2.from} al {r2.to}
          </p>
        </div>
      </div>
      
      {/* Pasamos los datos al componente cliente */}
      <VisitasClient data={comparativa} />
    </div>
  )
}
