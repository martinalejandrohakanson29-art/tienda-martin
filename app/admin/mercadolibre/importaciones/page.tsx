import { getSupplierProducts } from "@/app/actions/imports"
import { ImportsTable } from "./imports-table"
import { ImportsHeader } from "./imports-header"

export const dynamic = "force-dynamic"

export default async function ImportacionesPage() {
    const data = await getSupplierProducts()

    return (
        // Quitamos el scroll de aquí para que la tabla lo maneje internamente
        <div className="flex flex-col h-screen bg-slate-50/50 overflow-hidden">
            <ImportsHeader /> 

            {/* Cambiamos overflow-auto por overflow-hidden */}
            <div className="flex-1 overflow-hidden p-8">
                <ImportsTable data={data} />
            </div>
        </div>
    )
}
