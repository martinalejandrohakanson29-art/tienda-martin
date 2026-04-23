import { Suspense } from "react"
import { obtenerPedidosCompra } from "@/app/actions/compras"
import { PedidosCompraClient } from "./pedidos-compra-client"
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
    <div className="flex-1 space-y-4">
      <Suspense fallback={<div className="text-slate-500">Cargando pedidos...</div>}>
        <PedidosCompraClient initialData={pedidos} />
      </Suspense>
    </div>
  )
}
