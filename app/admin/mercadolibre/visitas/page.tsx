// app/admin/mercadolibre/visitas/page.tsx
import { Metadata } from "next"
import VisitasClient from "./visitas-client"
import { getVisitasComparativas } from "@/app/actions/visitas"

export const metadata: Metadata = {
  title: "Visitas MercadoLibre",
  description: "Monitor de visitas y estadísticas de productos",
}

export default async function VisitasPage() {
  // 1. Definimos los rangos de fecha para comparar (Semana actual vs Semana anterior)
  const hoy = new Date();
  const hace7Dias = new Date();
  hace7Dias.setDate(hoy.getDate() - 7);
  
  const hace14Dias = new Date();
  hace14Dias.setDate(hoy.getDate() - 14);

  // Periodo 1: De hace 14 días a hace 7 días
  const r1 = { 
    from: hace14Dias.toISOString().split('T')[0], 
    to: hace7Dias.toISOString().split('T')[0] 
  };
  
  // Periodo 2: De hace 7 días a hoy
  const r2 = { 
    from: hace7Dias.toISOString().split('T')[0], 
    to: hoy.toISOString().split('T')[0] 
  };

  // 2. Llamamos a tu acción que ya tiene la lógica de Prisma
  const { comparativa } = await getVisitasComparativas(r1, r2);

  return (
    <div className="hidden h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            MercadoLibre Visitas
          </h2>
          <p className="text-muted-foreground">
            Comparativa de rendimiento: Últimos 7 días vs. Periodo anterior.
          </p>
        </div>
      </div>
      
      {/* Pasamos los datos reales al componente cliente */}
      <VisitasClient data={comparativa} />
    </div>
  )
}
