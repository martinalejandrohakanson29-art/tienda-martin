"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Plus, Save, Trash2, X } from "lucide-react"
import {
    guardarFrase,
    eliminarFrase,
    alternarFrase,
    listarFrases,
    type FraseRow
} from "@/app/actions/frases-bot"
// Del módulo puro, no del index: ese arrastra Prisma al bundle del navegador.
import { MOMENTOS, rellenarFrase } from "@/bot-agente/frases/momentos"

interface Borrador {
    id?: number
    momento: string
    frase: string
    activo: boolean
    orden: number
}

/** Datos de ejemplo para la vista previa: los mismos para todos los momentos. */
const EJEMPLO = { moto: "Gilera Smash 110", kit: "Combo 110 a 120 recorrido corto", precio: "$99.990" }

function rowABorrador(r: FraseRow): Borrador {
    return { id: r.id, momento: r.momento, frase: r.frase, activo: r.activo, orden: r.orden }
}

export function FrasesClient({
    frasesIniciales,
    habilitado
}: {
    frasesIniciales: FraseRow[]
    habilitado: boolean
}) {
    const [frases, setFrases] = useState<FraseRow[]>(frasesIniciales)
    const [editando, setEditando] = useState<Borrador | null>(null)
    const [guardando, setGuardando] = useState(false)

    const porMomento = useMemo(() => {
        const mapa = new Map<string, FraseRow[]>()
        for (const f of frases) {
            const actuales = mapa.get(f.momento) || []
            actuales.push(f)
            mapa.set(f.momento, actuales)
        }
        return mapa
    }, [frases])

    async function recargar() {
        const res = await listarFrases()
        setFrases(res.frases)
    }

    async function handleGuardar() {
        if (!editando) return
        setGuardando(true)
        try {
            const res = await guardarFrase(editando)
            if (res.success) {
                toast.success("Frase guardada. El bot la toma en menos de un minuto.")
                setEditando(null)
                await recargar()
            } else {
                toast.error(res.error || "No se pudo guardar.")
            }
        } finally {
            setGuardando(false)
        }
    }

    async function handleEliminar(id: number) {
        if (!confirm("Eliminar esta frase?")) return
        const res = await eliminarFrase(id)
        if (res.success) {
            toast.success("Eliminada.")
            await recargar()
        } else {
            toast.error(res.error || "No se pudo eliminar.")
        }
    }

    async function handleAlternar(f: FraseRow) {
        const res = await alternarFrase(f.id, !f.activo)
        if (res.success) {
            setFrases((prev) => prev.map((x) => (x.id === f.id ? { ...x, activo: !f.activo } : x)))
        } else {
            toast.error(res.error || "No se pudo cambiar.")
        }
    }

    const momentoEditado = MOMENTOS.find((m) => m.momento === editando?.momento)

    return (
        <div className="space-y-6">
            {editando && (
                <Card className="border-cyan-300">
                    <CardContent className="py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <label className="text-xs font-semibold text-slate-700">Momento de la venta</label>
                                <select
                                    value={editando.momento}
                                    onChange={(e) => setEditando({ ...editando, momento: e.target.value })}
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    {MOMENTOS.map((m) => (
                                        <option key={m.momento} value={m.momento}>
                                            {m.titulo}
                                        </option>
                                    ))}
                                </select>
                                {momentoEditado && (
                                    <p className="text-xs text-slate-500 mt-1">{momentoEditado.cuando}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-700">Orden</label>
                                <Input
                                    type="number"
                                    value={editando.orden}
                                    onChange={(e) =>
                                        setEditando({ ...editando, orden: parseInt(e.target.value, 10) || 100 })
                                    }
                                    className="h-9"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-700">Cómo lo decimos</label>
                            <Textarea
                                rows={2}
                                maxLength={300}
                                value={editando.frase}
                                onChange={(e) => setEditando({ ...editando, frase: e.target.value })}
                                placeholder={momentoEditado?.ejemplo || "Este kit va perfecto para tu {moto}"}
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                {editando.frase.trim().length}/300
                                {momentoEditado && momentoEditado.placeholders.length > 0 && (
                                    <>
                                        {" · "}Podés usar{" "}
                                        {momentoEditado.placeholders.map((p, i) => (
                                            <span key={p}>
                                                {i > 0 && " "}
                                                <code className="px-1 rounded bg-slate-100 text-[11px]">{p}</code>
                                            </span>
                                        ))}
                                    </>
                                )}
                            </p>
                        </div>

                        {editando.frase.trim() && (
                            <div>
                                <label className="text-xs font-semibold text-slate-700">
                                    Vista previa (con datos de ejemplo)
                                </label>
                                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-slate-800">
                                    {rellenarFrase(editando.frase, EJEMPLO)}
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    El bot no la copia palabra por palabra: la usa como registro y la adapta a la
                                    charla.
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editando.activo}
                                    onChange={(e) => setEditando({ ...editando, activo: e.target.checked })}
                                    className="h-4 w-4"
                                />
                                Activa
                            </label>
                            <div className="ml-auto flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setEditando(null)}>
                                    <X className="h-4 w-4 mr-1" />
                                    Cancelar
                                </Button>
                                <Button size="sm" onClick={handleGuardar} disabled={guardando}>
                                    <Save className="h-4 w-4 mr-1" />
                                    {guardando ? "Guardando..." : "Guardar"}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {MOMENTOS.map((m) => {
                const delMomento = porMomento.get(m.momento) || []
                const activas = delMomento.filter((f) => f.activo).length
                return (
                    <section key={m.momento} className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="font-semibold text-sm">{m.titulo}</h2>
                                    {activas === 0 ? (
                                        <Badge variant="secondary" className="text-[10px]">
                                            el bot usa su voz
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px]">
                                            {activas} {activas === 1 ? "frase" : "frases"}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">{m.cuando}</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                disabled={!habilitado || !!editando}
                                onClick={() =>
                                    setEditando({
                                        momento: m.momento,
                                        frase: "",
                                        activo: true,
                                        orden: (delMomento.length + 1) * 10
                                    })
                                }
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Agregar
                            </Button>
                        </div>

                        {delMomento.length === 0 ? (
                            <p className="text-xs text-slate-400 pl-1">
                                Sin frases cargadas: el bot redacta este momento con su voz, como hasta ahora.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {delMomento.map((f) => (
                                    <Card key={f.id} className={f.activo ? "" : "opacity-60"}>
                                        <CardContent className="py-2.5">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm text-slate-800 min-w-0">
                                                    &ldquo;{f.frase}&rdquo;
                                                </p>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-xs"
                                                        onClick={() => handleAlternar(f)}
                                                    >
                                                        {f.activo ? "Apagar" : "Prender"}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEditando(rowABorrador(f))}
                                                    >
                                                        Editar
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEliminar(f.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-rose-600" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </section>
                )
            })}
        </div>
    )
}
