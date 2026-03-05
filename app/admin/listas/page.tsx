import { obtenerArticulosParaListas } from "@/app/actions/listas"
import ListasClient from "./listas-client"

export const metadata = {
  title: "Bases de Datos y Listas - Sistema Revolución Motos",
  description: "Consulta y edición de listas maestras del sistema",
}

export default async function ListasPage() {
  // Traemos los datos directamente desde el servidor antes de renderizar
  const response = await obtenerArticulosParaListas();
  const articulos = response.success && response.data ? response.data : [];

  return (
    // Contenedor principal a pantalla completa
    <div className="h-screen w-full overflow-hidden bg-slate-50/30">
      <ListasClient articulosIniciales={articulos} />
    </div>
  )
}
