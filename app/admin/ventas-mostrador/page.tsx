import { obtenerTodosLosArticulos } from "@/app/actions/ventas-mostrador"
import VentasMostradorClient from "./ventas-client"

export default async function VentasMostradorPage() {
  // 1. Cargamos todos los artículos apenas el usuario entra a la página
  const articulos = await obtenerTodosLosArticulos();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Venta de Mostrador</h1>
        <p className="text-muted-foreground">Buscador instantáneo de repuestos.</p>
      </header>

      {/* 2. Le pasamos los artículos al componente que vive en el navegador */}
      <VentasMostradorClient articulosIniciales={articulos} />
    </div>
  )
}
