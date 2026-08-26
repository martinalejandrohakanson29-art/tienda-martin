"use client"

import { useMemo, useRef, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle, Search, Upload, Layers } from "lucide-react"

import {
    guardarChatPack,
    eliminarChatPack,
    alternarActivoChatPack,
    guardarChatPackGrupo,
    sincronizarCompatibilidadKit,
    getChatComboCompatibilidades,
    type ChatPack,
    type ChatPackInput,
    type ChatArticulo,
    type ChatPackGrupo,
    type ChatComboCompatibilidad,
} from "@/app/actions/chat-catalogo"
import { matchTodasPalabras } from "@/lib/busqueda-texto"
import { formatearListaCompat } from "@/lib/compatibilidad-texto"

const SIN_GRUPO = "ninguno"
const GRUPO_NUEVO = "__nuevo__"

const FORM_VACIO: ChatPackInput = {
    nombre: "",
    precio: "",
    envio: "",
    mensajeBienvenida: "",
    fotoUrl: "",
    plantillasBienvenida: "",
    plantillasReferral: "",
    detalle: "",
    activo: true,
    grupoId: null,
    criterioVariante: "",
    categoria: "",
}

type ComponenteSeleccionado = { articuloId: number; nombre: string; precio: number | null; cantidad: number }

function formatearPrecio(precio: number): string {
    return precio.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

export function PacksTab({
    packsIniciales,
    errorInicial,
    articulosDisponibles,
    gruposIniciales,
    compatibilidadesComboIniciales,
}: {
    packsIniciales: ChatPack[]
    errorInicial: string | null
    articulosDisponibles: ChatArticulo[]
    gruposIniciales: ChatPackGrupo[]
    compatibilidadesComboIniciales: ChatComboCompatibilidad[]
}) {
    const [packs, setPacks] = useState<ChatPack[]>(packsIniciales)
    const [form, setForm] = useState<ChatPackInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)

    const [componentes, setComponentes] = useState<ComponenteSeleccionado[]>([])
    const [busqueda, setBusqueda] = useState("")
    const [busquedaLista, setBusquedaLista] = useState("")

    const [compatCombo, setCompatCombo] = useState<ChatComboCompatibilidad[]>(compatibilidadesComboIniciales)
    const [compatibleTexto, setCompatibleTexto] = useState("")
    const [incompatibleTexto, setIncompatibleTexto] = useState("")

    const [grupos, setGrupos] = useState<ChatPackGrupo[]>(gruposIniciales)
    const [grupoSeleccionado, setGrupoSeleccionado] = useState(SIN_GRUPO)
    const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState("")
    const [nuevoGrupoPlantilla, setNuevoGrupoPlantilla] = useState("")
    const [nuevoGrupoMensaje, setNuevoGrupoMensaje] = useState("")
    const [nuevoGrupoPreguntaVariante, setNuevoGrupoPreguntaVariante] = useState("")
    const [nuevoGrupoCategoria, setNuevoGrupoCategoria] = useState("")

    const [fotoDragging, setFotoDragging] = useState(false)
    const [subiendoFoto, setSubiendoFoto] = useState(false)
    const [fotoError, setFotoError] = useState<string | null>(null)
    const fotoFileRef = useRef<HTMLInputElement>(null)

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
            plantillasReferral: pack.plantillas_referral || "",
            detalle: pack.detalle || "",
            activo: pack.activo,
            grupoId: pack.grupo_id,
            criterioVariante: pack.criterio_variante || "",
            categoria: pack.categoria || "",
        })
        setComponentes(
            pack.componentes.map((c) => ({ articuloId: c.articulo_id, nombre: c.nombre, precio: c.precio, cantidad: c.cantidad }))
        )
        setGrupoSeleccionado(pack.grupo_id ? String(pack.grupo_id) : SIN_GRUPO)
        setNuevoGrupoNombre("")
        setNuevoGrupoPlantilla("")
        setNuevoGrupoMensaje("")
        setNuevoGrupoPreguntaVariante("")
        setNuevoGrupoCategoria("")
        setFotoError(null)
        const propias = compatCombo.filter((c) => c.kit_id === pack.id)
        setCompatibleTexto(formatearListaCompat(propias.filter((c) => c.compatible)))
        setIncompatibleTexto(formatearListaCompat(propias.filter((c) => !c.compatible)))
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => {
        setForm(FORM_VACIO)
        setComponentes([])
        setBusqueda("")
        setFotoError(null)
        setGrupoSeleccionado(SIN_GRUPO)
        setNuevoGrupoNombre("")
        setNuevoGrupoPlantilla("")
        setNuevoGrupoMensaje("")
        setNuevoGrupoPreguntaVariante("")
        setNuevoGrupoCategoria("")
        setCompatibleTexto("")
        setIncompatibleTexto("")
    }

    const subirFoto = async (archivo: File) => {
        setFotoError(null)
        if (!archivo.type.startsWith("image/")) {
            setFotoError("El archivo tiene que ser una imagen")
            return
        }
        if (archivo.size > 5 * 1024 * 1024) {
            setFotoError("La imagen no puede superar los 5MB")
            return
        }
        setSubiendoFoto(true)
        try {
            const cuerpo = new FormData()
            cuerpo.append("imagen", archivo)
            const res = await fetch("/api/admin/kits/imagen", { method: "POST", body: cuerpo })
            const data = await res.json()
            if (!res.ok || !data.success) throw new Error(data.error || "No se pudo subir la imagen")
            actualizarCampo("fotoUrl", data.fotoUrl)
        } catch (err) {
            setFotoError(err instanceof Error ? err.message : "Error al subir la imagen")
        } finally {
            setSubiendoFoto(false)
        }
    }

    const onFotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) subirFoto(f)
        e.target.value = ""
    }

    const onFotoDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setFotoDragging(false)
        const f = e.dataTransfer.files?.[0]
        if (f) subirFoto(f)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setGuardando(true)
        setError(null)
        try {
            let grupoId: number | null = null
            let gruposActualizados = grupos

            if (grupoSeleccionado === GRUPO_NUEVO) {
                if (!nuevoGrupoNombre.trim()) throw new Error("El nombre del grupo nuevo es obligatorio")
                const nuevoGrupo = await guardarChatPackGrupo({
                    nombre: nuevoGrupoNombre,
                    plantillasBienvenida: nuevoGrupoPlantilla,
                    plantillasReferral: "",
                    mensajeBienvenida: nuevoGrupoMensaje,
                    preguntaVariante: nuevoGrupoPreguntaVariante,
                    fotoUrl: "",
                    categoria: nuevoGrupoCategoria,
                })
                grupoId = nuevoGrupo.id
                gruposActualizados = [
                    ...grupos,
                    {
                        id: nuevoGrupo.id,
                        nombre: nuevoGrupoNombre.trim(),
                        plantillas_bienvenida: nuevoGrupoPlantilla.trim() || null,
                        plantillas_referral: null,
                        mensaje_bienvenida: nuevoGrupoMensaje.trim() || null,
                        pregunta_variante: nuevoGrupoPreguntaVariante.trim() || null,
                        foto_url: null,
                        categoria: nuevoGrupoCategoria.trim() || null,
                        activo: true,
                    },
                ].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
                setGrupos(gruposActualizados)
            } else if (grupoSeleccionado !== SIN_GRUPO) {
                grupoId = Number(grupoSeleccionado)
            }

            if (grupoId && !form.criterioVariante.trim()) {
                throw new Error('Si el pack pertenece a un grupo, hace falta la etiqueta de variante (ej. "recorrido corto")')
            }

            const formConGrupo: ChatPackInput = { ...form, grupoId }

            const resultado = await guardarChatPack(
                formConGrupo,
                componentes.map((c) => ({ articuloId: c.articuloId, cantidad: c.cantidad }))
            )
            const id = resultado.id!

            // La compatibilidad de combo solo aplica a nivel de KIT cuando el pack no
            // pertenece a un grupo — si pertenece, esa compatibilidad vive en el grupo
            // (se edita desde la pestaña "Grupos"), no se duplica acá.
            if (!grupoId) {
                await sincronizarCompatibilidadKit(id, compatibleTexto, incompatibleTexto)
                const compatActualizada = await getChatComboCompatibilidades()
                setCompatCombo(compatActualizada)
            }

            const actualizado: ChatPack = {
                id,
                nombre: form.nombre.trim(),
                precio: Number(form.precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                envio: form.envio.trim() || null,
                mensaje_bienvenida: form.mensajeBienvenida.trim(),
                foto_url: form.fotoUrl.trim() || null,
                plantillas_bienvenida: form.plantillasBienvenida.trim() || null,
                plantillas_referral: form.plantillasReferral.trim() || null,
                detalle: form.detalle.trim() || null,
                activo: form.activo,
                creado_en: packs.find((p) => p.id === form.id)?.creado_en || new Date(),
                grupo_id: grupoId,
                criterio_variante: grupoId ? form.criterioVariante.trim() : null,
                categoria: grupoId ? null : form.categoria.trim() || null,
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

                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Layers size={16} className="text-slate-400" />
                                <Label>Grupo de variantes (opcional)</Label>
                            </div>
                            <p className="text-xs text-gray-400">
                                Para casos como un mismo anuncio que corresponde a 2+ packs reales distintos (ej. recorrido
                                corto/largo, con distinto artículo y precio). Si el pack pertenece a un grupo, la plantilla
                                exacta pasa a definirse ahí (compartida), no en cada pack.
                            </p>
                            <Select value={grupoSeleccionado} onValueChange={setGrupoSeleccionado}>
                                <SelectTrigger className="w-full sm:w-80" disabled={guardando}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={SIN_GRUPO}>Sin grupo (kit único)</SelectItem>
                                    {grupos.map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)}>{g.nombre}</SelectItem>
                                    ))}
                                    <SelectItem value={GRUPO_NUEVO}>+ Crear grupo nuevo</SelectItem>
                                </SelectContent>
                            </Select>

                            {grupoSeleccionado === GRUPO_NUEVO && (
                                <div className="space-y-3 rounded-md border p-3 bg-slate-50">
                                    <div className="space-y-1">
                                        <Label htmlFor="nuevoGrupoNombre">Nombre del grupo</Label>
                                        <Input
                                            id="nuevoGrupoNombre"
                                            placeholder="Ej: Kit 120 para 110"
                                            value={nuevoGrupoNombre}
                                            onChange={(e) => setNuevoGrupoNombre(e.target.value)}
                                            disabled={guardando}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="nuevoGrupoPlantilla">Plantilla exacta compartida</Label>
                                        <Textarea
                                            id="nuevoGrupoPlantilla"
                                            placeholder="Pegá acá el texto tal cual lo manda la plantilla del anuncio."
                                            value={nuevoGrupoPlantilla}
                                            onChange={(e) => setNuevoGrupoPlantilla(e.target.value)}
                                            disabled={guardando}
                                            rows={3}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="nuevoGrupoMensaje">Mensaje de bienvenida genérico (pregunta la moto, para confirmar compatibilidad)</Label>
                                        <Textarea
                                            id="nuevoGrupoMensaje"
                                            placeholder={"Hola amigo, ¿cómo va?\n\nTenemos el combo para potenciar tu 110...\n\nA que moto se lo queres poner?"}
                                            value={nuevoGrupoMensaje}
                                            onChange={(e) => setNuevoGrupoMensaje(e.target.value)}
                                            disabled={guardando}
                                            rows={4}
                                        />
                                        <p className="text-xs text-gray-400">
                                            Se manda tal cual, sin mencionar precio (ahí está la ambigüedad) — recién cuando el
                                            cliente contesta se pinea el pack definitivo y se manda su mensaje con precio real.
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="nuevoGrupoPreguntaVariante">Pregunta de variante (corto/largo, una vez confirmada la compatibilidad)</Label>
                                        <Textarea
                                            id="nuevoGrupoPreguntaVariante"
                                            placeholder={"Genial, tu moto es compatible! Ahora decime: ¿es corto o largo? Fijate si el cilindro es negro (generalmente corto) o consultá con tu mecánico."}
                                            value={nuevoGrupoPreguntaVariante}
                                            onChange={(e) => setNuevoGrupoPreguntaVariante(e.target.value)}
                                            disabled={guardando}
                                            rows={3}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="nuevoGrupoCategoria">Categoría del combo (opcional)</Label>
                                        <Input
                                            id="nuevoGrupoCategoria"
                                            placeholder="Ej: potenciación 110"
                                            value={nuevoGrupoCategoria}
                                            onChange={(e) => setNuevoGrupoCategoria(e.target.value)}
                                            disabled={guardando}
                                        />
                                    </div>
                                </div>
                            )}

                            {grupoSeleccionado !== SIN_GRUPO && grupoSeleccionado !== GRUPO_NUEVO && (() => {
                                const g = grupos.find((x) => String(x.id) === grupoSeleccionado)
                                if (!g) return null
                                return (
                                    <div className="text-xs text-gray-500 rounded-md border p-3 bg-slate-50 space-y-1">
                                        <p><strong>Plantilla del grupo:</strong> {g.plantillas_bienvenida || "—"}</p>
                                        <p><strong>Textos de anuncio del grupo:</strong> {g.plantillas_referral || "—"}</p>
                                        <p><strong>Mensaje de bienvenida del grupo:</strong> {g.mensaje_bienvenida || "—"}</p>
                                        <p><strong>Pregunta de variante:</strong> {g.pregunta_variante || "—"}</p>
                                        <p><strong>Categoría del combo:</strong> {g.categoria || "—"}</p>
                                        <p className="text-violet-600">Para editar estos datos, andá a la pestaña &quot;Grupos&quot;.</p>
                                    </div>
                                )
                            })()}

                            {grupoSeleccionado !== SIN_GRUPO && (
                                <div className="space-y-1">
                                    <Label htmlFor="criterioVariante">Etiqueta de esta variante</Label>
                                    <Input
                                        id="criterioVariante"
                                        placeholder='Ej: "recorrido corto"'
                                        value={form.criterioVariante}
                                        onChange={(e) => actualizarCampo("criterioVariante", e.target.value)}
                                        disabled={guardando}
                                    />
                                </div>
                            )}
                        </div>

                        {grupoSeleccionado === SIN_GRUPO && (
                            <>
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
                                <div className="space-y-1">
                                    <Label htmlFor="plantillasReferral">Textos de anuncio de Meta Ads (headline o body, uno por línea)</Label>
                                    <Textarea
                                        id="plantillasReferral"
                                        placeholder={
                                            "Para cuando el botón del anuncio manda un texto genérico (\"¡Hola! Quiero más información\") en vez de la plantilla fija -- ahí el bot identifica el kit por el título o la descripción del anuncio, que sí vienen fijos. Pegá cualquiera de los dos, uno por línea."
                                        }
                                        value={form.plantillasReferral}
                                        onChange={(e) => actualizarCampo("plantillasReferral", e.target.value)}
                                        disabled={guardando}
                                        rows={3}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="categoria">Categoría del combo (opcional)</Label>
                                    <Input
                                        id="categoria"
                                        placeholder="Ej: potenciación 110"
                                        value={form.categoria}
                                        onChange={(e) => actualizarCampo("categoria", e.target.value)}
                                        disabled={guardando}
                                    />
                                    <p className="text-xs text-gray-400">
                                        Qué resuelve el combo en general — no identifica una pieza, es para cuando el bot
                                        sepa responder preguntas de exploración tipo &quot;qué tenés para potenciar mi 110&quot;.
                                    </p>
                                </div>
                            </>
                        )}

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
                            <Label htmlFor="detalle">Detalle adicional (para preguntas sueltas que no son ni precio ni envío)</Label>
                            <Textarea
                                id="detalle"
                                placeholder="Ej: viene listo para colocar, no hace falta modificar nada del motor."
                                value={form.detalle}
                                onChange={(e) => actualizarCampo("detalle", e.target.value)}
                                disabled={guardando}
                                rows={3}
                            />
                            <p className="text-xs text-gray-400">
                                El bot lo usa cuando el cliente pregunta algo del pack que no es precio ni envío (ej.
                                &quot;¿viene armado?&quot;, &quot;¿hay que tocar algo del motor?&quot;).
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label>Foto (opcional, se manda justo después del mensaje predefinido)</Label>
                            <Input
                                placeholder="Pegar una URL pública de imagen (https://...)"
                                value={form.fotoUrl}
                                onChange={(e) => actualizarCampo("fotoUrl", e.target.value)}
                                disabled={guardando || subiendoFoto}
                            />
                            <div
                                className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer
                                    ${fotoDragging ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50"}`}
                                onClick={() => fotoFileRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setFotoDragging(true) }}
                                onDragLeave={() => setFotoDragging(false)}
                                onDrop={onFotoDrop}
                            >
                                {subiendoFoto ? (
                                    <>
                                        <Loader2 className="h-6 w-6 text-violet-500 animate-spin" />
                                        <p className="text-sm text-slate-600">Subiendo imagen…</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-5 w-5 text-violet-500" />
                                        <p className="text-sm text-slate-600 text-center">
                                            {fotoDragging ? "Soltá la imagen aquí" : "O arrastrá una imagen aquí, o hacé clic para elegirla"}
                                        </p>
                                    </>
                                )}
                            </div>
                            <input ref={fotoFileRef} type="file" accept="image/*" className="hidden" onChange={onFotoFileChange} />

                            {fotoError && <p className="text-sm text-rose-600">{fotoError}</p>}

                            {form.fotoUrl && (
                                <div className="flex items-center gap-3 pt-1">
                                    <img src={form.fotoUrl} alt="Foto del pack" className="h-20 w-20 object-cover rounded-lg border" />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => actualizarCampo("fotoUrl", "")}
                                        disabled={guardando || subiendoFoto}
                                        className="gap-1 text-rose-600"
                                    >
                                        <X size={14} /> Quitar foto
                                    </Button>
                                </div>
                            )}
                        </div>

                        {grupoSeleccionado === SIN_GRUPO && (
                            <div className="space-y-3 pt-6 border-t border-slate-200">
                                <Label>Compatibilidad de este kit</Label>
                                <p className="text-xs text-gray-400">
                                    A nivel del kit COMPLETO (no de una pieza suelta) — evita que el bot diga
                                    &quot;compatible&quot; solo porque una pieza periférica entra en la moto, cuando la pieza
                                    central no. Si este pack pertenece a un grupo, la compatibilidad se carga desde la
                                    pestaña &quot;Grupos&quot; en su lugar (aplica igual para todas las variantes del grupo).
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="compatibleTextoKit">Compatible con (separado por comas)</Label>
                                        <Textarea
                                            id="compatibleTextoKit"
                                            placeholder="Ej: Zanella ZB 110, Motomel Blitz 110"
                                            value={compatibleTexto}
                                            onChange={(e) => setCompatibleTexto(e.target.value)}
                                            disabled={guardando}
                                            rows={4}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="incompatibleTextoKit">No compatible con (separado por comas)</Label>
                                        <Textarea
                                            id="incompatibleTextoKit"
                                            placeholder="Ej: Wave S (hay que alesar los cárteres)"
                                            value={incompatibleTexto}
                                            onChange={(e) => setIncompatibleTexto(e.target.value)}
                                            disabled={guardando}
                                            rows={4}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

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
                                        <TableHead>Grupo</TableHead>
                                        <TableHead>Categoría</TableHead>
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
                                            <TableCell className="text-sm text-gray-500">
                                                {pack.criterio_variante ? (
                                                    <Badge variant="outline" className="font-normal">{pack.criterio_variante}</Badge>
                                                ) : "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-gray-500">
                                                {pack.categoria || grupos.find((g) => g.id === pack.grupo_id)?.categoria || "—"}
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
