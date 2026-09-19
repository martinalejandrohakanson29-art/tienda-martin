import { requireAdmin } from "@/lib/auth-guard"
import { obtenerResumenVerificador, listarChequeosMarcados } from "@/app/actions/verificador-grounding"
import { VerificadorClient } from "./verificador-client"

export const dynamic = "force-dynamic"

export default async function VerificadorPage() {
    await requireAdmin()
    const [resumen, chequeos] = await Promise.all([
        obtenerResumenVerificador(),
        listarChequeosMarcados({ soloPendientes: true })
    ])

    return (
        <div className="container mx-auto max-w-4xl space-y-4 py-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Control de Calidad del Bot</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Un segundo par de ojos que mira cada mensaje justo antes de que salga y avisa si el bot está
                    afirmando algo que no le dio la base: un precio, una compatibilidad, qué trae un kit, un plazo.
                </p>
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                    <strong className="text-slate-800">No decide nada de la venta.</strong> La compatibilidad, el
                    precio y la composición se siguen resolviendo contra el catálogo, como siempre. Esto solo mira lo
                    que el bot <em>ya escribió</em> y lo compara con los datos que tenía a mano. Por eso un mensaje
                    marcado no quiere decir que esté mal: quiere decir que hay que leerlo.
                </div>
            </div>

            <VerificadorClient resumen={resumen} chequeos={chequeos} />
        </div>
    )
}
