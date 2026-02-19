import { Metadata } from "next"
import VisitasClient from "./visitas-client"

export const metadata: Metadata = {
  title: "Visitas MercadoLibre",
  description: "Monitor de visitas y estadísticas de productos",
}

// Aquí simulamos o traemos los datos.
// En el futuro, reemplaza "getData" con tu llamada real a la base de datos o API.
async function getData() {
  // TODO: Reemplazar esto con tu lógica real de base de datos (Prisma) o API de ML
  // const productos = await prisma.producto.findMany(...)
  
  // Retornamos array vacío para que el build funcione por ahora
  return [] 
}

export default async function VisitasPage() {
  const data = await getData()

  return (
    <div className="hidden h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            MercadoLibre Visitas
          </h2>
          <p className="text-muted-foreground">
            Listado de publicaciones y seguimiento de métricas.
          </p>
        </div>
      </div>
      
      {/* Aquí pasamos la data obligatoria al componente cliente */}
      <VisitasClient data={data} />
    </div>
  )
}
