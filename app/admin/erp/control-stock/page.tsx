import { Metadata } from "next"
import { obtenerProveedoresParaListas } from "@/app/actions/listas"
import { ControlStockClient } from "./control-stock-client"

export const metadata: Metadata = {
  title: "Control de Stock | ERP",
  description: "Conteo físico de stock en depósito",
}

export default async function ControlStockPage() {
  const res = await obtenerProveedoresParaListas()
  const proveedores = res.success ? res.data! : []

  return <ControlStockClient proveedoresIniciales={proveedores} />
}
