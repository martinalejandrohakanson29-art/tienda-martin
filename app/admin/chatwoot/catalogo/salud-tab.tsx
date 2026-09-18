"use client"

/**
 * Estado de salud del catálogo entero.
 *
 * El diálogo de publicación revisa UN kit; esto revisa todo lo que ya está
 * publicado, que es donde se esconden los problemas viejos: el pack al que
 * nunca se le cargó la cilindrada, la grafía de moto que no resuelve desde
 * hace meses, las filas legacy que pueden contestar por un kit nuevo.
 *
 * Es la misma función que corre `npm run catalogo:validar`, así que lo que se
 * ve acá y lo que sale en la terminal no pueden divergir.
 */

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CircleAlert, Info, Loader2, RefreshCw, Stethoscope, Wrench } from "lucide-react"

import { validarCatalogoAction } from "@/app/actions/chat-catalogo"
import type { ReporteCatalogo, Severidad } from "@/lib/validacion-catalogo"

const ESTILO: Record<Severidad, { clase: string; icono: React.ReactNode }> = {
    bloqueante: { clase: "border-rose-200 bg-rose-50", icono: <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /> },
    riesgo: { clase: "border-amber-200 bg-amber-50", icono: <CircleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /> },
    aviso: { clase: "border-slate-200 bg-slate-50", icono: <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" /> },
}

export function SaludTab() {
    const [reporte, setReporte] = useState<ReporteCatalogo | null>(null)
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [verAvisos, setVerAvisos] = useState(false)

    const revisar = useCallback(async () => {
        setCargando(true)
        setError(null)
        try {
            setReporte(await validarCatalogoAction())
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo revisar el catálogo")
        } finally {
            setCargando(false)
        }
    }, [])

    useEffect(() => {
        revisar()
    }, [revisar])

    const visibles = (reporte?.hallazgos || []).filter((h) => verAvisos || h.severidad !== "aviso")

    return (
        <Card className="border-t-4 border-t-sky-500 shadow-md">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-xl">
                    <span className="flex items-center gap-2">
                        <Stethoscope className="h-5 w-5 text-sky-600" /> Qué le falta al catálogo
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={revisar} disabled={cargando} className="gap-1.5">
                        {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Revisar de nuevo
                    </Button>
                </CardTitle>
                <CardDescription>
                    Cada punto dice qué falta y <strong>qué hace el bot por eso</strong>. Lo mismo que corre{" "}
                    <code className="rounded bg-slate-100 px-1">npm run catalogo:validar</code>.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && <p className="text-sm text-rose-700">{error}</p>}

                {reporte && (
                    <>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge className={reporte.resumen.bloqueantes > 0 ? "bg-rose-600" : "bg-emerald-600"}>
                                {reporte.resumen.bloqueantes} bloqueante(s)
                            </Badge>
                            <Badge variant="outline" className="border-amber-300 text-amber-800">
                                {reporte.resumen.riesgos} riesgo(s)
                            </Badge>
                            <Badge variant="outline" className="text-slate-500">{reporte.resumen.avisos} aviso(s)</Badge>
                            <span className="text-xs text-slate-400">
                                {reporte.alcance.packs} packs · {reporte.alcance.grupos} grupos ·{" "}
                                {reporte.alcance.articulos} artículos · {reporte.alcance.filasCompat} filas de compatibilidad
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="ml-auto text-xs"
                                onClick={() => setVerAvisos((v) => !v)}
                            >
                                {verAvisos ? "Ocultar avisos" : "Ver también los avisos"}
                            </Button>
                        </div>

                        {visibles.length === 0 ? (
                            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                                Nada que corregir en lo que el bot necesita para contestar.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {visibles.map((h, i) => (
                                    <div key={i} className={`flex gap-2 rounded-md border p-3 ${ESTILO[h.severidad].clase}`}>
                                        {ESTILO[h.severidad].icono}
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
                                ))}
                            </div>
                        )}
                    </>
                )}

                {!reporte && cargando && (
                    <p className="flex items-center gap-2 py-6 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Revisando el catálogo…
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
