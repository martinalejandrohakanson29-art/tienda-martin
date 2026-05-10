import { obtenerProveedores, obtenerMovimientosProveedor } from "@/app/actions/listas";
import GestionFondosClient from "@/components/gestion-fondos-client";

export const metadata = {
  title: "Gestionar Pagos - ERP Revolución Motos",
};

export default async function PagosPage() {
  const [proveedoresRes, movimientosRes] = await Promise.all([
    obtenerProveedores(),
    obtenerMovimientosProveedor(),
  ]);
  const proveedores = proveedoresRes.success && proveedoresRes.data ? proveedoresRes.data : [];
  const movimientos = movimientosRes.success && movimientosRes.data
    ? movimientosRes.data.filter(m => m.tipo === "HABER").slice(0, 5)
    : [];

  return (
    <div className="w-full min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <GestionFondosClient 
        type="PAGO" 
        proveedores={proveedores} 
        recentMovimientos={movimientos}
      />
    </div>
  );
}

