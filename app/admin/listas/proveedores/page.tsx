import { obtenerProveedores } from "@/app/actions/listas"
import ProveedoresClient from "./proveedores-client"

export const metadata = {
  title: "Lista de Proveedores - Sistema Revolución Motos",
  description: "Gestión de proveedores",
}

export default async function ProveedoresPage() {
  // Traemos los datos directamente desde el servidor antes de renderizar
  const response = await obtenerProveedores();
  const proveedores = response.success && response.data ? response.data : [];

  return (
    // Contenedor principal a pantalla completa
    <div className="h-screen w-full overflow-hidden bg-slate-50/30">
      <ProveedoresClient proveedoresIniciales={proveedores as any} />
    </div>
  )
}
