"use client"

import { useRef, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Save, Loader2, Wand2, Pencil, Trash2, X, AlertTriangle, Upload } from "lucide-react"

import { guardarKit, eliminarKit, alternarActivo, type Kit, type KitInput } from "@/app/actions/kits-publicidad"
import {
    getCompatibilidades,
    sincronizarCompatibilidadesKit,
    type Compatibilidad,
} from "@/app/actions/compatibilidades"
import { generarMensajeKit } from "@/lib/kits-mensaje"
import { formatearListaCompat } from "@/lib/compatibilidad-texto"

const FORM_VACIO: KitInput = {
    nombre: "",
    keywords: "",
    detalle: "",
    precio: "",
    envio: "",
    mensajeBienvenida: "",
    fotoUrl: "",
    plantillasBienvenida: "",
    activo: true,
}

export function KitsTab({
    kitsIniciales,
    errorInicial,
    compatibilidadesIniciales,
}: {
    kitsIniciales: Kit[]
    errorInicial: string | null
    compatibilidadesIniciales: Compatibilidad[]
}) {
    const [kits, setKits] = useState<Kit[]>(kitsIniciales)
    const [form, setForm] = useState<KitInput>(FORM_VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)
    const [fotoDragging, setFotoDragging] = useState(false)
    const [subiendoFoto, setSubiendoFoto] = useState(false)
    const [fotoError, setFotoError] = useState<string | null>(null)
    const fotoFileRef = useRef<HTMLInputElement>(null)

    const [compatList, setCompatList] = useState<Compatibilidad[]>(compatibilidadesIniciales)
    const [compatibleTexto, setCompatibleTexto] = useState("")
    const [incompatibleTexto, setIncompatibleTexto] = useState("")

    const editando = form.id !== undefined

    const actualizarCampo = <K extends keyof KitInput>(campo: K, valor: KitInput[K]) => {
        setForm((prev) => ({ ...prev, [campo]: valor }))
    }

    const generarMensaje = () => {
        actualizarCampo("mensajeBienvenida", generarMensajeKit(form))
    }

    const editarKit = (kit: Kit) => {
        setForm({
            id: kit.id,
            nombre: kit.nombre,
            keywords: kit.keywords || "",
            detalle: kit.detalle || "",
            precio: kit.precio || "",
            envio: kit.envio || "",
            mensajeBienvenida: kit.mensaje_bienvenida,
            fotoUrl: kit.foto_url || "",
            plantillasBienvenida: kit.plantillas_bienvenida || "",
            activo: kit.activo,
        })
        const propios = compatList.filter((c) => c.kit_id === kit.id)
        setCompatibleTexto(formatearListaCompat(propios.filter((c) => c.compatible)))
        setIncompatibleTexto(formatearListaCompat(propios.filter((c) => !c.compatible)))
        setFotoError(null)
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const cancelarEdicion = () => {
        setForm(FORM_VACIO)
        setCompatibleTexto("")
        setIncompatibleTexto("")
        setFotoError(null)
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
            const resultado = await guardarKit(form)
            const kitId = resultado.id!
            await sincronizarCompatibilidadesKit(kitId, compatibleTexto, incompatibleTexto)
            const compatActualizadas = await getCompatibilidades()
            setCompatList(compatActualizadas)

            const actualizado: Kit = {
                id: kitId,
                nombre: form.nombre.trim(),
                keywords: form.keywords,
                detalle: form.detalle,
                precio: form.precio,
                envio: form.envio,
                mensaje_bienvenida: form.mensajeBienvenida.trim(),
                foto_url: form.fotoUrl.trim() || null,
                plantillas_bienvenida: form.plantillasBienvenida || null,
                activo: form.activo,
                creado_en: kits.find((k) => k.id === form.id)?.creado_en || new Date(),
            }
            setKits((prev) => {
                const existe = prev.some((k) => k.id === actualizado.id)
                return existe
                    ? prev.map((k) => (k.id === actualizado.id ? actualizado : k))
                    : [actualizado, ...prev]
            })
            setForm(FORM_VACIO)
            setCompatibleTexto("")
            setIncompatibleTexto("")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al guardar el kit")
        } finally {
            setGuardando(false)
        }
    }

    const handleEliminar = async (id: number) => {
        if (!confirm("¿Eliminar este kit? También se borra su info de precios_stock y de compatibilidad.")) return
        try {
            await eliminarKit(id)
            setKits((prev) => prev.filter((k) => k.id !== id))
            setCompatList((prev) => prev.filter((c) => c.kit_id !== id))
            if (form.id === id) cancelarEdicion()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error al eliminar")
        }
    }

    const handleToggleActivo = async (kit: Kit) => {
        const nuevoEstado = !kit.activo
        setKits((prev) => prev.map((k) => (k.id === kit.id ? { ...k, activo: nuevoEstado } : k)))
        try {
            await alternarActivo(kit.id, nuevoEstado)
        } catch (err) {
            setKits((prev) => prev.map((k) => (k.id === kit.id ? { ...k, activo: kit.activo } : k)))
            alert(err instanceof Error ? err.message : "Error al cambiar el estado")
        }
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Los kits marcados como &quot;en publicidad&quot; disparan un mensaje predefinido apenas un cliente
                los menciona explícitamente por WhatsApp; el resto queda disponible para que el agente responda
                preguntas de precio/stock sin escalar a un humano.
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
                        <span>{editando ? `Editar: ${form.nombre}` : "Nuevo Kit"}</span>
                        {editando && (
                            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion} className="gap-1">
                                <X size={16} /> Cancelar edición
                            </Button>
                        )}
                    </CardTitle>
                    <CardDescription>
                        El nombre y las palabras clave se usan para reconocer cuándo un cliente pregunta por este kit.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="nombre">Nombre del kit</Label>
                                <Input
                                    id="nombre"
                                    placeholder="Ej: Kit 120"
                                    value={form.nombre}
                                    onChange={(e) => actualizarCampo("nombre", e.target.value)}
                                    disabled={guardando}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="keywords">Palabras clave (separadas por coma)</Label>
                                <Input
                                    id="keywords"
                                    placeholder="Ej: kit 120, cilindro 120, potenciar la 110"
                                    value={form.keywords}
                                    onChange={(e) => actualizarCampo("keywords", e.target.value)}
                                    disabled={guardando}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="plantillasBienvenida">
                                Plantillas exactas de Instagram/Meta Ads (una por línea)
                            </Label>
                            <Textarea
                                id="plantillasBienvenida"
                                placeholder={"Pegá acá el texto tal cual lo manda la plantilla del anuncio, una por línea, si hay más de una campaña para este kit.\n¡Hola! Quiero conocer mas sobre el combo 110 a 120 + Codo y carbu!!"}
                                value={form.plantillasBienvenida}
                                onChange={(e) => actualizarCampo("plantillasBienvenida", e.target.value)}
                                disabled={guardando}
                                rows={2}
                            />
                            <p className="text-xs text-gray-400">
                                Si el mensaje del cliente coincide exactamente con una de estas líneas, el bot reconoce
                                el kit de una sin tener que interpretarlo — pegá el texto literal de la plantilla, no un resumen.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="detalle">Detalle (qué incluye / para qué sirve)</Label>
                            <Textarea
                                id="detalle"
                                placeholder="Ej: Cilindro 120, carburador CG 125, codo de admisión y filtro. Ideal para mejorar la respuesta y el andar en uso diario."
                                value={form.detalle}
                                onChange={(e) => actualizarCampo("detalle", e.target.value)}
                                disabled={guardando}
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="compatibleTexto">Compatible con (separado por comas)</Label>
                                <Textarea
                                    id="compatibleTexto"
                                    placeholder="Ej: Zanella ZB 110 (recorrido corto), Honda Wave 110, Guerrero Trip 110"
                                    value={compatibleTexto}
                                    onChange={(e) => setCompatibleTexto(e.target.value)}
                                    disabled={guardando}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="incompatibleTexto">No compatible con (separado por comas)</Label>
                                <Textarea
                                    id="incompatibleTexto"
                                    placeholder="Ej: Honda Wave NF, Yamaha Crypton 110"
                                    value={incompatibleTexto}
                                    onChange={(e) => setIncompatibleTexto(e.target.value)}
                                    disabled={guardando}
                                    rows={3}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 -mt-2">
                            Esto es lo que el agente consulta para responder &quot;¿anda en tal moto?&quot; sin escalar a un
                            humano — al guardar el kit se reemplaza la lista completa. Para agregar una aclaración a un
                            modelo puntual, escribila entre paréntesis justo después: <em>Zanella ZB 110 (para recorrido corto)</em>.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="precio">Precio</Label>
                                <Input
                                    id="precio"
                                    placeholder="Ej: $99.000"
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
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="mensajeBienvenida">Mensaje predefinido (se manda tal cual, como lo pegaría un humano)</Label>
                                <Button type="button" variant="outline" size="sm" onClick={generarMensaje} className="gap-1">
                                    <Wand2 size={14} /> Generar desde los datos de arriba
                                </Button>
                            </div>
                            <Textarea
                                id="mensajeBienvenida"
                                placeholder={"Hola amigo, ¿cómo va?\n\nEl combo incluye...\n\nEl precio es $..., con envío gratis.\n\n¿Para qué moto lo estás buscando?"}
                                value={form.mensajeBienvenida}
                                onChange={(e) => actualizarCampo("mensajeBienvenida", e.target.value)}
                                disabled={guardando}
                                rows={6}
                                required
                            />
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
                                    <img src={form.fotoUrl} alt="Foto del kit" className="h-20 w-20 object-cover rounded-lg border" />
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

                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="activo"
                                checked={form.activo}
                                onCheckedChange={(checked) => actualizarCampo("activo", checked)}
                                disabled={guardando}
                            />
                            <Label htmlFor="activo" className="cursor-pointer">
                                Actualmente en publicidad (manda el mensaje predefinido automáticamente)
                            </Label>
                        </div>

                        <Button type="submit" disabled={guardando || !form.nombre || !form.mensajeBienvenida} className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
                            {guardando ? (
                                <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                            ) : (
                                <><Save size={18} /> {editando ? "Guardar cambios" : "Guardar kit"}</>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Kits Cargados</CardTitle>
                    <CardDescription>{kits.length} kit(s) en la base.</CardDescription>
                </CardHeader>
                <CardContent>
                    {kits.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">Todavía no cargaste ningún kit.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Palabras clave</TableHead>
                                        <TableHead>Precio</TableHead>
                                        <TableHead>Envío</TableHead>
                                        <TableHead>Publicidad</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {kits.map((kit) => (
                                        <TableRow key={kit.id}>
                                            <TableCell className="font-medium">{kit.nombre}</TableCell>
                                            <TableCell className="text-sm text-gray-500 max-w-[240px] truncate">{kit.keywords || "—"}</TableCell>
                                            <TableCell>{kit.precio || "—"}</TableCell>
                                            <TableCell>{kit.envio || "—"}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    onClick={() => handleToggleActivo(kit)}
                                                    className={`cursor-pointer select-none ${kit.activo ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
                                                >
                                                    {kit.activo ? "Activo" : "Pausado"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="sm" onClick={() => editarKit(kit)}>
                                                    <Pencil size={16} />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleEliminar(kit.id)}>
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
