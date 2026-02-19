import VisitasClient from "./visitas-client";

export default function VisitasPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Análisis de Tráfico</h2>
      </div>
      <div className="grid gap-4">
        <VisitasClient />
      </div>
    </div>
  );
}
