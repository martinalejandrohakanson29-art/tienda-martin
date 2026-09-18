"use client"

/**
 * Revisión previa a publicar un kit.
 *
 * Antes, activar un pack era un click en un badge y el bot lo empezaba a
 * ofrecer en el mensaje siguiente. Nada decía qué le faltaba, y lo que faltaba
 * no se veía al guardar: se veía días después, en una conversación donde el bot
 * afirmó algo que nadie cargó.
 *
 * Acá se juntan las dos únicas formas de saber si el kit está listo:
 *   - el checklist (`validarPack`), que dice qué campo falta Y qué hace el bot
 *     por eso — no "campo vacío", sino "va a derivar todas las consultas de
 *     compatibilidad de este kit";
 *   - la prueba contra el motor real, que muestra lo que va a leer el cliente.
 *
 * Los bloqueantes no se pueden saltear desde acá (el servidor los rechaza
 * igual). Los riesgos sí: la decisión es de quien carga, pero tiene que verlos
 * antes de tomarla.
 */

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, Bot, Check, CircleAlert, Info, Loader2, Rocket, Wrench } from "lucide-react"

import { validarPackAction, alternarActivoChatPack } from "@/app/actions/chat-catalogo"
import { probarKitConBot, type ResultadoPruebaKit } from "@/app/actions/prueba-kit"
import type { ReporteCatalogo, Severidad } from "@/lib/validacion-catalogo"

const ESTILO: Record<Severidad, { clase: string; icono: React.ReactNode; texto: string }> = {
    bloqueante: {
        clase: "border-rose-200 bg-rose-50",
        icono: <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />,
        texto: "Bloquea",
    },
    riesgo: {
        clase: "border-amber-200 bg-amber-50",
        icono: <CircleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
        texto: "Riesgo",
    },
    aviso: {
        clase: "border-slate-200 bg-slate-50",
        icono: <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />,
        texto: "Aviso",
    },
}

export function RevisionPublicacion({
    packId,
    packNombre,
    abierto,
    onCerrar,
    onPublicado,
}: {
    packId: number
    packNombre: string
    abierto: boolean
    onCerrar: () => void
    onPublicado: () => void
}) {
    const [reporte, setReporte] = useState<ReporteCatalogo | null>(null)
    const [cargando, setCargando] = useState(false)
    const [prueba, setPrueba] = useState<ResultadoPruebaKit | null>(null)
    const [probando, setProbando] = useState(false)
    const [publicando, setPublicando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [publicado, setPublicado] = useState(false)

    const revisar = useCallback(async () => {
        setCargando(true)
        setError(null)
        try {
            setReporte(await validarPackAction(packId))
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo revisar el kit")
        } finally {
            setCargando(false)
        }
    }, [packId])

    useEffect(() => {
        if (abierto) {
            setPrueba(null)
            setPublicado(false)
            revisar()
        }
    }, [abierto, revisar])

    const probar = async () => {
        setProbando(true)
        setError(null)
        try {
            setPrueba(await probarKitConBot(packId))
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo correr la prueba")
        } finally {
            setProbando(false)
        }
    }

    const publicar = async () => {
        setPublicando(true)
        setError(null)
        try {
            await alternarActivoChatPack(packId, true)
            setPublicado(true)
            onPublicado()
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo publicar")
        } finally {
            setPublicando(false)
        }
    }

    const bloqueantes = reporte?.resumen.bloqueantes ?? 0
    const riesgos = reporte?.resumen.riesgos ?? 0

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Rocket className="h-5 w-5 text-emerald-600" />
                        Publicar: {packNombre}
                    </DialogTitle>
                    <DialogDescription>
                        Una vez publicado, el bot lo ofrece en el mensaje siguiente. Esto es lo que le falta y cómo
                        contesta hoy.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 whitespace-pre-line">
                        {error}
                    </div>
                )}

                {cargando ? (
                    <div className="flex items-center gap-2 py-8 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Revisando el kit…
                    </div>
                ) : reporte ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            {bloqueantes > 0 ? (
                                <Badge className="bg-rose-600">{bloqueantes} bloqueante(s)</Badge>
                            ) : (
                                <Badge className="bg-emerald-600 gap-1">
                                    <Check className="h-3 w-3" /> Sin bloqueantes
                                </Badge>
                            )}
                            {riesgos > 0 && <Badge variant="outline" className="border-amber-300 text-amber-800">{riesgos} riesgo(s)</Badge>}
                            {reporte.resumen.avisos > 0 && (
                                <Badge variant="outline" className="text-slate-500">{reporte.resumen.avisos} aviso(s)</Badge>
                            )}
                        </div>

                        {reporte.hallazgos.length === 0 ? (
                            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                                No falta nada de lo que el bot necesita para contestar por este kit.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {reporte.hallazgos.map((h, i) => {
                                    const e = ESTILO[h.severidad]
                                    return (
                                        <div key={i} className={`flex gap-2 rounded-md border p-3 ${e.clase}`}>
                                            {e.icono}
                                            <div className="space-y-0.5 text-sm">
                                                <p className="font-medium text-slate-800">
                                                    {h.titulo}{" "}
                                                    <span className="font-normal text-slate-400">
                                                        · {h.entidad} {h.entidadNombre} · {h.campo}
                                                    </span>
                                                </p>
                                                <p className="text-slate-600">{h.consecuencia}</p>
                                                <p className="flex items-center gap-1 text-xs text-slate-500">
                                                    <Wrench className="h-3 w-3" /> {h.comoSeArregla}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <div className="rounded-md border p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium flex items-center gap-1.5">
                                        <Bot className="h-4 w-4 text-violet-600" /> Cómo contesta hoy
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Cinco preguntas reales contra el motor de producción. No manda nada a WhatsApp.
                                    </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={probar} disabled={probando} className="gap-1.5 shrink-0">
                                    {probando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                                    {prueba ? "Probar de nuevo" : "Probar con el bot"}
                                </Button>
                            </div>

                            {prueba?.error && <p className="text-sm text-rose-700">{prueba.error}</p>}

                            {prueba && prueba.turnos.length > 0 && (
                                <div className="space-y-2">
                                    {prueba.turnos.map((t, i) => (
                                        <div key={i} className="rounded-md bg-slate-50 p-2.5 text-sm">
                                            <p className="text-xs font-medium text-slate-500">
                                                {t.titulo} — <span className="font-normal">{t.mide}</span>
                                            </p>
                                            {t.salteado ? (
                                                <p className="mt-1 text-xs italic text-amber-700">{t.salteado}</p>
                                            ) : (
                                                <>
                                                    <p className="mt-1 text-slate-700">
                                                        <span className="text-slate-400">Cliente:</span> {t.pregunta}
                                                    </p>
                                                    <p className="mt-0.5 whitespace-pre-wrap text-slate-900">
                                                        <span className="text-slate-400">Bot:</span> {t.respuesta}
                                                    </p>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {t.escalado && (
                                                            <Badge variant="outline" className="border-amber-300 text-amber-800 text-[10px]">
                                                                derivó al equipo
                                                            </Badge>
                                                        )}
                                                        {t.herramientas.map((h, j) => (
                                                            <Badge key={j} variant="outline" className="text-[10px] text-slate-500">
                                                                {h}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {publicado && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
                                <p className="flex items-center gap-1.5 font-medium">
                                    <Check className="h-4 w-4" /> Publicado. El bot ya lo ofrece.
                                </p>
                                <p className="text-xs">
                                    Acordate de correr <code className="rounded bg-white px-1">npm run config:exportar</code> y
                                    commitear: lo que se carga acá vive solo en la base, y una restauración de backup se lo
                                    lleva sin avisar (pasó el 15/09).
                                </p>
                            </div>
                        )}
                    </div>
                ) : null}

                <DialogFooter className="gap-2">
                    <Button type="button" variant="ghost" onClick={onCerrar}>
                        {publicado ? "Cerrar" : "Ahora no"}
                    </Button>
                    <Button
                        type="button"
                        onClick={publicar}
                        disabled={publicando || publicado || bloqueantes > 0 || cargando}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                        {bloqueantes > 0 ? "No se puede publicar todavía" : riesgos > 0 ? "Publicar igual" : "Publicar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
