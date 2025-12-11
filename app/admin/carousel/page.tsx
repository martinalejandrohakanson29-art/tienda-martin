import { getCarouselItems } from "@/app/actions/carousel"
import { getConfig } from "@/app/actions/config" // 👈 Importamos esto
import CarouselClient from "./carousel-client"

export const dynamic = "force-dynamic"

export default async function AdminCarouselPage() {
    const items = await getCarouselItems()
    const config = await getConfig() // 👈 Obtenemos la config

    // Serializamos ambos
    const itemsJson = JSON.parse(JSON.stringify(items))
    const configJson = JSON.parse(JSON.stringify(config))
    
    // 👇 Pasamos la config al cliente
    return <CarouselClient initialItems={itemsJson} initialConfig={configJson} />
}
