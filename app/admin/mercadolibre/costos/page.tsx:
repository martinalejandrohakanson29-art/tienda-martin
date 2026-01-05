import { getCostosKits } from "@/app/actions/costos";
import { CostosTable } from "./costos-table";

export default async function CostosMLPage() {
  const data = await getCostosKits();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Costos de Kits ML</h2>
      </div>
      <CostosTable data={data} />
    </div>
  );
}
