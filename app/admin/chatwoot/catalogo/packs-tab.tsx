"use client"

import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle, Search } from "lucide-react"

import {
    guardarChatPack,
    eliminarChatPack,
    alternarActivoChatPack,
    type ChatPack,
    type ChatPackInput,
    type ChatArticulo,
} from "@/app/actions/chat-catalogo"
import { matchTodasPalabras } from "@/lib/busqueda-texto"

const FORM_VACIO: ChatPackInput = {
    nombre: "",
    precio: "",
    envio: "",
    mensajeBienvenida: "",
    fotoUrl: "",
    plantillasBienvenida: "",
    activo: true,
}

type ComponenteSeleccionado = { articuloId: number; nombre: string; precio: number | null; cantidad: number }

function formatearPrecio(precio: number): string {
    return precio.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

export function PacksTab({
    packsIniciales,
    errorInicial,
    articulosDisponibles,
}: {
    packsIniciales: ChatPack[]
    errorInicial: string | null
    articulosDisponibles: ChatArticulo[]
}) {
    const [packs, setPacks] = useState<ChatPack[]>(packsIniciales)
    const [form, setForm] = useState<ChatPackInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)

    const [componentes, setComponentes] = useState<ComponenteSeleccionado[]>([])
    const [busqueda, setBusqueda] = useState("")
    const [busquedaLista, setBusquedaLista] = useState("")

    const editando = form.id !== undefined

    const resultadosBusqueda = useMemo(() => {
        if (busqueda.trim().length < 2) return []
        const yaElegidos = new Set(componentes.map((c) => c.articuloId))
        return articulosDisponibles
            .filter((a) => a.activo && !yaElegidos.has(a.id) && matchTodasPalabras(a.nombre, busqueda))
            .slice(0, 10)
    }, [busqueda, articulosDisponibles, componentes])

    const packsFiltrados = useMemo(() => {
        if (!busquedaLista.trim()) return packs
        return packs.filter((p) =>
            matchTodasPalabras(`${p.nombre} ${p.componentes.map((c) => c.nombre).join(" ")}`, busquedaLista)
        )
    }, [packs, busquedaLista])

    const actualizarCampo = <K extends keyof ChatPackInput>(campo: K, valor: ChatPackInput[K]) => {
        setForm((prev) => ({ ...prev, [campo]: valor }))
    }

    const agregarComponente = (articulo: ChatArticulo) => {
        setComponentes((prev) => [...prev, { articuloId: articulo.id, nombre: articulo.nombre, precio: articulo.precio, cantidad: 1 }])
        setBusqueda("")
    }

    const quitarComponente = (articuloId: number) => {
        setComponentes((prev) => prev.filter((c) => c.articuloId !== articuloId))
    }

    const cambiarCantidad = (articuloId: number, cantidad: number) => {
        setComponentes((prev) => prev.map((c) => (c.articuloId === articuloId ? { ...c, cantidad: Math.max(1, cantidad) } : c)))
    }

    const editarPack = (pack: ChatPack) => {
        setForm({
            id: pack.id,
            nombre: pack.nombre,
            precio: String(pack.precio),
            envio: pack.envio || "",
            mensajeBienvenida: pack.mensaje_bienvenida,
            fotoUrl: pack.foto_url || "",
            plantillasBienvenida: pack.plantillas_bienvenida || "",
            activo: pack.activo,
        })
        setComponentes(
            pack.componentes.map((c) => ({ articuloId: c.articulo_id, nombre: c.nombre, precio: c.precio, cantidad: c.cantidad }))
        )
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => {
        setForm(FORM_VACIO)
        setComponentes([])
        setBusqueda("")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setGuardando(true)
        setError(null)
        try {
            const resultado = await guardarChatPack(
                form,
                componentes.map((c) => ({ articuloId: c.articuloId, cantidad: c.cantidad }))
            )
            const id = resultado.id!
            const actualizado: ChatPack = {
                id,
                nombre: form.nombre.trim(),
                precio: Number(form.precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                envio: form.envio.trim() || null,
                mensaje_bienvenida: form.mensajeBienvenida.trim(),
                foto_url: form.fotoUrl.trim() || null,
                plantillas_bienvenida: form.plantillasBienvenida.trim() || null,
                activo: form.activo,
                creado_en: packs.find((p) => p.id === form.id)?.creado_en || new Date(),
                componentes: componentes.map((c, i) => ({
                    articulo_id: c.articuloId,
                    nombre: c.nombre,
                    alias: null,
                    precio: c.precio,
                    cantidad: c.cantidad,
                    orden: i,
                })),
            }
            setPacks((prev) => {
                const existe = prev.some((p) => p.id === actualizado.id)
                return existe ? prev.map((p) => (p.id === actualizado.id ? actualizado : p)) : [actualizado, ...prev]
            })
            cancelarEdicion()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al guardar el pack")
        } finally {
            setGuardando(false)
        }
    }

    const handleEliminar = async (id: number) => {
        if (!confirm("¿Eliminar este pack? Los artículos que lo componen no se borran, solo se desenganchan.")) return
        try {
            await eliminarChatPack(id)
            setPacks((prev) => prev.filter((p) => p.id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    const handleToggleActivo = async (pack: ChatPack) => {
        const nuevoEstado = !pack.activo
        setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, activo: nuevoEstado } : p)))
        try {
            await alternarActivoChatPack(pack.id, nuevoEstado)
        } catch (err) {
            setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, activo: pack.activo } : p)))
            alert(err instanceof Error ? err.message : "Error al cambiar el estado")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Un pack se arma enganchando artículos ya cargados en la pestaña &quot;Artículos&quot;. Si el que
                necesitás todavía no existe, cargalo primero ahí.
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
                        <span>{editando ? `Editar: ${form.nombre}` : "Nuevo Pack"}</span>
                        {editando && (
                            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion} className="gap-1">
                                <X size={16} /> Cancelar edición
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="nombre">Nombre del pack</Label>
                                <Input
                                    id="nombre"
                                    placeholder="Ej: Kit 120 para 110"
                                    value={form.nombre}
                                    onChange={(e) => actualizarCampo("nombre", e.target.value)}
                                    disabled={guardando}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="precio">Precio del pack completo</Label>
                                <Input
                                    id="precio"
                                    placeholder="Ej: 99000"
                                    value={form.precio}
                                    onChange={(e) => actualizarCampo("precio", e.target.value)}
                                    disabled={guardando}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="envio">Envío</Label>
                                <Input
                                    id="envio"
                                    placeholder="Ej: envío gratis"
                                    value={form.envio}
                                    onChange={(e) => actualizarCampo("envio", e.target.value)}
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
                            <Label htmlFor="plantillasBienvenida">Plantillas exactas de Instagram/Meta Ads (una por línea)</Label>
                            <Textarea
                                id="plantillasBienvenida"
                                placeholder={"Pegá acá el texto tal cual lo manda la plantilla del anuncio, una por línea."}
                                value={form.plantillasBienvenida}
                                onChange={(e) => actualizarCampo("plantillasBienvenida", e.target.value)}
                                disabled={guardando}
                                rows={4}
                            />
                        </div>

                        <div className="space-y-2 pt-6 border-t border-slate-200">
                            <Label>Artículos que incluye este pack</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar un artículo ya cargado…"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    disabled={guardando}
                                    className="pl-9"
                                />
                                {resultadosBusqueda.length > 0 && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg divide-y">
                                        {resultadosBusqueda.map((a) => (
                                            <button
                                                type="button"
                                                key={a.id}
                                                onClick={() => agregarComponente(a)}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50"
                                            >
                                                {a.nombre}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {componentes.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Todavía no enganchaste ningún artículo.</p>
                            ) : (
                                <div className="border rounded-md divide-y">
                                    {componentes.map((c) => (
                                        <div key={c.articuloId} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
                                            <span className="flex-1">{c.nombre}</span>
                                            <Input
                                                type="number"
                                                min={1}
                                                value={c.cantidad}
                                                onChange={(e) => cambiarCantidad(c.articuloId, Number(e.target.value))}
                                                disabled={guardando}
                                                className="w-16 h-8"
                                            />
                                            <Button type="button" variant="ghost" size="sm" onClick={() => quitarComponente(c.articuloId)} disabled={guardando}>
                                                <X size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-1 pt-6 border-t border-slate-200">
                            <Label htmlFor="mensajeBienvenida">Mensaje predefinido (se manda tal cual)</Label>
                            <Textarea
                                id="mensajeBienvenida"
                                placeholder={"Hola amigo, ¿cómo va?\n\nEl combo incluye...\n\nEl precio es $..., con envío gratis."}
                                value={form.mensajeBienvenida}
                                onChange={(e) => actualizarCampo("mensajeBienvenida", e.target.value)}
                                disabled={guardando}
                                rows={6}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="fotoUrl">Foto (opcional, URL pública)</Label>
                            <Input
                                id="fotoUrl"
                                placeholder="https://..."
                                value={form.fotoUrl}
                                onChange={(e) => actualizarCampo("fotoUrl", e.target.value)}
                                disabled={guardando}
                            />
                        </div>

                        <Button type="submit" disabled={guardando || !form.nombre || !form.mensajeBienvenida} className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar pack"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Packs Cargados</CardTitle>
                    <CardDescription>
                        {busquedaLista
                            ? `${packsFiltrados.length} de ${packs.length} pack(s).`
                            : `${packs.length} pack(s) en la base.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {packs.length > 0 && (
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por nombre o componente…"
                                value={busquedaLista}
                                onChange={(e) => setBusquedaLista(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    )}
                    {packs.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste ningún pack.</p>
                    ) : packsFiltrados.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Ningún pack coincide con la búsqueda.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Precio</TableHead>
                                        <TableHead>Componentes</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {packsFiltrados.map((pack) => (
                                        <TableRow key={pack.id}>
                                            <TableCell className="font-medium">{pack.nombre}</TableCell>
                                            <TableCell>{formatearPrecio(pack.precio)}</TableCell>
                                            <TableCell className="text-sm text-gray-500 max-w-[280px] truncate">
                                                {pack.componentes.length > 0
                                                    ? pack.componentes.map((c) => `${c.cantidad}x ${c.nombre}`).join(", ")
                                                    : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    onClick={() => handleToggleActivo(pack)}
                                                    className={`cursor-pointer select-none ${pack.activo ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
                                                >
                                                    {pack.activo ? "Activo" : "Pausado"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="sm" onClick={() => editarPack(pack)}>
                                                    <Pencil size={16} />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleEliminar(pack.id)}>
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
