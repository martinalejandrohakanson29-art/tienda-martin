"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
    ArrowLeft,
    AlertTriangle,
    Loader2,
    Plus,
    Send,
    Sparkles,
    Trash2,
    Check,
} from "lucide-react"

import {
    iniciarBorrador,
    enviarMensajeBorrador,
    obtenerTurnosBorrador,
    descartarBorrador,
    marcarBorradorPublicado,
    type Borrador,
    type KitBorrador,
} from "@/app/actions/carga-kit-chat"
import { guardarKit, type KitInput } from "@/app/actions/kits-publicidad"

type Turno = { role: "human" | "ai"; content: string }

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
    en_progreso: { texto: "En progreso", clase: "bg-sky-100 text-sky-800 border-sky-200" },
    listo: { texto: "Listo para revisar", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    publicado: { texto: "Publicado", clase: "bg-slate-200 text-slate-700 border-slate-300" },
}

const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

const KIT_VACIO: KitBorrador = { nombre: "", keywords: "", detalle: "", precio: "", envio: "", mensajeBienvenida: "" }

export function CargarKitClient({ borradoresIniciales, error }: { borradoresIniciales: Borrador[]; error: string | null }) {
    const [vista, setVista] = useState<"lista" | "chat">("lista")
    const [borradores, setBorradores] = useState<Borrador[]>(borradoresIniciales)
    const [fallo, setFallo] = useState<string | null>(error)

    const [borradorId, setBorradorId] = useState<number | null>(null)
    const [turnos, setTurnos] = useState<Turno[]>([])
    const [texto, setTexto] = useState("")
    const [enviando, setEnviando] = useState(false)
    const [cargandoBorrador, setCargandoBorrador] = useState(false)
    const [listo, setListo] = useState(false)
    const [kit, setKit] = useState<KitBorrador>(KIT_VACIO)
    const [activo, setActivo] = useState(true)
    const [publicando, setPublicando] = useState(false)
    const [publicado, setPublicado] = useState(false)

    const chatRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" })
    }, [turnos, enviando])

    const refrescarLista = async () => {
        // Recarga simple: volvemos a la lista y dejamos que el usuario reabra si hace falta.
        window.location.reload()
    }

    const abrirNuevo = async () => {
        setFallo(null)
        setCargandoBorrador(true)
        try {
            const r = await iniciarBorrador()
            setBorradorId(r.borradorId)
            setTurnos([{ role: "ai", content: r.mensaje }])
            setListo(false)
            setKit(KIT_VACIO)
            setActivo(true)
            setPublicado(false)
            setVista("chat")
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo iniciar el borrador")
        } finally {
            setCargandoBorrador(false)
        }
    }

    const abrirExistente = async (b: Borrador) => {
        setFallo(null)
        setCargandoBorrador(true)
        try {
            const historial = await obtenerTurnosBorrador(b.id)
            setBorradorId(b.id)
            setTurnos(historial)
            setPublicado(b.estado === "publicado")
            if (b.estado === "listo" || b.estado === "publicado") {
                setListo(true)
                setKit({
                    nombre: b.nombre || "",
                    keywords: b.keywords || "",
                    detalle: b.detalle || "",
                    precio: b.precio || "",
                    envio: b.envio || "",
                    mensajeBienvenida: b.mensajeBienvenida || "",
                })
            } else {
                setListo(false)
                setKit(KIT_VACIO)
            }
            setActivo(true)
            setVista("chat")
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo abrir el borrador")
        } finally {
            setCargandoBorrador(false)
        }
    }

    const enviar = async () => {
        const mensaje = texto.trim()
        if (!mensaje || !borradorId) return
        setTexto("")
        setTurnos((prev) => [...prev, { role: "human", content: mensaje }])
        setEnviando(true)
        setFallo(null)
        try {
            const r = await enviarMensajeBorrador(borradorId, mensaje)
            setTurnos((prev) => [...prev, { role: "ai", content: r.mensaje }])
            if (r.listo && r.kit) {
                setListo(true)
                setKit(r.kit)
            }
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo enviar el mensaje")
        } finally {
            setEnviando(false)
        }
    }

    const descartar = async () => {
        if (!borradorId) return
        if (!confirm("¿Descartar este borrador? No se puede deshacer.")) return
        try {
            await descartarBorrador(borradorId)
            setVista("lista")
            setBorradores((prev) => prev.filter((b) => b.id !== borradorId))
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo descartar")
        }
    }

    const publicar = async () => {
        if (!borradorId) return
        if (!kit.nombre.trim() || !kit.mensajeBienvenida.trim()) {
            setFallo("Nombre y mensaje predefinido son obligatorios para publicar")
            return
        }
        setPublicando(true)
        setFallo(null)
        try {
            const input: KitInput = {
                nombre: kit.nombre,
                keywords: kit.keywords,
                detalle: kit.detalle,
                precio: kit.precio,
                envio: kit.envio,
                mensajeBienvenida: kit.mensajeBienvenida,
                activo,
            }
            await guardarKit(input)
            await marcarBorradorPublicado(borradorId)
            setPublicado(true)
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo publicar el kit")
        } finally {
            setPublicando(false)
        }
    }

    if (vista === "lista") {
        return (
            <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <Link
                            href="/admin/chatwoot"
                            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
                        >
                            <ArrowLeft className="h-4 w-4" /> Volver a Chatwoot
                        </Link>
                        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                            <Sparkles className="h-8 w-8 text-fuchsia-600" /> Cargar Kit (asistido)
                        </h1>
                        <p className="max-w-2xl text-gray-500">
                            Charlá con el asistente y él arma el kit con el formato correcto — vos revisás y confirmás
                            antes de que se publique.
                        </p>
                    </div>
                    <Button onClick={abrirNuevo} disabled={cargandoBorrador} className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
                        {cargandoBorrador ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Nuevo borrador
                    </Button>
                </div>

                {fallo && (
                    <Card className="border-l-4 border-l-red-500">
                        <CardContent className="flex items-start gap-3 py-4 text-sm text-red-700">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                            <span>{fallo}</span>
                        </CardContent>
                    </Card>
                )}

                {borradores.length === 0 ? (
                    <Card>
                        <CardContent className="py-10 text-center text-gray-500">
                            Todavía no hay borradores. Arrancá uno nuevo arriba.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {borradores.map((b) => {
                            const badge = ETIQUETA_ESTADO[b.estado] || ETIQUETA_ESTADO.en_progreso
                            return (
                                <Card key={b.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => abrirExistente(b)}>
                                    <CardContent className="flex flex-wrap items-center gap-3 py-4">
                                        <Badge variant="outline" className={badge.clase}>
                                            {badge.texto}
                                        </Badge>
                                        <span className="font-medium text-gray-800">{b.nombre || "(sin nombre todavía)"}</span>
                                        <span className="ml-auto text-xs text-gray-400">{fechaCorta(b.actualizadoEn)}</span>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => { setVista("lista"); refrescarLista() }}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
                >
                    <ArrowLeft className="h-4 w-4" /> Volver a la lista
                </button>
                {!publicado && (
                    <Button variant="ghost" size="sm" onClick={descartar} className="gap-1 text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" /> Descartar
                    </Button>
                )}
            </div>

            {fallo && (
                <Card className="border-l-4 border-l-red-500">
                    <CardContent className="flex items-start gap-3 py-4 text-sm text-red-700">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <span>{fallo}</span>
                    </CardContent>
                </Card>
            )}

            <Card className="overflow-hidden shadow-md border-t-4 border-t-fuchsia-500">
                <CardHeader className="bg-fuchsia-600 text-white">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="h-5 w-5" /> Asistente de carga
                    </CardTitle>
                </CardHeader>
                <div ref={chatRef} className="h-[420px] overflow-y-auto bg-gray-50 px-4 py-4 space-y-2">
                    {turnos.map((t, i) => (
                        <div key={i} className={`flex ${t.role === "human" ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm whitespace-pre-wrap break-words text-sm ${
                                    t.role === "human" ? "rounded-tr-sm bg-fuchsia-600 text-white" : "rounded-tl-sm bg-white text-gray-800"
                                }`}
                            >
                                {t.content}
                            </div>
                        </div>
                    ))}
                    {enviando && (
                        <div className="flex justify-start">
                            <div className="rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            </div>
                        </div>
                    )}
                </div>
                {!publicado && (
                    <div className="flex gap-2 border-t bg-white p-3">
                        <Input
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !enviando) enviar() }}
                            placeholder="Escribí tu respuesta..."
                            disabled={enviando || cargandoBorrador}
                        />
                        <Button onClick={enviar} disabled={enviando || cargandoBorrador || !texto.trim()} className="gap-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </Card>

            {listo && (
                <Card className="border-t-4 border-t-emerald-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="text-xl">Revisar antes de publicar</CardTitle>
                        <CardDescription>Podés editar cualquier campo antes de confirmar.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label>Nombre del kit</Label>
                                <Input value={kit.nombre} onChange={(e) => setKit((k) => ({ ...k, nombre: e.target.value }))} disabled={publicado} />
                            </div>
                            <div className="space-y-1">
                                <Label>Palabras clave</Label>
                                <Input value={kit.keywords} onChange={(e) => setKit((k) => ({ ...k, keywords: e.target.value }))} disabled={publicado} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Detalle</Label>
                            <Textarea rows={4} value={kit.detalle} onChange={(e) => setKit((k) => ({ ...k, detalle: e.target.value }))} disabled={publicado} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label>Precio</Label>
                                <Input value={kit.precio} onChange={(e) => setKit((k) => ({ ...k, precio: e.target.value }))} disabled={publicado} />
                            </div>
                            <div className="space-y-1">
                                <Label>Envío</Label>
                                <Input value={kit.envio} onChange={(e) => setKit((k) => ({ ...k, envio: e.target.value }))} disabled={publicado} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Mensaje predefinido</Label>
                            <Textarea rows={5} value={kit.mensajeBienvenida} onChange={(e) => setKit((k) => ({ ...k, mensajeBienvenida: e.target.value }))} disabled={publicado} />
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="activo" checked={activo} onCheckedChange={(c) => setActivo(Boolean(c))} disabled={publicado} />
                            <Label htmlFor="activo" className="cursor-pointer">Actualmente en publicidad</Label>
                        </div>

                        {publicado ? (
                            <p className="flex items-center gap-2 text-sm text-emerald-700">
                                <Check className="h-4 w-4" /> Kit publicado. Ya está disponible en Base de Conocimiento.
                            </p>
                        ) : (
                            <Button onClick={publicar} disabled={publicando} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                                {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Publicar kit
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
