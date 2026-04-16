import { obtenerPacks } from "@/app/actions/listas"
import PacksClient from "./packs-client"

export const metadata = {
  title: "Gestión de Packs - Sistema Revolución Motos",
  description: "Creación y administración de combinaciones",
}

export default async function PacksPage() {
  const response = await obtenerPacks();
  const packs = response.success && response.data ? response.data : [];

  return (
    // Contenedor principal a pantalla completa
    <div className="h-screen w-full overflow-hidden bg-slate-50/30">
      <PacksClient />
    </div>
  )
}