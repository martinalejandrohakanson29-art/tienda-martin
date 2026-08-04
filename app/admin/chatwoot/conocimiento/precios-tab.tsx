"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle } from "lucide-react"

import {
    guardarPrecioStock,
    eliminarPrecioStock,
    type ProductoPrecio,
    type ProductoPrecioInput,
} from "@/app/actions/precios-stock"

const FORM_VACIO: ProductoPrecioInput = { producto: "", precio: "", stock: "", detalle: "" }

export function PreciosTab({ itemsIniciales, errorInicial }: { itemsIniciales: ProductoPrecio[]; errorInicial: string | null }) {
    const [items, setItems] = useState<ProductoPrecio[]>(itemsIniciales)
    const [form, setForm] = useState<ProductoPrecioInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)

    const editando = form.id !== undefined

    const editar = (item: ProductoPrecio) => {
        setForm({
            id: item.id,
            producto: item.producto,
            precio: item.precio || "",
            stock: item.stock || "",
            detalle: item.detalle || "",
        })
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => setForm(FORM_VACIO)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.producto.trim()) return
        setGuardando(true)
        setError(null)
        try {
            await guardarPrecioStock(form)
            setItems((prev) => {
                if (form.id) {
                    return prev.map((i) =>
                        i.id === form.id
                            ? { ...i, producto: form.producto.trim(), precio: form.precio, stock: form.stock, detalle: form.detalle, fuente: "admin" }
                            : i
                    )
                }
                const nuevo: ProductoPrecio = {
                    id: Date.now(),
                    producto: form.producto.trim(),
                    precio: form.precio,
                    stock: form.stock,
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
        if (!confirm("¿Eliminar este producto?")) return
        try {
            await eliminarPrecioStock(id)
            setItems((prev) => prev.filter((i) => i.id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Precio y stock de productos o repuestos sueltos (que no son un kit publicitado). El agente
                busca acá cuando un cliente pregunta precio o stock de algo puntual.
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
                        <span>{editando ? `Editar: ${form.producto}` : "Nuevo Producto"}</span>
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
                            <Label htmlFor="producto">Producto</Label>
                            <Input
                                id="producto"
                                placeholder="Ej: Tapa CDI 125"
                                value={form.producto}
                                onChange={(e) => setForm((prev) => ({ ...prev, producto: e.target.value }))}
                                disabled={guardando}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="precio">Precio</Label>
                                <Input
                                    id="precio"
                                    placeholder="Ej: $15.000"
                                    value={form.precio}
                                    onChange={(e) => setForm((prev) => ({ ...prev, precio: e.target.value }))}
                                    disabled={guardando}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="stock">Stock</Label>
                                <Input
                                    id="stock"
                                    placeholder="Ej: hay stock / 3 unidades / sin stock"
                                    value={form.stock}
                                    onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                                    disabled={guardando}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="detalle">Detalle</Label>
                            <Textarea
                                id="detalle"
                                placeholder="Cualquier aclaración extra que le sirva al agente para responder."
                                value={form.detalle}
                                onChange={(e) => setForm((prev) => ({ ...prev, detalle: e.target.value }))}
                                disabled={guardando}
                                rows={3}
                            />
                        </div>

                        <Button type="submit" disabled={guardando || !form.producto.trim()} className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar producto"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Productos Cargados</CardTitle>
                    <CardDescription>{items.length} producto(s) en la base.</CardDescription>
                </CardHeader>
                <CardContent>
                    {items.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste productos sueltos.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Precio</TableHead>
                                        <TableHead>Stock</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.producto}</TableCell>
                                            <TableCell>{item.precio || "—"}</TableCell>
                                            <TableCell>{item.stock || "—"}</TableCell>
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
