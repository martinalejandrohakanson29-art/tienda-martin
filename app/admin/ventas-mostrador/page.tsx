import { obtenerTodosLosArticulos } from "@/app/actions/ventas-mostrador"
import VentasMostradorClient from "./ventas-client"
import { ShoppingBag } from "lucide-react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export default async function VentasMostradorPage() {
  const articulos = await obtenerTodosLosArticulos();
  const session = await getServerSession(authOptions);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <ShoppingBag className="w-8 h-8 text-primary" />
            Venta Mostrador
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestión de ventas presenciales - Revolución Motos.
          </p>
        </div>
      </div>

      <VentasMostradorClient 
        articulosIniciales={articulos} 
        vendedorNombre={session?.user?.name || "Vendedor General"} 
      />
    </div>
  )
}
