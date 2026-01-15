import { getSupplierProducts } from "@/app/actions/imports"
import { ImportsTable } from "./imports-table"
import { ImportsHeader } from "./imports-header"

export const dynamic = "force-dynamic"

export default async function ImportacionesPage() {
    // 👇 Cambiamos esto para recibir ambos datos
    const { data, lastUpdate } = await getSupplierProducts()

    return (
        <div className="flex flex-col h-screen bg-slate-50/50 overflow-hidden">
            <ImportsHeader /> 

            <div className="flex-1 overflow-hidden p-8">
                {/* 👇 Pasamos data y la fecha de actualización a la tabla */}
                <ImportsTable data={data} lastUpdate={lastUpdate} />
            </div>
        </div>
    )
}
