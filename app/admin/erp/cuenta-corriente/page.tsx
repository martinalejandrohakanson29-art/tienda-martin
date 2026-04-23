import { obtenerProveedores } from "@/app/actions/listas";
import CuentaCorrienteClient from "./cc-client";

export const metadata = {
  title: "Cuenta Corriente - Sistema Revolución Motos",
  description: "Estado de cuentas corrientes de proveedores",
};

export default async function CuentaCorrientePage() {
  const response = await obtenerProveedores();
  const proveedores = response.success && response.data ? response.data : [];

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#0b1118]">
      <CuentaCorrienteClient proveedoresIniciales={proveedores as any} />
    </div>
  );
}
