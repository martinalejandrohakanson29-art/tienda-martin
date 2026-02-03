// app/admin/mercadolibre/preparacion/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { PreparacionClient } from "./preparacion-client"

export default async function PreparacionPage() {
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="p-3 bg-white border-b sticky top-0 z-10 shadow-sm flex flex-col gap-0.5">
                <h1 className="text-lg font-bold text-slate-800">Preparación de Pedidos</h1>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Revolución Motos - Auditoría</p>
            </div>
            
            <div className="p-3">
                <PreparacionClient initialEnvios={envios || []} />
            </div>
        </div>
    )
}
