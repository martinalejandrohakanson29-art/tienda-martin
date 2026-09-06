"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Plus, Save, Trash2, X } from "lucide-react"
import {
    guardarSituacion,
    eliminarSituacion,
    listarSituaciones,
    type SituacionRow
} from "@/app/actions/situaciones-bot"

interface BorradorSituacion {
    id?: number
    clave: string
    titulo: string
    disparadoresRaw: string
    instruccion: string
    activo: boolean
    orden: number
}

function rowABorrador(r: SituacionRow): BorradorSituacion {
    return {
        id: r.id,
        clave: r.clave,
        titulo: r.titulo,
        disparadoresRaw: (r.disparadores || []).join(", "),
        instruccion: r.instruccion,
        activo: r.activo,
        orden: r.orden
    }
}

const NUEVO: BorradorSituacion = {
    clave: "",
    titulo: "",
    disparadoresRaw: "",
    instruccion: "",
    activo: true,
    orden: 100
}

export function SituacionesClient({
    situacionesIniciales,
    habilitado
}: {
    situacionesIniciales: SituacionRow[]
    habilitado: boolean
}) {
    const [situaciones, setSituaciones] = useState<SituacionRow[]>(situacionesIniciales)
    const [editando, setEditando] = useState<BorradorSituacion | null>(null)
    const [guardando, setGuardando] = useState(false)

    async function recargar() {
        const res = await listarSituaciones()
        setSituaciones(res.situaciones)
    }

    async function handleGuardar() {
        if (!editando) return
        setGuardando(true)
        try {
            const res = await guardarSituacion(editando)
            if (res.success) {
                toast.success("Situación guardada.")
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
        if (!confirm("Eliminar esta situación?")) return
        const res = await eliminarSituacion(id)
        if (res.success) {
            toast.success("Eliminada.")
            await recargar()
        } else {
            toast.error(res.error || "No se pudo eliminar.")
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button
                    size="sm"
                    disabled={!habilitado || !!editando}
                    onClick={() => setEditando({ ...NUEVO })}
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Nueva situación
                </Button>
            </div>

            {editando && (
                <Card className="border-cyan-300">
                    <CardContent className="py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-700">Clave (identificador corto)</label>
                                <Input
                                    value={editando.clave}
                                    onChange={(e) => setEditando({ ...editando, clave: e.target.value })}
                                    placeholder="descuento_unitario"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-700">Título</label>
                                <Input
                                    value={editando.titulo}
                                    onChange={(e) => setEditando({ ...editando, titulo: e.target.value })}
                                    placeholder="Pide descuento en compra unitaria"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-700">
                                Disparadores (palabras o frases, separadas por coma o salto de línea)
                            </label>
                            <Textarea
                                rows={2}
                                value={editando.disparadoresRaw}
                                onChange={(e) => setEditando({ ...editando, disparadoresRaw: e.target.value })}
                                placeholder="me haces descuento, algun descuento, en efectivo cuanto"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-700">
                                Instrucción para el bot (se inyecta tal cual cuando la situación pega)
                            </label>
                            <Textarea
                                rows={4}
                                value={editando.instruccion}
                                onChange={(e) => setEditando({ ...editando, instruccion: e.target.value })}
                                placeholder="Los precios son finales y oficiales con envío gratis incluido. Respondé con firmeza..."
                            />
                        </div>

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
                            <label className="flex items-center gap-2 text-sm">
                                Orden
                                <Input
                                    type="number"
                                    value={editando.orden}
                                    onChange={(e) => setEditando({ ...editando, orden: parseInt(e.target.value, 10) || 100 })}
                                    className="w-20 h-8"
                                />
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

            <div className="space-y-2">
                {situaciones.length === 0 && (
                    <p className="text-sm text-muted-foreground">No hay situaciones cargadas.</p>
                )}
                {situaciones.map((s) => (
                    <Card key={s.id} className={s.activo ? "" : "opacity-60"}>
                        <CardContent className="py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm">{s.titulo}</span>
                                        <Badge variant="outline" className="text-[10px]">{s.clave}</Badge>
                                        {!s.activo && <Badge variant="secondary" className="text-[10px]">inactiva</Badge>}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Disparadores: {(s.disparadores || []).join(" · ")}
                                    </p>
                                    <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{s.instruccion}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <Button variant="ghost" size="sm" onClick={() => setEditando(rowABorrador(s))}>
                                        Editar
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleEliminar(s.id)}>
                                        <Trash2 className="h-4 w-4 text-rose-600" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
