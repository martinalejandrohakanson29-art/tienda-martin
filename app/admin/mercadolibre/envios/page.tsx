// app/admin/mercadolibre/envios/page.tsx
import { getEtiquetasML } from "@/app/actions/envios"
import { EnviosTable } from "./envios-table"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function EnviosPage() {
    const { data: envios } = await getEtiquetasML();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/mercadolibre">
                        <Button variant="outline" size="sm" className="gap-2 border-slate-200">
                            <ArrowLeft className="h-4 w-4" />
                            Volver a Gestión
                        </Button>
                    </Link>
                    <h2 className="text-3xl font-bold tracking-tight">Gestión de Envíos</h2>
                </div>
                <div className="text-sm text-muted-foreground">
                    Total: {envios.length} ventas
                </div>
            </div>

            <EnviosTable envios={envios} />
        </div>
    )
}
