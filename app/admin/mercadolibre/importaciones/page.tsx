import { getSupplierProducts } from "@/app/actions/imports"
import { ImportsTable } from "./imports-table"
import { ImportsHeader } from "./imports-header" // <--- El nuevo componente cliente

export const dynamic = "force-dynamic"

export default async function ImportacionesPage() {
    // Seguimos trayendo los productos de la DB como antes
    const data = await getSupplierProducts()

    return (
        <div className="flex flex-col h-screen bg-slate-50/50">
            {/* Reemplazamos toda la cabecera manual por el nuevo componente */}
            <ImportsHeader /> 

            {/* Contenido de la tabla */}
            <div className="flex-1 overflow-auto p-8">
                <ImportsTable data={data} />
            </div>
        </div>
    )
}
