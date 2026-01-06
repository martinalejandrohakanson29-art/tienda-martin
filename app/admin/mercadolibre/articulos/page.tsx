import { getArticulos } from "@/app/actions/costos";
import { ArticulosTable } from "./articulos-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function ArticulosPage() {
  const data = await getArticulos();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">Artículos Individuales</h2>
      </div>
      
      <p className="text-muted-foreground">
        Consulta y busca costos base de repuestos y piezas.
      </p>

      <ArticulosTable data={data} />
    </div>
  );
}
