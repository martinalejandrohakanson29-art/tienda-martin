// app/admin/mercadolibre/visitas/page.tsx
import { Metadata } from "next"
import VisitasClient from "./visitas-client"
import { getVisitasComparativas } from "@/app/actions/visitas"

export const metadata: Metadata = {
  title: "Visitas MercadoLibre",
  description: "Monitor de visitas y estadísticas de productos",
}

export default async function VisitasPage() {
  // Calculamos los rangos de fechas: últimos 7 días vs los 7 anteriores
  const hoy = new Date();
  const hace7Dias = new Date();
  hace7Dias.setDate(hoy.getDate() - 7);
  
  const hace14Dias = new Date();
  hace14Dias.setDate(hoy.getDate() - 14);

  // Periodo 1: (hace 14 días al día 7)
  const r1 = { 
    from: hace14Dias.toISOString().split('T')[0], 
    to: hace7Dias.toISOString().split('T')[0] 
  };
  
  // Periodo 2: (hace 7 días a hoy)
  const r2 = { 
    from: hace7Dias.toISOString().split('T')[0], 
    to: hoy.toISOString().split('T')[0] 
  };

  // Traemos la comparativa real de la base de datos
  const { comparativa } = await getVisitasComparativas(r1, r2);

  return (
    <div className="hidden h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            MercadoLibre Visitas
          </h2>
          <p className="text-muted-foreground">
            Comparativa de rendimiento: Últimos 7 días vs Periodo Anterior.
          </p>
        </div>
      </div>
      
      {/* Pasamos los datos exactos que espera el cliente */}
      <VisitasClient data={comparativa} />
    </div>
  )
}
