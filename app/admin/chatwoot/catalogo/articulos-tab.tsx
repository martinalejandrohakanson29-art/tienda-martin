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
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle } from "lucide-react"

import {
    guardarChatArticulo,
    eliminarChatArticulo,
    alternarActivoChatArticulo,
    type ChatArticulo,
    type ChatArticuloInput,
} from "@/app/actions/chat-catalogo"

const FORM_VACIO: ChatArticuloInput = {
    nombre: "",
    alias: "",
    precio: "",
    detalle: "",
    activo: true,
}

function formatearPrecio(precio: number | null): string {
    if (precio === null) return "No se vende suelto"
    return precio.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

export function ArticulosTab({
    articulosIniciales,
    errorInicial,
}: {
    articulosIniciales: ChatArticulo[]
    errorInicial: string | null
}) {
    const [articulos, setArticulos] = useState<ChatArticulo[]>(articulosIniciales)
    const [form, setForm] = useState<ChatArticuloInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)

    const editando = form.id !== undefined

    const actualizarCampo = <K extends keyof ChatArticuloInput>(campo: K, valor: ChatArticuloInput[K]) => {
        setForm((prev) => ({ ...prev, [campo]: valor }))
    }

    const editarArticulo = (articulo: ChatArticulo) => {
        setForm({
            id: articulo.id,
            nombre: articulo.nombre,
            alias: articulo.alias || "",
            precio: articulo.precio !== null ? String(articulo.precio) : "",
            detalle: articulo.detalle || "",
            activo: articulo.activo,
        })
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => setForm(FORM_VACIO)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setGuardando(true)
        setError(null)
        try {
            const resultado = await guardarChatArticulo(form)
            const id = resultado.id!
            const actualizado: ChatArticulo = {
                id,
                nombre: form.nombre.trim(),
                alias: form.alias.trim() || null,
                precio: form.precio.trim() ? Number(form.precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")) : null,
                detalle: form.detalle.trim() || null,
                activo: form.activo,
                creado_en: articulos.find((a) => a.id === form.id)?.creado_en || new Date(),
            }
            setArticulos((prev) => {
                const existe = prev.some((a) => a.id === actualizado.id)
                const siguiente = existe ? prev.map((a) => (a.id === actualizado.id ? actualizado : a)) : [...prev, actualizado]
                return siguiente.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
            })
            setForm(FORM_VACIO)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al guardar el artículo")
        } finally {
            setGuardando(false)
        }
    }

    const handleEliminar = async (id: number) => {
        if (!confirm("¿Eliminar este artículo?")) return
        try {
            await eliminarChatArticulo(id)
            setArticulos((prev) => prev.filter((a) => a.id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    const handleToggleActivo = async (articulo: ChatArticulo) => {
        const nuevoEstado = !articulo.activo
        setArticulos((prev) => prev.map((a) => (a.id === articulo.id ? { ...a, activo: nuevoEstado } : a)))
        try {
            await alternarActivoChatArticulo(articulo.id, nuevoEstado)
        } catch (err) {
            setArticulos((prev) => prev.map((a) => (a.id === articulo.id ? { ...a, activo: articulo.activo } : a)))
            alert(err instanceof Error ? err.message : "Error al cambiar el estado")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Piezas sueltas que después se enganchan a un pack en la pestaña &quot;Packs&quot;. Cargá cada una con su
                nombre técnico, un alias de cómo la nombra el cliente, y precio solo si se vende por separado.
            </p>

            {error && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{error}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t-4 border-t-emerald-500 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-xl">
                        <span>{editando ? `Editar: ${form.nombre}` : "Nuevo Artículo"}</span>
                        {editando && (
                            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion} className="gap-1">
                                <X size={16} /> Cancelar edición
                            </Button>
                        )}
                    </CardTitle>
                    <CardDescription>
                        El alias es lo que el bot usa para reconocer la pregunta del cliente — escribí la frase completa
                        (ej. &quot;tapa sola&quot;, &quot;cilindro solo&quot;), no solo la palabra pelada.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="nombre">Nombre del artículo</Label>
                                <Input
                                    id="nombre"
                                    placeholder="Ej: Cilindro 120 54mm perno 13"
                                    value={form.nombre}
                                    onChange={(e) => actualizarCampo("nombre", e.target.value)}
                                    disabled={guardando}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="alias">Alias (separados por coma)</Label>
                                <Input
                                    id="alias"
                                    placeholder="Ej: cilindro solo, 125 solo, 120 solo"
                                    value={form.alias}
                                    onChange={(e) => actualizarCampo("alias", e.target.value)}
                                    disabled={guardando}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="precio">Precio si se vende suelto (vacío = no se vende suelto)</Label>
                                <Input
                                    id="precio"
                                    placeholder="Ej: 54999"
                                    value={form.precio}
                                    onChange={(e) => actualizarCampo("precio", e.target.value)}
                                    disabled={guardando}
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="activo"
                                        checked={form.activo}
                                        onCheckedChange={(checked) => actualizarCampo("activo", checked === true)}
                                        disabled={guardando}
                                    />
                                    <Label htmlFor="activo" className="cursor-pointer">Activo</Label>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="detalle">Detalle (opcional)</Label>
                            <Textarea
                                id="detalle"
                                placeholder="Descripción corta para cuando el bot necesite explicar qué es la pieza"
                                value={form.detalle}
                                onChange={(e) => actualizarCampo("detalle", e.target.value)}
                                disabled={guardando}
                                rows={3}
                            />
                        </div>
                        <Button type="submit" disabled={guardando || !form.nombre} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar artículo"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Artículos Cargados</CardTitle>
                    <CardDescription>{articulos.length} artículo(s) en la base.</CardDescription>
                </CardHeader>
                <CardContent>
                    {articulos.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste ningún artículo.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Alias</TableHead>
                                        <TableHead>Precio</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {articulos.map((articulo) => (
                                        <TableRow key={articulo.id}>
                                            <TableCell className="font-medium">{articulo.nombre}</TableCell>
                                            <TableCell className="text-sm text-gray-500 max-w-[240px] truncate">{articulo.alias || "—"}</TableCell>
                                            <TableCell className="text-sm">{formatearPrecio(articulo.precio)}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    onClick={() => handleToggleActivo(articulo)}
                                                    className={`cursor-pointer select-none ${articulo.activo ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
                                                >
                                                    {articulo.activo ? "Activo" : "Pausado"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="sm" onClick={() => editarArticulo(articulo)}>
                                                    <Pencil size={16} />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleEliminar(articulo.id)}>
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
