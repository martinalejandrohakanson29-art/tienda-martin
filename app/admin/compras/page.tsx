import { obtenerTodosLosArticulos } from "@/app/actions/compras"
import ComprasClient from "./compras-client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { prisma } from "@/lib/prisma"

export default async function ComprasPage() {
  const [articulos, session, config] = await Promise.all([
    obtenerTodosLosArticulos(),
    getServerSession(authOptions),
    prisma.config.findFirst({ select: { dolarCotizacion: true } })
  ])

  return (
    <div className="h-screen w-full overflow-hidden">
      <ComprasClient
        articulosIniciales={articulos}
        compradorNombre={session?.user?.name || "Comprador General"}
        dolarCotizacion={Number(config?.dolarCotizacion ?? 1)}
      />
    </div>
  )
}
