import { getVentasWeb } from "@/app/actions/ventas-web"
import VentasWebClient from "./ventas-web-client"

export const dynamic = "force-dynamic"

export default async function VentasWebPage() {
    // 1. Buscamos las ventas en la base de datos
    const { ventas } = await getVentasWeb()
    return <VentasWebClient ventas={ventas} />
}
