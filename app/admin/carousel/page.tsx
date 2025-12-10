import { getCarouselItems } from "@/app/actions/carousel"
import CarouselClient from "./carousel-client"

export const dynamic = "force-dynamic"

export default async function AdminCarouselPage() {
    const items = await getCarouselItems()
    // Convertimos a JSON puro para evitar errores de fechas
    const itemsJson = JSON.parse(JSON.stringify(items))
    
    return <CarouselClient initialItems={itemsJson} />
}
