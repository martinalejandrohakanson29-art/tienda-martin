"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronUp, ExternalLink, Loader2, MessageSquare, RefreshCw, Send, ThumbsDown, ThumbsUp } from "lucide-react"
import {
    listarPendientesEquipo,
    responderPendienteEquipo,
    responderPendienteTecnica,
    getMensajesPendiente,
    type PanelPendientes,
    type PendienteEquipo,
    type TipoPendiente,
    type MensajeConversacion,
} from "@/app/actions/pendientes-equipo"

const ETIQUETA_TIPO: Record<TipoPendiente, { texto: string; clase: string }> = {
    tecnica: { texto: "Técnica", clase: "bg-violet-100 text-violet-800 border-violet-200" },
    precio: { texto: "Precio / Stock", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    negocio: { texto: "Negocio", clase: "bg-sky-100 text-sky-800 border-sky-200" },
    sin_match: { texto: "Sin clasificar", clase: "bg-amber-100 text-amber-800 border-amber-200" },
}

const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

// Hilo real de la conversación (solo lectura), compartido por todas las pestañas.
function CharlaCompleta({ cargando, mensajes }: { cargando: boolean; mensajes: MensajeConversacion[] | undefined }) {
    return (
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-white p-3">
            {cargando && (
                <p className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando charla…
                </p>
            )}
            {!cargando && mensajes?.length === 0 && <p className="text-sm text-gray-400">Sin mensajes.</p>}
            {!cargando &&
                mensajes?.map((m) => (
                    <div key={m.id} className={`flex ${m.saliente ? "justify-end" : "justify-start"}`}>
                        <div
                            className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                                m.privado
                                    ? "border border-dashed border-amber-300 bg-amber-50 italic text-amber-800"
                                    : m.saliente
                                      ? "bg-violet-600 text-white"
                                      : "bg-gray-100 text-gray-800"
                            }`}
                        >
                            <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                            <p className={`mt-0.5 text-[10px] ${m.privado ? "text-amber-600" : m.saliente ? "text-violet-100" : "text-gray-400"}`}>
                                {m.remitente} · {fechaCorta(m.creadoEn)}
                                {m.privado ? " · nota privada" : ""}
                            </p>
                        </div>
                    </div>
                ))}
        </div>
    )
}

export function PendientesClient({
    inicial,
    error,
    chatwootUrl,
}: {
    inicial: PanelPendientes | null
    error: string | null
    chatwootUrl: string
}) {
    const [panel, setPanel] = useState<PanelPendientes | null>(inicial)
    const [fallo, setFallo] = useState<string | null>(error)
    const [pendiente, arrancarTransicion] = useTransition()
    const [respuestas, setRespuestas] = useState<Record<string, string>>({})
    const [enviadas, setEnviadas] = useState<Set<string>>(new Set())

    // Solo para la pestaña "Técnica": respuesta estructurada (Sí/No + aclaración)
    // en vez de texto libre, y charla real cargada bajo demanda.
    const [formTecnica, setFormTecnica] = useState<Record<string, { compatible: boolean | null; detalle: string }>>({})
    const [charlaAbierta, setCharlaAbierta] = useState<Set<string>>(new Set())
    const [charlas, setCharlas] = useState<Record<string, MensajeConversacion[]>>({})
    const [cargandoCharla, setCargandoCharla] = useState<Set<string>>(new Set())

    const refrescar = async () => {
        try {
            setPanel(await listarPendientesEquipo())
        } catch (e) {
            setFallo(e instanceof Error ? e.message : "No se pudo leer la bandeja")
        }
    }

    const claveFila = (tipo: TipoPendiente, id: number) => `${tipo}-${id}`

    const enviar = (tipo: TipoPendiente, id: number, conversationId: number) => {
        const clave = claveFila(tipo, id)
        const respuesta = (respuestas[clave] || "").trim()
        if (!respuesta) return
        setFallo(null)
        arrancarTransicion(async () => {
            try {
                await responderPendienteEquipo({ tipo, conversationId, respuesta })
                setEnviadas((prev) => new Set(prev).add(clave))
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo enviar la respuesta")
            }
        })
    }

    const toggleCharla = (clave: string, conversationId: number) => {
        setCharlaAbierta((prev) => {
            const next = new Set(prev)
            if (next.has(clave)) {
                next.delete(clave)
                return next
            }
            next.add(clave)
            return next
        })
        if (!charlas[clave]) {
            setCargandoCharla((prev) => new Set(prev).add(clave))
            getMensajesPendiente(conversationId)
                .then((mensajes) => setCharlas((prev) => ({ ...prev, [clave]: mensajes })))
                .catch((e) => setFallo(e instanceof Error ? e.message : "No se pudo cargar la charla"))
                .finally(() =>
                    setCargandoCharla((prev) => {
                        const next = new Set(prev)
                        next.delete(clave)
                        return next
                    })
                )
        }
    }

    const enviarTecnica = (item: PendienteEquipo) => {
        const clave = claveFila(item.tipo, item.id)
        const forma = formTecnica[clave]
        if (!forma || forma.compatible === null) return
        setFallo(null)
        arrancarTransicion(async () => {
            try {
                await responderPendienteTecnica({
                    id: item.id,
                    conversationId: item.conversationId,
                    compatible: forma.compatible as boolean,
                    detalle: forma.detalle,
                })
                setEnviadas((prev) => new Set(prev).add(clave))
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo enviar la respuesta")
            }
        })
    }

    const porTipo = useMemo(() => {
        const mapa: Record<TipoPendiente, PendienteEquipo[]> = { tecnica: [], precio: [], negocio: [], sin_match: [] }
        for (const item of panel?.pendientes ?? []) mapa[item.tipo].push(item)
        return mapa
    }, [panel])

    const total = panel?.pendientes.length ?? 0

    const fila = (item: PendienteEquipo) => {
        const clave = claveFila(item.tipo, item.id)
        const yaEnviada = enviadas.has(clave)
        const badge = ETIQUETA_TIPO[item.tipo]
        const charlaVisible = charlaAbierta.has(clave)
        const cargando = cargandoCharla.has(clave)
        const mensajes = charlas[clave]
        return (
            <Card key={clave}>
                <CardContent className="space-y-3 pt-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className={badge.clase}>
                            {badge.texto}
                        </Badge>
                        <span className="font-medium text-gray-700">{item.resumen}</span>
                        <span className="text-gray-400">· escalado {fechaCorta(item.creadoEn)}</span>
                        <a
                            href={`${chatwootUrl}/app/accounts/1/conversations/${item.conversationId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"
                        >
                            Ver conversación <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>

                    <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">
                        &quot;{item.preguntaOriginal}&quot;
                    </p>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-gray-500 hover:text-gray-800"
                        onClick={() => toggleCharla(clave, item.conversationId)}
                    >
                        <MessageSquare className="h-4 w-4" />
                        {charlaVisible ? "Ocultar charla" : "Ver charla completa"}
                        {charlaVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>

                    {charlaVisible && <CharlaCompleta cargando={cargando} mensajes={mensajes} />}

                    {yaEnviada ? (
                        <p className="flex items-center gap-2 text-sm text-emerald-700">
                            <Check className="h-4 w-4" /> Nota enviada al equipo — el bot le va a contestar al cliente
                            solo apenas la procese. Actualizá en unos segundos para verla salir de la lista.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <Textarea
                                placeholder="Escribí la respuesta como si fuera la nota privada en Chatwoot…"
                                value={respuestas[clave] || ""}
                                onChange={(e) => setRespuestas((prev) => ({ ...prev, [clave]: e.target.value }))}
                                rows={2}
                                className="flex-1"
                            />
                            <Button
                                size="sm"
                                disabled={pendiente || !(respuestas[clave] || "").trim()}
                                onClick={() => enviar(item.tipo, item.id, item.conversationId)}
                            >
                                {pendiente ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Enviar respuesta
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        )
    }

    const filaTecnica = (item: PendienteEquipo) => {
        const clave = claveFila(item.tipo, item.id)
        const yaEnviada = enviadas.has(clave)
        const forma = formTecnica[clave] || { compatible: null, detalle: "" }
        const charlaVisible = charlaAbierta.has(clave)
        const cargando = cargandoCharla.has(clave)
        const mensajes = charlas[clave]

        const setForma = (parcial: Partial<{ compatible: boolean | null; detalle: string }>) =>
            setFormTecnica((prev) => ({ ...prev, [clave]: { ...forma, ...parcial } }))

        return (
            <Card key={clave}>
                <CardContent className="space-y-3 pt-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className={ETIQUETA_TIPO.tecnica.clase}>
                            {ETIQUETA_TIPO.tecnica.texto}
                        </Badge>
                        <span className="font-medium text-gray-700">{item.resumen}</span>
                        <span className="text-gray-400">· escalado {fechaCorta(item.creadoEn)}</span>
                        <a
                            href={`${chatwootUrl}/app/accounts/1/conversations/${item.conversationId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"
                        >
                            Abrir en Chatwoot <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>

                    <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">
                        &quot;{item.preguntaOriginal}&quot;
                    </p>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-gray-500 hover:text-gray-800"
                        onClick={() => toggleCharla(clave, item.conversationId)}
                    >
                        <MessageSquare className="h-4 w-4" />
                        {charlaVisible ? "Ocultar charla" : "Ver charla completa"}
                        {charlaVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>

                    {charlaVisible && <CharlaCompleta cargando={cargando} mensajes={mensajes} />}

                    {yaEnviada ? (
                        <p className="flex items-center gap-2 text-sm text-emerald-700">
                            <Check className="h-4 w-4" /> Guardado — el bot le va a contestar al cliente solo apenas
                            lo procese. Actualizá en unos segundos para verla salir de la lista.
                        </p>
                    ) : (
                        <div className="space-y-2 rounded-md border bg-gray-50 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-gray-600">¿Es compatible?</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={forma.compatible === true ? "default" : "outline"}
                                    className={forma.compatible === true ? "gap-1 bg-emerald-600 hover:bg-emerald-700" : "gap-1"}
                                    onClick={() => setForma({ compatible: true })}
                                >
                                    <ThumbsUp className="h-3.5 w-3.5" /> Sí
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={forma.compatible === false ? "default" : "outline"}
                                    className={forma.compatible === false ? "gap-1 bg-rose-600 hover:bg-rose-700" : "gap-1"}
                                    onClick={() => setForma({ compatible: false })}
                                >
                                    <ThumbsDown className="h-3.5 w-3.5" /> No
                                </Button>
                            </div>
                            <Textarea
                                placeholder="Aclaración opcional (ej: para recorrido corto, hay que cambiar el carburador)…"
                                value={forma.detalle}
                                onChange={(e) => setForma({ detalle: e.target.value })}
                                rows={2}
                            />
                            <Button
                                size="sm"
                                disabled={pendiente || forma.compatible === null}
                                onClick={() => enviarTecnica(item)}
                                className="gap-1"
                            >
                                {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Guardar respuesta
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        )
    }

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
                    <h1 className="text-3xl font-bold tracking-tight">Consultas pendientes</h1>
                    <p className="max-w-2xl text-gray-500">
                        Preguntas que el bot no supo responder y escaló como nota privada. Respondé acá mismo: se manda
                        como nota privada a la conversación real de Chatwoot, y el bot arma y manda la respuesta al
                        cliente solo, igual que si hubieras contestado la nota a mano en Chatwoot.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={refrescar} disabled={pendiente}>
                    {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

            {panel && !panel.tokenEquipo && (
                <p className="flex items-start gap-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Falta <code>CHATWOOT_ADMIN_API_TOKEN</code> en el servicio de la web: tiene que ser el token de
                        un agente humano (no el del bot), para que el workflow reconozca la nota como respuesta real
                        del equipo. Cargalo en Easypanel y reiniciá el contenedor.
                    </span>
                </p>
            )}

            {total === 0 && !fallo && (
                <Card>
                    <CardContent className="py-10 text-center text-gray-500">
                        No hay consultas pendientes. Todo lo que el bot no supo responder ya fue resuelto.
                    </CardContent>
                </Card>
            )}

            {total > 0 && (
                <Tabs defaultValue="todas" className="space-y-4">
                    <TabsList className="flex-wrap h-auto">
                        <TabsTrigger value="todas">Todas ({total})</TabsTrigger>
                        <TabsTrigger value="tecnica">Técnica ({porTipo.tecnica.length})</TabsTrigger>
                        <TabsTrigger value="precio">Precio / Stock ({porTipo.precio.length})</TabsTrigger>
                        <TabsTrigger value="negocio">Negocio ({porTipo.negocio.length})</TabsTrigger>
                        <TabsTrigger value="sin_match">Sin clasificar ({porTipo.sin_match.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="todas" className="space-y-3">
                        {(panel?.pendientes ?? []).map((item) => (item.tipo === "tecnica" ? filaTecnica(item) : fila(item)))}
                    </TabsContent>
                    <TabsContent value="tecnica" className="space-y-3">
                        {porTipo.tecnica.map(filaTecnica)}
                    </TabsContent>
                    <TabsContent value="precio" className="space-y-3">
                        {porTipo.precio.map(fila)}
                    </TabsContent>
                    <TabsContent value="negocio" className="space-y-3">
                        {porTipo.negocio.map(fila)}
                    </TabsContent>
                    <TabsContent value="sin_match" className="space-y-3">
                        {porTipo.sin_match.map(fila)}
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}
