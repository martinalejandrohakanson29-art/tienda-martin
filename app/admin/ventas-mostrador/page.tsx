import { obtenerTodosLosArticulos } from "@/app/actions/ventas-mostrador"
import { obtenerPuntosVenta } from "@/app/actions/puntos-venta"
import VentasMostradorClient from "./ventas-client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export default async function VentasMostradorPage() {
  const articulos = await obtenerTodosLosArticulos();
  const session = await getServerSession(authOptions);
  const { data: puntosVenta = [] } = await obtenerPuntosVenta();

  return (
    // Configuramos el contenedor para que ocupe exactamente el alto de la pantalla
    <div className="h-screen w-full overflow-hidden">
      <VentasMostradorClient 
        articulosIniciales={articulos} 
        vendedorNombre={session?.user?.name || "Vendedor General"} 
        puntosVenta={puntosVenta}
      />
    </div>
  )
}
