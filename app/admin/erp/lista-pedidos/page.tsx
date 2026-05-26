import { Suspense } from "react"
import { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { obtenerFaltantes } from "@/app/actions/articulos-faltantes"
import { ListaPedidosClient } from "./lista-pedidos-client"

export const metadata: Metadata = {
  title: "Artículos Faltantes | ERP",
  description: "Gestión de artículos faltantes a pedir",
}

export default async function ListaPedidosPage() {
  const [faltantes, session] = await Promise.all([
    obtenerFaltantes(false),
    getServerSession(authOptions),
  ])

  return (
    <div className="flex-1 space-y-4">
      <Suspense fallback={<div className="text-slate-500">Cargando...</div>}>
        <ListaPedidosClient
          faltantesIniciales={faltantes}
          usuarioNombre={session?.user?.name ?? "Usuario"}
        />
      </Suspense>
    </div>
  )
}
