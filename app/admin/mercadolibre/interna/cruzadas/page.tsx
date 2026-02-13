import { getTransferenciasCruzadas } from "@/app/actions/cruzadas";
import CruzadasClient from "./cruzadas-client";

export const dynamic = "force-dynamic";

export default async function CruzadasPage() {
  const data = await getTransferenciasCruzadas();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transferencias Cruzadas</h1>
        <p className="text-muted-foreground">
          Listado de comprobantes detectados por WhatsApp para validación interna.
        </p>
      </div>

      <CruzadasClient initialData={data} />
    </div>
  );
}
