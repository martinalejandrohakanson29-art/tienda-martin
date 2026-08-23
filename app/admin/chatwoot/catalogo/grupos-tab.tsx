"use client"

import { useMemo, useRef, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Save, Loader2, Pencil, Trash2, X, AlertTriangle, Search, Upload } from "lucide-react"

import {
    guardarChatPackGrupo,
    eliminarChatPackGrupo,
    alternarActivoChatPackGrupo,
    sincronizarCompatibilidadGrupo,
    getChatComboCompatibilidades,
    type ChatPackGrupo,
    type ChatPackGrupoInput,
    type ChatPack,
    type ChatComboCompatibilidad,
} from "@/app/actions/chat-catalogo"
import { matchTodasPalabras } from "@/lib/busqueda-texto"
import { formatearListaCompat } from "@/lib/compatibilidad-texto"

const FORM_VACIO: ChatPackGrupoInput = {
    nombre: "",
    plantillasBienvenida: "",
    mensajeBienvenida: "",
    preguntaVariante: "",
    fotoUrl: "",
    categoria: "",
}

export function GruposTab({
    gruposIniciales,
    errorInicial,
    packsIniciales,
    compatibilidadesComboIniciales,
}: {
    gruposIniciales: ChatPackGrupo[]
    errorInicial: string | null
    packsIniciales: ChatPack[]
    compatibilidadesComboIniciales: ChatComboCompatibilidad[]
}) {
    const [grupos, setGrupos] = useState<ChatPackGrupo[]>(gruposIniciales)
    const [form, setForm] = useState<ChatPackGrupoInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)
    const [busqueda, setBusqueda] = useState("")

    const [compatCombo, setCompatCombo] = useState<ChatComboCompatibilidad[]>(compatibilidadesComboIniciales)
    const [compatibleTexto, setCompatibleTexto] = useState("")
    const [incompatibleTexto, setIncompatibleTexto] = useState("")

    const [fotoDragging, setFotoDragging] = useState(false)
    const [subiendoFoto, setSubiendoFoto] = useState(false)
    const [fotoError, setFotoError] = useState<string | null>(null)
    const fotoFileRef = useRef<HTMLInputElement>(null)

    const editando = form.id !== undefined

    const packsPorGrupo = useMemo(() => {
        const mapa = new Map<number, ChatPack[]>()
        for (const p of packsIniciales) {
            if (!p.grupo_id) continue
            const lista = mapa.get(p.grupo_id) || []
            lista.push(p)
            mapa.set(p.grupo_id, lista)
        }
        return mapa
    }, [packsIniciales])

    const gruposFiltrados = useMemo(() => {
        if (!busqueda.trim()) return grupos
        return grupos.filter((g) => matchTodasPalabras(g.nombre, busqueda))
    }, [grupos, busqueda])

    const actualizarCampo = <K extends keyof ChatPackGrupoInput>(campo: K, valor: ChatPackGrupoInput[K]) => {
        setForm((prev) => ({ ...prev, [campo]: valor }))
    }

    const editarGrupo = (grupo: ChatPackGrupo) => {
        setForm({
            id: grupo.id,
            nombre: grupo.nombre,
            plantillasBienvenida: grupo.plantillas_bienvenida || "",
            mensajeBienvenida: grupo.mensaje_bienvenida || "",
            preguntaVariante: grupo.pregunta_variante || "",
            fotoUrl: grupo.foto_url || "",
            categoria: grupo.categoria || "",
        })
        setFotoError(null)
        const propias = compatCombo.filter((c) => c.grupo_id === grupo.id)
        setCompatibleTexto(formatearListaCompat(propias.filter((c) => c.compatible)))
        setIncompatibleTexto(formatearListaCompat(propias.filter((c) => !c.compatible)))
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => {
        setForm(FORM_VACIO)
        setFotoError(null)
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
            const resultado = await guardarChatPackGrupo(form)
            const id = resultado.id
            await sincronizarCompatibilidadGrupo(id, compatibleTexto, incompatibleTexto)
            const compatActualizada = await getChatComboCompatibilidades()
            setCompatCombo(compatActualizada)
            const actualizado: ChatPackGrupo = {
                id,
                nombre: form.nombre.trim(),
                plantillas_bienvenida: form.plantillasBienvenida.trim() || null,
                mensaje_bienvenida: form.mensajeBienvenida.trim() || null,
                pregunta_variante: form.preguntaVariante.trim() || null,
                foto_url: form.fotoUrl.trim() || null,
                categoria: form.categoria.trim() || null,
                activo: grupos.find((g) => g.id === form.id)?.activo ?? true,
            }
            setGrupos((prev) => {
                const existe = prev.some((g) => g.id === actualizado.id)
                const siguiente = existe ? prev.map((g) => (g.id === actualizado.id ? actualizado : g)) : [...prev, actualizado]
                return siguiente.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
            })
            cancelarEdicion()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al guardar el grupo")
        } finally {
            setGuardando(false)
        }
    }

    const handleEliminar = async (id: number) => {
        if (!confirm("¿Eliminar este grupo?")) return
        try {
            await eliminarChatPackGrupo(id)
            setGrupos((prev) => prev.filter((g) => g.id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    const handleToggleActivo = async (grupo: ChatPackGrupo) => {
        const nuevoEstado = !grupo.activo
        setGrupos((prev) => prev.map((g) => (g.id === grupo.id ? { ...g, activo: nuevoEstado } : g)))
        try {
            await alternarActivoChatPackGrupo(grupo.id, nuevoEstado)
        } catch (err) {
            setGrupos((prev) => prev.map((g) => (g.id === grupo.id ? { ...g, activo: grupo.activo } : g)))
            alert(err instanceof Error ? err.message : "Error al cambiar el estado")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Un grupo junta 2+ packs que corresponden al mismo anuncio de Instagram pero son productos reales
                distintos (ej. Kit 120 recorrido corto/largo). La resolución es en 2 pasos: el mensaje de bienvenida
                pregunta primero la moto (para confirmar compatibilidad antes de ofrecer nada) y, recién si es
                compatible, la pregunta de variante de abajo resuelve cuál pack corresponde. Los packs se enganchan
                a un grupo desde la pestaña &quot;Packs&quot;.
            </p>

            {error && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{error}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t-4 border-t-fuchsia-500 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-xl">
                        <span>{editando ? `Editar: ${form.nombre}` : "Nuevo Grupo"}</span>
                        {editando && (
                            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion} className="gap-1">
                                <X size={16} /> Cancelar edición
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1">
                            <Label htmlFor="nombre">Nombre del grupo</Label>
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
                            <Label htmlFor="categoria">Categoría del combo (opcional)</Label>
                            <Input
                                id="categoria"
                                placeholder="Ej: potenciación 110"
                                value={form.categoria}
                                onChange={(e) => actualizarCampo("categoria", e.target.value)}
                                disabled={guardando}
                            />
                            <p className="text-xs text-gray-400">
                                Qué resuelve el combo en general — no identifica una pieza, es para cuando el bot sepa
                                responder preguntas de exploración tipo &quot;qué tenés para potenciar mi 110&quot;.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="plantillasBienvenida">Plantilla exacta compartida de Instagram/Meta Ads</Label>
                            <Textarea
                                id="plantillasBienvenida"
                                placeholder="Pegá acá el texto tal cual lo manda la plantilla del anuncio."
                                value={form.plantillasBienvenida}
                                onChange={(e) => actualizarCampo("plantillasBienvenida", e.target.value)}
                                disabled={guardando}
                                rows={3}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="mensajeBienvenida">Mensaje de bienvenida genérico (con la pregunta de desambiguación)</Label>
                            <Textarea
                                id="mensajeBienvenida"
                                placeholder={"Hola amigo, ¿cómo va?\n\nTenemos el combo para potenciar tu 110...\n\nA que moto se lo queres poner?"}
                                value={form.mensajeBienvenida}
                                onChange={(e) => actualizarCampo("mensajeBienvenida", e.target.value)}
                                disabled={guardando}
                                rows={6}
                                required
                            />
                            <p className="text-xs text-gray-400">
                                Se manda tal cual, sin mencionar precio (ahí está la ambigüedad) — recién cuando el cliente
                                contesta se pinea el pack definitivo y se manda su mensaje con precio real.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="preguntaVariante">Pregunta de variante (corto/largo, una vez confirmada la compatibilidad)</Label>
                            <Textarea
                                id="preguntaVariante"
                                placeholder={"Genial, tu moto es compatible! Ahora decime: ¿es corto o largo? Fijate si el cilindro es negro (generalmente corto) o consultá con tu mecánico."}
                                value={form.preguntaVariante}
                                onChange={(e) => actualizarCampo("preguntaVariante", e.target.value)}
                                disabled={guardando}
                                rows={3}
                            />
                            <p className="text-xs text-gray-400">
                                El mensaje de bienvenida de arriba pregunta primero la moto (para confirmar compatibilidad);
                                esta es la segunda pregunta, recién después de confirmar que es compatible.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label>Foto (opcional)</Label>
                            <Input
                                placeholder="Pegar una URL pública de imagen (https://...)"
                                value={form.fotoUrl}
                                onChange={(e) => actualizarCampo("fotoUrl", e.target.value)}
                                disabled={guardando || subiendoFoto}
                            />
                            <div
                                className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer
                                    ${fotoDragging ? "border-fuchsia-400 bg-fuchsia-50" : "border-slate-200 bg-slate-50 hover:border-fuchsia-300 hover:bg-fuchsia-50/50"}`}
                                onClick={() => fotoFileRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setFotoDragging(true) }}
                                onDragLeave={() => setFotoDragging(false)}
                                onDrop={onFotoDrop}
                            >
                                {subiendoFoto ? (
                                    <>
                                        <Loader2 className="h-6 w-6 text-fuchsia-500 animate-spin" />
                                        <p className="text-sm text-slate-600">Subiendo imagen…</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-5 w-5 text-fuchsia-500" />
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
                                    <img src={form.fotoUrl} alt="Foto del grupo" className="h-20 w-20 object-cover rounded-lg border" />
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

                        <div className="space-y-3 pt-6 border-t border-slate-200">
                            <Label>Compatibilidad de este combo</Label>
                            <p className="text-xs text-gray-400">
                                A nivel del combo COMPLETO (no de una pieza suelta) — evita que el bot diga
                                &quot;compatible&quot; solo porque una pieza periférica (filtro de aire, codo de admisión) entra
                                en la moto, cuando la pieza central (el cilindro) no. Aplica igual para el recorrido corto
                                y el largo de este grupo.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="compatibleTextoGrupo">Compatible con (separado por comas)</Label>
                                    <Textarea
                                        id="compatibleTextoGrupo"
                                        placeholder="Ej: Zanella ZB 110, Motomel Blitz 110"
                                        value={compatibleTexto}
                                        onChange={(e) => setCompatibleTexto(e.target.value)}
                                        disabled={guardando}
                                        rows={4}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="incompatibleTextoGrupo">No compatible con (separado por comas)</Label>
                                    <Textarea
                                        id="incompatibleTextoGrupo"
                                        placeholder="Ej: Wave S (hay que alesar los cárteres)"
                                        value={incompatibleTexto}
                                        onChange={(e) => setIncompatibleTexto(e.target.value)}
                                        disabled={guardando}
                                        rows={4}
                                    />
                                </div>
                            </div>
                        </div>

                        <Button type="submit" disabled={guardando || !form.nombre || !form.mensajeBienvenida} className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar grupo"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Grupos Cargados</CardTitle>
                    <CardDescription>
                        {busqueda
                            ? `${gruposFiltrados.length} de ${grupos.length} grupo(s).`
                            : `${grupos.length} grupo(s) en la base.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {grupos.length > 0 && (
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por nombre…"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    )}
                    {grupos.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">
                            Todavía no cargaste ningún grupo. Se crean desde acá, o al vuelo desde la pestaña &quot;Packs&quot;.
                        </p>
                    ) : gruposFiltrados.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Ningún grupo coincide con la búsqueda.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Categoría</TableHead>
                                        <TableHead>Packs enganchados</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {gruposFiltrados.map((grupo) => {
                                        const packs = packsPorGrupo.get(grupo.id) || []
                                        return (
                                            <TableRow key={grupo.id}>
                                                <TableCell className="font-medium">{grupo.nombre}</TableCell>
                                                <TableCell className="text-sm text-gray-500">{grupo.categoria || "—"}</TableCell>
                                                <TableCell className="text-sm text-gray-500">
                                                    {packs.length === 0 ? (
                                                        "—"
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1">
                                                            {packs.map((p) => (
                                                                <Badge key={p.id} variant="outline" className="font-normal">
                                                                    {p.criterio_variante || p.nombre}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        onClick={() => handleToggleActivo(grupo)}
                                                        className={`cursor-pointer select-none ${grupo.activo ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
                                                    >
                                                        {grupo.activo ? "Activo" : "Pausado"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button variant="ghost" size="sm" onClick={() => editarGrupo(grupo)}>
                                                        <Pencil size={16} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleEliminar(grupo.id)}>
                                                        <Trash2 size={16} className="text-red-500" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
