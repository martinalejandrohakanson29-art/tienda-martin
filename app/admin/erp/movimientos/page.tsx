import { obtenerMovimientosProveedor } from "@/app/actions/listas";
import MovimientosClient from "./movimientos-client";

export const metadata = {
  title: "Listado de Movimientos - ERP Revolución Motos",
  description: "Historial de movimientos de saldos por proveedor",
};

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: { proveedor?: string };
}) {
  const result = await obtenerMovimientosProveedor(searchParams.proveedor);
  
  return (
    <div className="w-full min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <MovimientosClient 
        movimientosIniciales={result.success && result.data ? result.data : []} 
        initialProveedorId={searchParams.proveedor}
      />
    </div>
  );
}
