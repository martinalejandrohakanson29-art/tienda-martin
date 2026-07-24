import { Metadata } from "next"
import { obtenerSesionesConteo } from "@/app/actions/control-stock"
import { ControlStockResultadosClient } from "./resultados-client"

export const metadata: Metadata = {
  title: "Control de Stock | ERP",
  description: "Revisar, editar y aplicar los conteos físicos de stock",
}

export default async function ControlStockResultadosPage() {
  const res = await obtenerSesionesConteo()
  const sesiones = res.success ? res.data! : []

  return <ControlStockResultadosClient sesionesIniciales={sesiones} />
}
