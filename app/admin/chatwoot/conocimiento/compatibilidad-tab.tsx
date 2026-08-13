"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle } from "lucide-react"

import {
    guardarCompatibilidad,
    eliminarCompatibilidad,
    type Compatibilidad,
    type CompatibilidadInput,
} from "@/app/actions/compatibilidades"
import type { Kit } from "@/app/actions/kits-publicidad"

const FORM_VACIO: CompatibilidadInput = { modeloMoto: "", kitId: 0, compatible: true, detalle: "" }

export function CompatibilidadTab({
    itemsIniciales,
    errorInicial,
    kits,
}: {
    itemsIniciales: Compatibilidad[]
    errorInicial: string | null
    kits: Kit[]
}) {
    const [items, setItems] = useState<Compatibilidad[]>(itemsIniciales)
    const [form, setForm] = useState<CompatibilidadInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)

    const editando = form.id !== undefined
    const kitSeleccionado = kits.find((k) => k.id === form.kitId)

    const editar = (item: Compatibilidad) => {
        setForm({
            id: item.id,
            modeloMoto: item.modelo_moto,
            kitId: item.kit_id ?? 0,
            compatible: item.compatible,
            detalle: item.detalle || "",
        })
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => setForm(FORM_VACIO)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.modeloMoto.trim() || !form.kitId) return
        setGuardando(true)
        setError(null)
        try {
            await guardarCompatibilidad(form)
            const nombreKit = kits.find((k) => k.id === form.kitId)?.nombre || ""
            setItems((prev) => {
                if (form.id) {
                    return prev.map((i) =>
                        i.id === form.id
                            ? { ...i, modelo_moto: form.modeloMoto.trim(), kit: nombreKit, kit_id: form.kitId, compatible: form.compatible, detalle: form.detalle, fuente: "admin" }
                            : i
                    )
                }
                const nuevo: Compatibilidad = {
                    id: Date.now(),
                    modelo_moto: form.modeloMoto.trim(),
                    kit: nombreKit,
                    kit_id: form.kitId,
                    compatible: form.compatible,
                    detalle: form.detalle,
                    fuente: "admin",
                    creado_en: new Date(),
                }
                return [nuevo, ...prev]
            })
            setForm(FORM_VACIO)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al guardar")
        } finally {
            setGuardando(false)
        }
    }

    const handleEliminar = async (id: number) => {
        if (!confirm("¿Eliminar este registro de compatibilidad?")) return
        try {
            await eliminarCompatibilidad(id)
            setItems((prev) => prev.filter((i) => i.id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Si un kit o pieza es compatible (o no) con un modelo de moto puntual. El agente busca acá antes
                de responder una pregunta técnica; si no encuentra el dato, nunca inventa una respuesta.
            </p>

            {error && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{error}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t-4 border-t-violet-500 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-xl">
                        <span>{editando ? `Editar: ${form.modeloMoto} / ${kitSeleccionado?.nombre || ""}` : "Nueva Compatibilidad"}</span>
                        {editando && (
                            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion} className="gap-1">
                                <X size={16} /> Cancelar edición
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="modeloMoto">Modelo de moto</Label>
                                <Input
                                    id="modeloMoto"
                                    placeholder="Ej: Honda Wave 110"
                                    value={form.modeloMoto}
                                    onChange={(e) => setForm((prev) => ({ ...prev, modeloMoto: e.target.value }))}
                                    disabled={guardando}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="kit">Kit</Label>
                                <Select
                                    value={form.kitId ? String(form.kitId) : ""}
                                    onValueChange={(v) => setForm((prev) => ({ ...prev, kitId: Number(v) }))}
                                    disabled={guardando}
                                >
                                    <SelectTrigger id="kit">
                                        <SelectValue placeholder="Elegí un kit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {kits.map((k) => (
                                            <SelectItem key={k.id} value={String(k.id)}>{k.nombre}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="compatible"
                                checked={form.compatible}
                                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, compatible: checked }))}
                                disabled={guardando}
                            />
                            <Label htmlFor="compatible" className="cursor-pointer">Es compatible</Label>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="detalle">Detalle</Label>
                            <Textarea
                                id="detalle"
                                placeholder="Ej: Requiere cambiar también el carburador."
                                value={form.detalle}
                                onChange={(e) => setForm((prev) => ({ ...prev, detalle: e.target.value }))}
                                disabled={guardando}
                                rows={3}
                            />
                        </div>

                        <Button type="submit" disabled={guardando || !form.modeloMoto.trim() || !form.kitId} className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar compatibilidad"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Compatibilidades Cargadas</CardTitle>
                    <CardDescription>{items.length} registro(s) en la base.</CardDescription>
                </CardHeader>
                <CardContent>
                    {items.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste compatibilidades.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Modelo</TableHead>
                                        <TableHead>Kit / pieza</TableHead>
                                        <TableHead>Compatible</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.modelo_moto}</TableCell>
                                            <TableCell>
                                                {item.kit}
                                                {!item.kit_id && (
                                                    <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700 gap-1">
                                                        <AlertTriangle size={12} /> sin enlazar
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={item.compatible ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"}>
                                                    {item.compatible ? "Sí" : "No"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1 whitespace-nowrap">
                                                <Button variant="ghost" size="sm" onClick={() => editar(item)}>
                                                    <Pencil size={16} />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleEliminar(item.id)}>
                                                    <Trash2 size={16} className="text-red-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
