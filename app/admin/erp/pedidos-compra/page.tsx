import { Suspense } from "react"
import { obtenerPedidosCompra } from "@/app/actions/compras"
import PedidosCompraClient from "./pedidos-compra-client"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pedidos de Compra | ERP",
  description: "Gestión de pedidos de compra a proveedores",
}

export default async function PedidosCompraPage() {
  // Obtenemos los pedidos del último mes por defecto
  const hoy = new Date()
  const haceUnMes = new Date()
  haceUnMes.setMonth(hoy.getMonth() - 1)
  
  const pedidos = await obtenerPedidosCompra(
    haceUnMes.toISOString(),
    hoy.toISOString()
  )

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-white">Pedidos de Compra</h2>
      </div>
      <Suspense fallback={<div className="text-white">Cargando pedidos...</div>}>
        <PedidosCompraClient initialData={pedidos} />
      </Suspense>
    </div>
  )
}
