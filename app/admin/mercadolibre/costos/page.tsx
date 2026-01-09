// app/admin/mercadolibre/costos/page.tsx
import { getCostosKits } from "@/app/actions/costos";
import { CostosTable } from "./costos-table";

export default async function CostosMLPage() {
  const data = await getCostosKits();

  // Cambiamos el diseño a flex-col h-full para que la tabla use todo el alto
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Costos de Kits ML</h2>
      </div>
      <div className="flex-1 overflow-hidden">
        <CostosTable data={data} />
      </div>
    </div>
  );
}
