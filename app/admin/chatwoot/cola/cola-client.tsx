"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    ExternalLink,
    Loader2,
    Pencil,
    RefreshCw,
    RotateCcw,
    Send,
    Trash2,
    X,
} from "lucide-react"
import {
    descartarConversacion,
    descartarRespuesta,
    descartarTodo,
    despacharColaAhora,
    editarRespuesta,
    obtenerPanelBot,
    reintentarRespuesta,
    type PanelBot,
    type RespuestaEnCola,
} from "@/app/actions/bot-onoff"

// Lo que el bot dejó listo mientras el local estaba cerrado. Se agrupa por
// conversación porque una misma respuesta puede venir partida en varios
// mensajes (el workflow corta por oraciones para que se lea como WhatsApp).

const ETIQUETA_ORIGEN: Record<string, string> = {
    respuesta: "Respuesta",
    aprendizaje_tecnico: "Aprendió del equipo (técnica)",
    aprendizaje_negocio: "Aprendió del equipo (negocio)",
    aprendizaje_precio: "Aprendió del equipo (precio)",
    saludo_kit: "Saludo de kit",
    pregunta_ambigua: "Repregunta de kit",
}

const ESTADO_BADGE: Record<string, { texto: string; clase: string }> = {
    pendiente: { texto: "En cola", clase: "bg-amber-100 text-amber-800 border-amber-200" },
    enviando: { texto: "Saliendo", clase: "bg-blue-100 text-blue-800 border-blue-200" },
    enviado: { texto: "Enviado", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    descartado: { texto: "Descartado", clase: "bg-slate-100 text-slate-600 border-slate-200" },
    error: { texto: "Falló", clase: "bg-red-100 text-red-800 border-red-200" },
}

const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export function ColaClient({
    inicial,
    error,
    chatwootUrl,
}: {
    inicial: PanelBot | null
    error: string | null
    chatwootUrl: string
}) {
    const [panel, setPanel] = useState<PanelBot | null>(inicial)
    const [fallo, setFallo] = useState<string | null>(error)
    const [pendiente, arrancarTransicion] = useTransition()
    const [editandoId, setEditandoId] = useState<number | null>(null)
    const [textoEditado, setTextoEditado] = useState("")
    const [confirmarDescartarTodo, setConfirmarDescartarTodo] = useState(false)

    const refrescar = async () => {
        try {
            setPanel(await obtenerPanelBot())
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo leer la cola")
        }
    }

    useEffect(() => {
        if (!panel?.despachando) return
        const t = setInterval(refrescar, 4000)
        return () => clearInterval(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panel?.despachando])

    const correr = (accion: () => Promise<unknown>) => {
        setFallo(null)
        arrancarTransicion(async () => {
            try {
                await accion()
                await refrescar()
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo completar la acción")
            }
        })
    }

    // Una tarjeta por conversación, en orden de llegada.
    const grupos = useMemo(() => {
        const mapa = new Map<number, RespuestaEnCola[]>()
        for (const fila of panel?.cola ?? []) {
            const lista = mapa.get(fila.conversationId) ?? []
            lista.push(fila)
            mapa.set(fila.conversationId, lista)
        }
        return [...mapa.entries()].map(([conversationId, filas]) => ({ conversationId, filas }))
    }, [panel?.cola])

    const enCola = (panel?.cola ?? []).filter((f) => f.estado === "pendiente" || f.estado === "enviando").length
    const conError = (panel?.cola ?? []).filter((f) => f.estado === "error").length

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
                    <h1 className="text-3xl font-bold tracking-tight">Respuestas en cola</h1>
                    <p className="max-w-2xl text-gray-500">
                        Lo que el bot dejó listo con el local cerrado. Cuando prendas el bot sale solo, escalonado.
                        Revisá acá si algún precio quedó viejo: podés editar el texto o descartar la respuesta antes
                        de que salga.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => correr(async () => { })} disabled={pendiente}>
                        {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    {enCola > 0 && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => setConfirmarDescartarTodo(true)}
                                disabled={pendiente}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Descartar todo
                            </Button>
                            <Button size="sm" onClick={() => correr(despacharColaAhora)} disabled={pendiente}>
                                <Send className="mr-2 h-4 w-4" /> Enviar ahora ({enCola})
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {fallo && (
                <Card className="border-l-4 border-l-red-500">
                    <CardContent className="flex items-start gap-3 py-4 text-sm text-red-700">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <span>{fallo}</span>
                    </CardContent>
                </Card>
            )}

            {panel && !panel.encendido && enCola > 0 && (
                <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    El bot está en pausa. Estas respuestas van a salir solas cuando lo prendas desde la pantalla de
                    Chatwoot. &quot;Enviar ahora&quot; las manda igual, sin prender el bot.
                </p>
            )}

            {conError > 0 && (
                <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
                    {conError} {conError === 1 ? "respuesta falló" : "respuestas fallaron"} al salir. Mirá el motivo
                    debajo del mensaje y reintentá.
                </p>
            )}

            {grupos.length === 0 && !fallo && (
                <Card>
                    <CardContent className="py-10 text-center text-gray-500">
                        No hay nada en la cola. Todo lo que llegó ya se contestó en el momento.
                    </CardContent>
                </Card>
            )}

            {grupos.map(({ conversationId, filas }) => {
                const contacto = filas.find((f) => f.contacto)?.contacto
                const activas = filas.filter((f) => f.estado === "pendiente" || f.estado === "enviando" || f.estado === "error")
                return (
                    <Card key={conversationId}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                            <div>
                                <CardTitle className="text-base">
                                    {contacto || `Conversación #${conversationId}`}
                                </CardTitle>
                                <p className="text-xs text-gray-500">
                                    {filas.length} {filas.length === 1 ? "mensaje" : "mensajes"} · desde{" "}
                                    {fechaCorta(filas[0].creadoEn)}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={`${chatwootUrl}/app/accounts/${filas[0].accountId}/conversations/${conversationId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
                                >
                                    Ver en Chatwoot <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                                {activas.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700"
                                        disabled={pendiente}
                                        onClick={() => correr(() => descartarConversacion(conversationId))}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {filas.map((fila) => {
                                const badge = ESTADO_BADGE[fila.estado] ?? ESTADO_BADGE.pendiente
                                const editable = fila.estado === "pendiente" || fila.estado === "error"
                                return (
                                    <div
                                        key={fila.id}
                                        className={`rounded-lg border p-3 ${fila.estado === "descartado" ? "opacity-60" : ""}`}
                                    >
                                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                            <Badge variant="outline" className={badge.clase}>
                                                {badge.texto}
                                            </Badge>
                                            <span className="text-gray-500">
                                                {ETIQUETA_ORIGEN[fila.origen] ?? fila.origen}
                                            </span>
                                            <span className="text-gray-400">· generada {fechaCorta(fila.creadoEn)}</span>
                                            {fila.enviadoEn && (
                                                <span className="text-gray-400">· salió {fechaCorta(fila.enviadoEn)}</span>
                                            )}
                                        </div>

                                        {editandoId === fila.id ? (
                                            <div className="space-y-2">
                                                <Textarea
                                                    value={textoEditado}
                                                    onChange={(e) => setTextoEditado(e.target.value)}
                                                    rows={3}
                                                />
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        disabled={pendiente}
                                                        onClick={() =>
                                                            correr(async () => {
                                                                await editarRespuesta(fila.id, textoEditado)
                                                                setEditandoId(null)
                                                            })
                                                        }
                                                    >
                                                        <Check className="mr-2 h-4 w-4" /> Guardar
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setEditandoId(null)}>
                                                        <X className="mr-2 h-4 w-4" /> Cancelar
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="whitespace-pre-wrap text-sm text-gray-800">{fila.contenido}</p>
                                        )}

                                        {fila.motivo && (
                                            <p className="mt-2 text-xs text-gray-500">{fila.motivo}</p>
                                        )}

                                        {editandoId !== fila.id && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {editable && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setEditandoId(fila.id)
                                                            setTextoEditado(fila.contenido)
                                                        }}
                                                    >
                                                        <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                                                    </Button>
                                                )}
                                                {(fila.estado === "error" || fila.estado === "enviando" || fila.estado === "descartado") && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={pendiente}
                                                        onClick={() => correr(() => reintentarRespuesta(fila.id))}
                                                    >
                                                        <RotateCcw className="mr-2 h-3.5 w-3.5" /> Volver a encolar
                                                    </Button>
                                                )}
                                                {(fila.estado === "pendiente" || fila.estado === "error") && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-600 hover:text-red-700"
                                                        disabled={pendiente}
                                                        onClick={() => correr(() => descartarRespuesta(fila.id))}
                                                    >
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Descartar
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </CardContent>
                    </Card>
                )
            })}

            <ConfirmDialog
                open={confirmarDescartarTodo}
                onOpenChange={setConfirmarDescartarTodo}
                title="¿Descartar todas las respuestas en cola?"
                description="Ninguna de las respuestas pendientes se va a enviar. Las conversaciones quedan sin contestar en Chatwoot para que las atienda alguien del equipo."
                confirmLabel="Descartar todo"
                variant="danger"
                isLoading={pendiente}
                onConfirm={() => {
                    setConfirmarDescartarTodo(false)
                    correr(descartarTodo)
                }}
            />
        </div>
    )
}
