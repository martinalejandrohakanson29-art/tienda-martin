import { Suspense } from "react"
import { Metadata } from "next"
import { obtenerPreformasAction } from "@/app/actions/preformas"
import { ImportacionesClient } from "./importaciones-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Importaciones - Preformas | ERP",
  description: "Carga y control de preformas de importación",
}

export default async function ImportacionesPage() {
  const res = await obtenerPreformasAction()
  const initialPreformas = res.success ? res.data : []

  return (
    <div className="w-full min-h-screen pb-12">
      <Suspense fallback={<div className="p-8 text-slate-500">Cargando importaciones...</div>}>
        <ImportacionesClient initialData={initialPreformas} />
      </Suspense>
    </div>
  )
}
