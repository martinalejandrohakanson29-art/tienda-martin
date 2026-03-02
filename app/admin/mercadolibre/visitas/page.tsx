// app/admin/mercadolibre/visitas/page.tsx
import { Metadata } from "next"
import VisitasClient from "./visitas-client"
import { getVisitasComparativas } from "@/app/actions/visitas"

export const metadata: Metadata = {
  title: "Visitas MercadoLibre",
  description: "Monitor de visitas y estadísticas de productos",
}

export default async function VisitasPage() {
  // Estas serán las fechas que se cargan por defecto al abrir la página
  const initialR1 = { 
    from: '2026-01-01', 
    to: '2026-01-17' 
  };
  
  const initialR2 = { 
    from: '2026-02-01', 
    to: '2026-02-17' 
  };

  // Traemos los datos iniciales desde el servidor
  const { comparativa } = await getVisitasComparativas(initialR1, initialR2);

  return (
    <div className="flex h-full flex-1 flex-col space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-blue-700">
            Comparativa de Visitas
          </h2>
          <p className="text-muted-foreground text-sm">
            Selecciona los rangos de fechas para comparar el rendimiento de tus publicaciones.
          </p>
        </div>
      </div>
      
      {/* Pasamos los datos iniciales al componente cliente */}
      <VisitasClient 
        initialData={comparativa} 
        initialR1={initialR1} 
        initialR2={initialR2} 
      />
    </div>
  )
}
