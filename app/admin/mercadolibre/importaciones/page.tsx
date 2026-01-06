import { getSupplierProducts } from "@/app/actions/imports"
import { ImportsTable } from "./imports-table"
import { Button } from "@/components/ui/button"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function ImportacionesPage() {
    const data = await getSupplierProducts()

    return (
        <div className="flex flex-col h-screen bg-slate-50/50">
            {/* Cabecera */}
            <div className="bg-white border-b px-8 py-5 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <Link href="/admin/mercadolibre">
                        <Button variant="outline" size="sm" className="gap-2">
                            <ArrowLeft className="h-4 w-4" /> Volver
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tablero de Importaciones</h1>
                        <p className="text-sm text-slate-500">Vista maestra de proveedores y abastecimiento</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {/* Aquí pondremos el botón para disparar n8n en el futuro */}
                    <Button disabled variant="secondary" className="gap-2 opacity-50 cursor-not-allowed">
                        <RefreshCw className="h-4 w-4" /> Sincronizar (Pronto)
                    </Button>
                </div>
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-auto p-8">
                <ImportsTable data={data} />
            </div>
        </div>
    )
}
