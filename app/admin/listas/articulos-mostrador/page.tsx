import { obtenerArticulosParaListas, obtenerProveedoresParaListas } from "@/app/actions/listas"
import ArticulosClient from "./articulos-client"

export const metadata = {
  title: "Artículos Mostrador - Sistema Revolución Motos",
  description: "Gestión de productos de venta",
}

export default async function ArticulosMostradorPage() {
  // Traemos los datos directamente desde el servidor antes de renderizar
  const [response, proveedoresResponse] = await Promise.all([
    obtenerArticulosParaListas(),
    obtenerProveedoresParaListas()
  ]);
  const articulos = response.success && response.data ? response.data : [];
  const proveedores = proveedoresResponse.success && proveedoresResponse.data ? proveedoresResponse.data : [];

  return (
    // Contenedor principal a pantalla completa
    <div className="h-screen w-full overflow-hidden bg-slate-50/30">
      <ArticulosClient articulosIniciales={articulos} proveedores={proveedores} />
    </div>
  )
}
