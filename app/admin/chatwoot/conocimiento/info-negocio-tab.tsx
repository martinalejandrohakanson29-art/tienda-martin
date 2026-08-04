"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle } from "lucide-react"

import {
    guardarInfoNegocio,
    eliminarInfoNegocio,
    TEMAS_NEGOCIO,
    type InfoNegocio,
    type InfoNegocioInput,
} from "@/app/actions/info-negocio"

const FORM_VACIO: InfoNegocioInput = { tema: "", respuesta: "" }

function etiquetaTema(tema: string) {
    return TEMAS_NEGOCIO.find((t) => t.value === tema)?.label || tema
}

export function InfoNegocioTab({ itemsIniciales, errorInicial }: { itemsIniciales: InfoNegocio[]; errorInicial: string | null }) {
    const [items, setItems] = useState<InfoNegocio[]>(itemsIniciales)
    const [form, setForm] = useState<InfoNegocioInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)

    const editando = form.id !== undefined

    const editar = (item: InfoNegocio) => {
        setForm({ id: item.id, tema: item.tema, respuesta: item.respuesta })
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => setForm(FORM_VACIO)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.tema || !form.respuesta.trim()) return
        setGuardando(true)
        setError(null)
        try {
            await guardarInfoNegocio(form)
            setItems((prev) => {
                const yaExiste = prev.find((i) => i.id === form.id || i.tema === form.tema)
                const actualizado: InfoNegocio = {
                    id: form.id ?? yaExiste?.id ?? Date.now(),
                    tema: form.tema,
                    respuesta: form.respuesta.trim(),
                    fuente: "admin",
                    creado_en: new Date(),
                }
                const sinEsteTema = prev.filter((i) => i.tema !== form.tema)
                return [actualizado, ...sinEsteTema]
            })
            setForm(FORM_VACIO)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al guardar")
        } finally {
            setGuardando(false)
        }
    }

    const handleEliminar = async (id: number) => {
        if (!confirm("¿Eliminar esta respuesta?")) return
        try {
            await eliminarInfoNegocio(id)
            setItems((prev) => prev.filter((i) => i.id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Horarios de atención, medios de pago, formas de envío, ubicación, garantía y cualquier otra
                pregunta frecuente sobre el negocio (no sobre un repuesto puntual). Solo puede haber una
                respuesta activa por tema: si cargás otra para el mismo tema, reemplaza a la anterior.
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
                        <span>{editando ? `Editar: ${etiquetaTema(form.tema)}` : "Nueva Respuesta"}</span>
                        {editando && (
                            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion} className="gap-1">
                                <X size={16} /> Cancelar edición
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="tema">Tema</Label>
                            <Select value={form.tema} onValueChange={(v) => setForm((prev) => ({ ...prev, tema: v }))} disabled={guardando}>
                                <SelectTrigger id="tema">
                                    <SelectValue placeholder="Elegí un tema" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEMAS_NEGOCIO.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="respuesta">Respuesta (en primera persona, como hablaría el equipo)</Label>
                            <Textarea
                                id="respuesta"
                                placeholder="Ej: Atendemos de lunes a viernes de 9 a 13:30 y de 16 a 19 hs; sábados de 9 a 13 hs."
                                value={form.respuesta}
                                onChange={(e) => setForm((prev) => ({ ...prev, respuesta: e.target.value }))}
                                disabled={guardando}
                                rows={4}
                                required
                            />
                        </div>

                        <Button type="submit" disabled={guardando || !form.tema || !form.respuesta.trim()} className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar respuesta"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Info Cargada</CardTitle>
                    <CardDescription>{items.length} tema(s) con respuesta.</CardDescription>
                </CardHeader>
                <CardContent>
                    {items.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste info del negocio.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Tema</TableHead>
                                        <TableHead>Respuesta</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium whitespace-nowrap">{etiquetaTema(item.tema)}</TableCell>
                                            <TableCell className="text-sm text-gray-600 max-w-[420px]">{item.respuesta}</TableCell>
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
