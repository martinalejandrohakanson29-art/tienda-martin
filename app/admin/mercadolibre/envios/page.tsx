// app/admin/mercadolibre/envios/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { EnviosTable } from "./envios-table"

export default async function EnviosPage() {
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Gestión de Envíos</h2>
                <div className="text-sm text-muted-foreground">
                    Total: {envios.length} envíos cargados
                </div>
            </div>
            
            <EnviosTable envios={envios} />
        </div>
    )
}
