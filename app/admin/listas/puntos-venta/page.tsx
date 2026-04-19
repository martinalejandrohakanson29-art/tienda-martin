import { obtenerPuntosVenta } from "@/app/actions/puntos-venta"
import PuntosVentaClient from "./puntos-venta-client"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Puntos de Venta - Sistema Revolución Motos",
  description: "Gestión de puntos de venta para Ventas Mostrador",
}

export default async function PuntosVentaPage() {
  const { success, data: puntos = [] } = await obtenerPuntosVenta()

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <Link href="/admin/listas" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Puntos de Venta</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Gestión de orígenes</p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <PuntosVentaClient puntosIniciales={success ? puntos : []} />
      </div>
    </div>
  )
}
