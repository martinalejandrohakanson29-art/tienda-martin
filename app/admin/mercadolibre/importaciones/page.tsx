import { getSupplierProducts } from "@/app/actions/imports"
import { ImportsTable } from "./imports-table"
import { ImportsHeader } from "./imports-header"

export const dynamic = "force-dynamic"

export default async function ImportacionesPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
    const { data, lastUpdate, effectiveDays } = await getSupplierProducts(searchParams.from, searchParams.to)

    return (
        <div className="flex flex-col h-screen bg-slate-50/50 overflow-hidden">
            <ImportsHeader />

            <div className="flex-1 overflow-hidden p-8">
                <ImportsTable data={data} lastUpdate={lastUpdate} effectiveDays={effectiveDays} />
            </div>
        </div>
    )
}
