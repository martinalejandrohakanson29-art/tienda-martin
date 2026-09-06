import { requireAdmin } from "@/lib/auth-guard"
import { listarSituaciones } from "@/app/actions/situaciones-bot"
import { SituacionesClient } from "./situaciones-client"

export const dynamic = "force-dynamic"

export default async function SituacionesPage() {
    await requireAdmin()
    const { existeTabla, situaciones } = await listarSituaciones()

    return (
        <div className="container mx-auto py-6 max-w-4xl space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Situaciones del Bot</h1>
                <p className="text-muted-foreground text-sm">
                    Reglas situacionales editables. El bot revisa el mensaje del cliente, y si pega con los
                    disparadores de una situación, le inyecta esa instrucción puntual (y solo esa). Agregar un
                    caso nuevo acá reemplaza a escribir un párrafo más en el prompt del sistema.
                </p>
            </div>

            {!existeTabla && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    La tabla <code>chat_situaciones</code> todavía no existe. Corré una vez{" "}
                    <code>n8n-workflows/chat-situaciones.sql</code> en la base. Mientras tanto el bot usa un
                    set mínimo de situaciones embebido en el código.
                </div>
            )}

            <SituacionesClient situacionesIniciales={situaciones} habilitado={existeTabla} />
        </div>
    )
}
