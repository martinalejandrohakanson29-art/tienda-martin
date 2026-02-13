// app/admin/mercadolibre/preparacion/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { PreparacionClient } from "./preparacion-client"
import { Button } from "@/components/ui/button" // Importamos el botón
import { ArrowLeft } from "lucide-react" // Importamos el icono de volver
import Link from "next/link" // Importamos Link para la navegación

export default async function PreparacionPage() {
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Header actualizado con botón Volver */}
            <div className="p-3 bg-white border-b sticky top-0 z-10 shadow-sm flex items-center gap-4">
                <Link href="/admin/mercadolibre">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex flex-col gap-0.5">
                    <h1 className="text-lg font-bold text-slate-800">Preparación de Pedidos</h1>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Revolución Motos - Auditoría</p>
                </div>
            </div>
            
            <div className="p-3">
                <PreparacionClient initialEnvios={envios || []} />
            </div>
        </div>
    )
}
