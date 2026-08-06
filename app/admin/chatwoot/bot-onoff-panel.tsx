"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Clock, Loader2, Power, Send } from "lucide-react"
import { alternarBot, obtenerPanelBot, type PanelBot } from "@/app/actions/bot-onoff"

// Botón de "abrimos / cerramos". Apagado, el bot sigue procesando todo y deja
// las respuestas listas en la cola; al prender salen escalonadas.

function hace(iso: string | null) {
    if (!iso) return ""
    const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutos < 1) return "recién"
    if (minutos < 60) return `hace ${minutos} min`
    const horas = Math.round(minutos / 60)
    if (horas < 24) return `hace ${horas} h`
    return `hace ${Math.round(horas / 24)} días`
}

export function BotOnOffPanel({ inicial, error }: { inicial: PanelBot | null; error: string | null }) {
    const [panel, setPanel] = useState<PanelBot | null>(inicial)
    const [pendiente, arrancarTransicion] = useTransition()
    const [fallo, setFallo] = useState<string | null>(error)

    // Mientras se está vaciando la cola, el contador baja solo cada unos
    // segundos para poder mirar cómo van saliendo.
    useEffect(() => {
        if (!panel?.despachando && !(panel?.encendido && panel.pendientes > 0)) return
        const t = setInterval(() => {
            obtenerPanelBot()
                .then(setPanel)
                .catch(() => { })
        }, 4000)
        return () => clearInterval(t)
    }, [panel?.despachando, panel?.encendido, panel?.pendientes])

    const cambiar = (encendido: boolean) => {
        setFallo(null)
        arrancarTransicion(async () => {
            try {
                await alternarBot(encendido)
                setPanel(await obtenerPanelBot())
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo cambiar el estado del bot")
            }
        })
    }

    if (fallo && !panel) {
        return (
            <Card className="border-l-4 border-l-red-500">
                <CardContent className="flex items-start gap-3 py-4 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{fallo}</span>
                </CardContent>
            </Card>
        )
    }

    if (!panel) return null

    const encendido = panel.encendido

    return (
        <Card className={`border-l-4 ${encendido ? "border-l-emerald-500" : "border-l-slate-400"}`}>
            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                    <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${encendido ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                            }`}
                    >
                        <Power className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">
                                {encendido ? "El bot está respondiendo" : "El bot está en pausa"}
                            </h2>
                            <Badge variant={encendido ? "default" : "secondary"}>
                                {encendido ? "ON" : "OFF"}
                            </Badge>
                        </div>
                        <p className="mt-1 max-w-xl text-sm text-gray-500">
                            {encendido
                                ? "Los mensajes se contestan solos apenas llegan."
                                : "Los mensajes se siguen procesando y las respuestas quedan listas en la cola. Salen escalonadas cuando prendas."}
                            {panel.actualizadoEn && (
                                <span className="text-gray-400">
                                    {" "}
                                    Cambiado {hace(panel.actualizadoEn)}
                                    {panel.actualizadoPor ? ` por ${panel.actualizadoPor}` : ""}.
                                </span>
                            )}
                        </p>
                        {panel.pendientes > 0 && (
                            <Link
                                href="/admin/chatwoot/cola"
                                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline"
                            >
                                {panel.despachando ? (
                                    <Send className="h-4 w-4 animate-pulse" />
                                ) : (
                                    <Clock className="h-4 w-4" />
                                )}
                                {panel.pendientes} {panel.pendientes === 1 ? "respuesta esperando" : "respuestas esperando"}
                                {panel.despachando ? " · saliendo ahora" : " · ver la cola"}
                            </Link>
                        )}
                        {fallo && <p className="mt-2 text-sm text-red-600">{fallo}</p>}
                    </div>
                </div>

                <Button
                    size="lg"
                    disabled={pendiente}
                    onClick={() => cambiar(!encendido)}
                    className={encendido ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"}
                >
                    {pendiente ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
                    {encendido ? "Pausar el bot" : "Prender el bot"}
                </Button>
            </CardContent>
        </Card>
    )
}
