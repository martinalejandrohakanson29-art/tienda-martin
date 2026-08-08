"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react"
import {
    listarPendientesEquipo,
    responderPendienteEquipo,
    type PanelPendientes,
    type PendienteEquipo,
    type TipoPendiente,
} from "@/app/actions/pendientes-equipo"

const ETIQUETA_TIPO: Record<TipoPendiente, { texto: string; clase: string }> = {
    tecnica: { texto: "Técnica", clase: "bg-violet-100 text-violet-800 border-violet-200" },
    precio: { texto: "Precio / Stock", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    negocio: { texto: "Negocio", clase: "bg-sky-100 text-sky-800 border-sky-200" },
}

const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

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

    const porTipo = useMemo(() => {
        const mapa: Record<TipoPendiente, PendienteEquipo[]> = { tecnica: [], precio: [], negocio: [] }
        for (const item of panel?.pendientes ?? []) mapa[item.tipo].push(item)
        return mapa
    }, [panel])

    const total = panel?.pendientes.length ?? 0

    const fila = (item: PendienteEquipo) => {
        const clave = claveFila(item.tipo, item.id)
        const yaEnviada = enviadas.has(clave)
        const badge = ETIQUETA_TIPO[item.tipo]
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
                    </TabsList>
                    <TabsContent value="todas" className="space-y-3">
                        {(panel?.pendientes ?? []).map(fila)}
                    </TabsContent>
                    <TabsContent value="tecnica" className="space-y-3">
                        {porTipo.tecnica.map(fila)}
                    </TabsContent>
                    <TabsContent value="precio" className="space-y-3">
                        {porTipo.precio.map(fila)}
                    </TabsContent>
                    <TabsContent value="negocio" className="space-y-3">
                        {porTipo.negocio.map(fila)}
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}
