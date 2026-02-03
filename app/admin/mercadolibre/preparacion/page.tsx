// app/admin/mercadolibre/preparacion/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { PreparacionClient } from "./preparacion-client"

export default async function PreparacionPage() {
    // Traemos las etiquetas de la base de datos
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="p-4 bg-white border-b sticky top-0 z-10 shadow-sm flex flex-col gap-1">
                <h1 className="text-xl font-bold text-slate-800">Preparación de Pedidos</h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Revolución Motos - Auditoría</p>
            </div>
            
            <div className="p-4">
                <PreparacionClient initialEnvios={envios || []} />
            </div>
        </div>
    )
}
