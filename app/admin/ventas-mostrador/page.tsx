import { obtenerTodosLosArticulos } from "@/app/actions/ventas-mostrador"
import VentasMostradorClient from "./ventas-client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export default async function VentasMostradorPage() {
  const articulos = await obtenerTodosLosArticulos();
  const session = await getServerSession(authOptions);

  return (
    // Configuramos el contenedor para que ocupe exactamente el alto de la pantalla
    <div className="h-screen w-full overflow-hidden">
      <VentasMostradorClient 
        articulosIniciales={articulos} 
        vendedorNombre={session?.user?.name || "Vendedor General"} 
      />
    </div>
  )
}
