"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle, Search, Copy } from "lucide-react"

import {
    guardarChatArticulo,
    eliminarChatArticulo,
    alternarActivoChatArticulo,
    buscarArticulosMostrador,
    sincronizarCompatibilidadArticulo,
    getChatArticuloCompatibilidades,
    type ChatArticulo,
    type ChatArticuloInput,
    type ArticuloMostradorResultado,
    type ChatArticuloCompatibilidad,
} from "@/app/actions/chat-catalogo"
import { CATEGORIAS_ARTICULO } from "@/lib/chat-catalogo-categorias"
import type { Kit } from "@/app/actions/kits-publicidad"
import type { Compatibilidad } from "@/app/actions/compatibilidades"
import { matchTodasPalabras } from "@/lib/busqueda-texto"
import { formatearListaCompat } from "@/lib/compatibilidad-texto"

const SIN_CATEGORIA = "ninguna"

const FORM_VACIO: ChatArticuloInput = {
    articuloMostradorId: "",
    tituloComercial: "",
    alias: "",
    precio: "",
    detalle: "",
    categoria: "",
    activo: true,
}

function formatearPrecio(precio: number | null): string {
    if (precio === null) return "No se vende suelto"
    return precio.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

export function ArticulosTab({
    articulosIniciales,
    errorInicial,
    compatibilidadesIniciales,
    kitsParaCopiar,
    compatibilidadesKits,
}: {
    articulosIniciales: ChatArticulo[]
    errorInicial: string | null
    compatibilidadesIniciales: ChatArticuloCompatibilidad[]
    kitsParaCopiar: Kit[]
    compatibilidadesKits: Compatibilidad[]
}) {
    const [articulos, setArticulos] = useState<ChatArticulo[]>(articulosIniciales)
    const [form, setForm] = useState<ChatArticuloInput>(FORM_VACIO)
    const [nombreSeleccionado, setNombreSeleccionado] = useState<string | null>(null)
    const [esPackSeleccionado, setEsPackSeleccionado] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)
    const [busqueda, setBusqueda] = useState("")

    const [busquedaMostrador, setBusquedaMostrador] = useState("")
    const [resultadosMostrador, setResultadosMostrador] = useState<ArticuloMostradorResultado[]>([])
    const [buscandoMostrador, setBuscandoMostrador] = useState(false)

    const [compatList, setCompatList] = useState<ChatArticuloCompatibilidad[]>(compatibilidadesIniciales)
    const [compatibleTexto, setCompatibleTexto] = useState("")
    const [incompatibleTexto, setIncompatibleTexto] = useState("")
    const [kitParaCopiar, setKitParaCopiar] = useState("")

    const editando = form.id !== undefined

    const articulosFiltrados = useMemo(() => {
        if (!busqueda.trim()) return articulos
        return articulos.filter((a) => matchTodasPalabras(`${a.nombre} ${a.alias || ""}`, busqueda))
    }, [articulos, busqueda])

    // Buscador contra el inventario real (articulos_mostrador), con debounce —
    // no se carga la lista completa, solo lo que matchea a medida que se tipea.
    useEffect(() => {
        const q = busquedaMostrador.trim()
        if (q.length < 2) {
            setResultadosMostrador([])
            return
        }
        setBuscandoMostrador(true)
        const timeout = setTimeout(async () => {
            try {
                const res = await buscarArticulosMostrador(q)
                const yaCargados = new Set(articulos.map((a) => a.articulo_mostrador_id))
                setResultadosMostrador(res.filter((r) => !yaCargados.has(r.id)))
            } finally {
                setBuscandoMostrador(false)
            }
        }, 300)
        return () => clearTimeout(timeout)
    }, [busquedaMostrador, articulos])

    const actualizarCampo = <K extends keyof ChatArticuloInput>(campo: K, valor: ChatArticuloInput[K]) => {
        setForm((prev) => ({ ...prev, [campo]: valor }))
    }

    const elegirArticuloMostrador = (resultado: ArticuloMostradorResultado) => {
        setForm((prev) => ({ ...prev, articuloMostradorId: resultado.id, precio: String(resultado.precio) }))
        setNombreSeleccionado(resultado.nombre)
        setEsPackSeleccionado(resultado.esPack)
        setBusquedaMostrador("")
        setResultadosMostrador([])
    }

    const editarArticulo = (articulo: ChatArticulo) => {
        setForm({
            id: articulo.id,
            articuloMostradorId: articulo.articulo_mostrador_id,
            tituloComercial: articulo.titulo_comercial || "",
            alias: articulo.alias || "",
            precio: articulo.precio !== null ? String(articulo.precio) : "",
            detalle: articulo.detalle || "",
            categoria: articulo.categoria || "",
            activo: articulo.activo,
        })
        setNombreSeleccionado(articulo.nombre)
        setEsPackSeleccionado(articulo.es_pack)
        const propias = compatList.filter((c) => c.articulo_id === articulo.id)
        setCompatibleTexto(formatearListaCompat(propias.filter((c) => c.compatible)))
        setIncompatibleTexto(formatearListaCompat(propias.filter((c) => !c.compatible)))
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => {
        setForm(FORM_VACIO)
        setNombreSeleccionado(null)
        setEsPackSeleccionado(false)
        setBusquedaMostrador("")
        setCompatibleTexto("")
        setIncompatibleTexto("")
        setKitParaCopiar("")
    }

    const copiarCompatibilidadDeKit = () => {
        if (!kitParaCopiar) return
        const kitId = Number(kitParaCopiar)
        const propias = compatibilidadesKits.filter((c) => c.kit_id === kitId)
        setCompatibleTexto(formatearListaCompat(propias.filter((c) => c.compatible)))
        setIncompatibleTexto(formatearListaCompat(propias.filter((c) => !c.compatible)))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setGuardando(true)
        setError(null)
        try {
            const resultado = await guardarChatArticulo(form)
            const id = resultado.id!
            await sincronizarCompatibilidadArticulo(id, compatibleTexto, incompatibleTexto)
            const compatActualizada = await getChatArticuloCompatibilidades()
            setCompatList(compatActualizada)

            const actualizado: ChatArticulo = {
                id,
                articulo_mostrador_id: form.articuloMostradorId,
                nombre: nombreSeleccionado || "",
                titulo_comercial: form.tituloComercial?.trim() || null,
                alias: form.alias.trim() || null,
                precio: form.precio.trim() ? Number(form.precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")) : null,
                detalle: form.detalle.trim() || null,
                categoria: form.categoria.trim() || null,
                activo: form.activo,
                creado_en: articulos.find((a) => a.id === form.id)?.creado_en || new Date(),
                es_pack: esPackSeleccionado,
            }
            setArticulos((prev) => {
                const existe = prev.some((a) => a.id === actualizado.id)
                const siguiente = existe ? prev.map((a) => (a.id === actualizado.id ? actualizado : a)) : [...prev, actualizado]
                return siguiente.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
            })
            cancelarEdicion()
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
                Un artículo acá no se tipea a mano: es un artículo real del inventario (buscalo y elegilo abajo) — puede
                ser una pieza suelta o un pack ya armado en &quot;Listas &gt; Packs&quot;. Después le sumás un alias de
                cómo lo nombra el cliente y, si hace falta, un precio propio para WhatsApp.
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
                        <span>{editando ? `Editar: ${nombreSeleccionado}` : "Nuevo Artículo"}</span>
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
                        <div className="space-y-1">
                            <Label>Artículo del inventario</Label>
                            {nombreSeleccionado ? (
                                <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-emerald-50 border-emerald-200">
                                    <span className="text-sm font-medium flex items-center gap-2">
                                        {nombreSeleccionado}
                                        {esPackSeleccionado && (
                                            <Badge variant="outline" className="font-normal text-violet-700 border-violet-300 bg-violet-50">Pack</Badge>
                                        )}
                                    </span>
                                    {!editando && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setNombreSeleccionado(null)
                                                setEsPackSeleccionado(false)
                                                actualizarCampo("articuloMostradorId", "")
                                            }}
                                            disabled={guardando}
                                        >
                                            <X size={14} /> Cambiar
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder="Buscar un artículo real por nombre…"
                                        value={busquedaMostrador}
                                        onChange={(e) => setBusquedaMostrador(e.target.value)}
                                        disabled={guardando}
                                        className="pl-9"
                                    />
                                    {buscandoMostrador && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                                    )}
                                    {resultadosMostrador.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg divide-y max-h-64 overflow-y-auto">
                                            {resultadosMostrador.map((r) => (
                                                <button
                                                    type="button"
                                                    key={r.id}
                                                    onClick={() => elegirArticuloMostrador(r)}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex justify-between gap-3"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        {r.nombre}
                                                        {r.esPack && (
                                                            <Badge variant="outline" className="font-normal text-violet-700 border-violet-300 bg-violet-50">Pack</Badge>
                                                        )}
                                                    </span>
                                                    <span className="text-gray-400 shrink-0">
                                                        {r.precio.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="tituloComercial">Título comercial (para mencionar al cliente / bot)</Label>
                                <Input
                                    id="tituloComercial"
                                    placeholder="Ej: Tapa CDI 125, Carburador CG 125"
                                    value={form.tituloComercial || ""}
                                    onChange={(e) => actualizarCampo("tituloComercial", e.target.value)}
                                    disabled={guardando}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="precio">Precio para WhatsApp si se vende suelto (vacío = no se vende suelto)</Label>
                                <Input
                                    id="precio"
                                    placeholder="Ej: 54999"
                                    value={form.precio}
                                    onChange={(e) => actualizarCampo("precio", e.target.value)}
                                    disabled={guardando}
                                />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
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
                                <Label htmlFor="categoria">Categoría (tipo de pieza)</Label>
                                <Select
                                    value={form.categoria || SIN_CATEGORIA}
                                    onValueChange={(v) => actualizarCampo("categoria", v === SIN_CATEGORIA ? "" : v)}
                                >
                                    <SelectTrigger id="categoria" disabled={guardando}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={SIN_CATEGORIA}>Sin categoría</SelectItem>
                                        {CATEGORIAS_ARTICULO.map((c) => (
                                            <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-400">
                                    Para que el bot reconozca la pieza aunque el cliente no use el alias exacto (ej. "el
                                    escape" cuando el kit pineado tiene un solo artículo de esa categoría).
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="activo"
                                checked={form.activo}
                                onCheckedChange={(checked) => actualizarCampo("activo", checked === true)}
                                disabled={guardando}
                            />
                            <Label htmlFor="activo" className="cursor-pointer">Activo</Label>
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

                        <div className="space-y-3 pt-6 border-t border-slate-200">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <Label>Compatibilidad de este artículo</Label>
                                {kitsParaCopiar.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <Select value={kitParaCopiar} onValueChange={setKitParaCopiar}>
                                            <SelectTrigger className="h-8 w-48 text-xs">
                                                <SelectValue placeholder="Copiar de un kit…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {kitsParaCopiar.map((k) => (
                                                    <SelectItem key={k.id} value={String(k.id)}>
                                                        {k.nombre}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={copiarCompatibilidadDeKit}
                                            disabled={!kitParaCopiar || guardando}
                                            className="gap-1 h-8"
                                        >
                                            <Copy size={14} /> Copiar
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-gray-400">
                                Dato propio del artículo, no se hereda en vivo del kit — &quot;Copiar de un kit&quot; solo
                                precarga estos dos campos una vez, después los podés editar libremente.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="compatibleTexto">Compatible con (separado por comas)</Label>
                                    <Textarea
                                        id="compatibleTexto"
                                        placeholder="Ej: Zanella ZB 110 (recorrido corto), Honda Wave 110"
                                        value={compatibleTexto}
                                        onChange={(e) => setCompatibleTexto(e.target.value)}
                                        disabled={guardando}
                                        rows={4}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="incompatibleTexto">No compatible con (separado por comas)</Label>
                                    <Textarea
                                        id="incompatibleTexto"
                                        placeholder="Ej: Honda Wave NF"
                                        value={incompatibleTexto}
                                        onChange={(e) => setIncompatibleTexto(e.target.value)}
                                        disabled={guardando}
                                        rows={4}
                                    />
                                </div>
                            </div>
                        </div>

                        <Button type="submit" disabled={guardando || !form.articuloMostradorId} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
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
                    <CardDescription>
                        {busqueda
                            ? `${articulosFiltrados.length} de ${articulos.length} artículo(s).`
                            : `${articulos.length} artículo(s) en la base.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {articulos.length > 0 && (
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por nombre o alias…"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    )}
                    {articulos.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste ningún artículo.</p>
                    ) : articulosFiltrados.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Ningún artículo coincide con la búsqueda.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Artículo Mostrador</TableHead>
                                        <TableHead>Título Comercial (Bot)</TableHead>
                                        <TableHead>Alias</TableHead>
                                        <TableHead>Categoría</TableHead>
                                        <TableHead>Precio</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {articulosFiltrados.map((articulo) => (
                                        <TableRow key={articulo.id}>
                                            <TableCell className="font-medium">
                                                <span className="flex items-center gap-2">
                                                    {articulo.nombre}
                                                    {articulo.es_pack && (
                                                        <Badge variant="outline" className="font-normal text-violet-700 border-violet-300 bg-violet-50">Pack</Badge>
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-semibold text-emerald-700 text-sm">
                                                {articulo.titulo_comercial || "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-gray-500 max-w-[240px] truncate">{articulo.alias || "—"}</TableCell>
                                            <TableCell className="text-sm text-gray-500 capitalize">
                                                {articulo.categoria ? (
                                                    <Badge variant="outline" className="font-normal capitalize">{articulo.categoria}</Badge>
                                                ) : "—"}
                                            </TableCell>
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
