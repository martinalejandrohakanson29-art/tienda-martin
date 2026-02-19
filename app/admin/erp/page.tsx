import { ErpDashboard } from "@/components/erp-dashboard"

export const metadata = {
  title: "ERP - Sistema Revolución Motos",
  description: "Panel de control centralizado",
}

export default function ErpPage() {
  return (
    <div className="w-full h-full pb-8">
        {/* Aquí llamamos al componente que creaste anteriormente */}
        <ErpDashboard />
    </div>
  )
}
