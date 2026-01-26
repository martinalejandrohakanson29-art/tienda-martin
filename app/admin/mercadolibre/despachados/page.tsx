// app/admin/mercadolibre/despachados/page.tsx
import { DespachadosClient } from "./despachados-client"

export const dynamic = "force-dynamic"

export default function DespachadosPage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Pedidos Preparados</h2>
                    <p className="text-muted-foreground">Reporte diario de pedidos listos para colecta.</p>
                </div>
            </div>
            
            <DespachadosClient />
        </div>
    )
}
