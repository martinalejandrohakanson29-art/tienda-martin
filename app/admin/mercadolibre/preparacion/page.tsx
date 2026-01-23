// app/admin/mercadolibre/preparacion/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { PreparacionClient } from "./preparacion-client"

export default async function PreparacionPage() {
    // Reutilizamos tu acción existente que ya trae las etiquetas y sus agregados
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="p-4 bg-white border-b sticky top-0 z-10 shadow-sm">
                <h1 className="text-xl font-bold text-slate-800">Preparación de Pedidos</h1>
                <p className="text-xs text-slate-500 font-medium">Prioridad: Escaneo y Fotos</p>
            </div>
            
            <div className="p-4">
                <PreparacionClient initialEnvios={envios} />
            </div>
        </div>
    )
}
