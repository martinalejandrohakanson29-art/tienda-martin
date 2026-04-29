import { obtenerProveedores } from "@/app/actions/erp";
import GestionFondosClient from "@/components/gestion-fondos-client";

export const metadata = {
  title: "Gestionar Pagos - ERP Revolución Motos",
};

export default async function PagosPage() {
  const proveedores = await obtenerProveedores();

  return (
    <div className="w-full min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <GestionFondosClient type="PAGO" proveedores={proveedores} />
    </div>
  );
}
