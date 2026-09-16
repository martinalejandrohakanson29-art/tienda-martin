import { requireAdmin } from "@/lib/auth-guard"
import { listarFrases } from "@/app/actions/frases-bot"
import { FrasesClient } from "./frases-client"

export const dynamic = "force-dynamic"

export default async function FrasesPage() {
    await requireAdmin()
    const { existeTabla, frases } = await listarFrases()

    return (
        <div className="container mx-auto py-6 max-w-4xl space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Letra de la Casa</h1>
                <p className="text-muted-foreground text-sm">
                    Cómo queremos que el bot diga cada momento de la venta. Cuando llega a un momento que tiene
                    frases cargadas, se las ofrece como registro y elige una para adaptarla. Un momento sin frases
                    lo redacta con su voz, como hasta ahora.
                </p>
                <p className="text-muted-foreground text-xs mt-2">
                    Esto es redacción, no reglas: lo que el bot tiene que <em>hacer</em> en un caso puntual se carga
                    en Situaciones. Los cambios entran en menos de un minuto, sin deploy.
                </p>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 mt-3">
                    <strong className="text-slate-800">Acá van palabras, no datos.</strong> Si la frase tiene un
                    hecho adentro (un plazo, un monto, un transportista, la dirección, los meses de garantía), ese
                    dato va en <em>Base de Conocimiento → Info del Negocio</em> o en el catálogo, no acá. Cargado
                    en los dos lados, el día que cambie te quedan dos verdades distintas y el bot sigue diciendo la
                    vieja. El precio y los links el bot siempre los saca del dato oficial, nunca de estas frases.
                </div>
            </div>

            {!existeTabla && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    La tabla <code>chat_frases</code> todavía no existe. Corré una vez{" "}
                    <code>n8n-workflows/chat-frases.sql</code> en la base. Mientras tanto el bot redacta todos los
                    momentos con su voz.
                </div>
            )}

            <FrasesClient frasesIniciales={frases} habilitado={existeTabla} />
        </div>
    )
}
