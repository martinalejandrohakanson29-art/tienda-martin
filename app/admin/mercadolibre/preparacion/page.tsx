// app/admin/mercadolibre/preparacion/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { PreparacionClient } from "./preparacion-client"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function PreparacionPage() {
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="min-h-screen bg-slate-50 pb-20 overflow-x-hidden">
            {/* Encabezado con botón Volver */}
            <div className="p-4 bg-white border-b sticky top-0 z-20 shadow-sm flex items-center gap-4">
                <Link href="/admin/mercadolibre">
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100">
                        <ArrowLeft className="h-5 w-5 text-slate-600" />
                    </Button>
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-slate-800">Preparación de Pedidos</h1>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Revolución Motos - Auditoría</p>
                </div>
            </div>
            
            {/* Contenedor centrado y alineado con ancho total controlado */}
            <div className="w-full max-w-3xl mx-auto p-4 md:p-6">
                <PreparacionClient initialEnvios={envios || []} />
            </div>
        </div>
    )
}
