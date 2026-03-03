import { obtenerTodosLosArticulos } from "@/app/actions/compras"
import ComprasClient from "./compras-client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export default async function ComprasPage() {
  const articulos = await obtenerTodosLosArticulos();
  const session = await getServerSession(authOptions);

  return (
    <div className="h-screen w-full overflow-hidden">
      <ComprasClient 
        articulosIniciales={articulos} 
        compradorNombre={session?.user?.name || "Comprador General"} 
      />
    </div>
  )
}
