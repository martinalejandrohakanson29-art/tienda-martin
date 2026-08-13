"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { AlertTriangle, ArrowLeft, Clock, Loader2, Save } from "lucide-react"
import {
    alternarHorarioAutomatico,
    guardarHorarioBot,
    obtenerHorarioBot,
    type HorarioBot,
} from "@/app/actions/bot-onoff"

// dia_semana sigue la convención de Date.getUTCDay(): 0=domingo ... 6=sábado.
const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

type FilaHorario = {
    diaSemana: number
    activo: boolean
    abre: string // "HH:MM"
    cierra: string // "HH:MM"
    activoTarde: boolean
    abreTarde: string
    cierraTarde: string
}

// Valores por defecto para cuando se tilda "también a la tarde" sin tener
// todavía un horario cargado (ej. un día que nació sin bloque de tarde).
const TARDE_ABRE_DEFAULT = "16:00"
const TARDE_CIERRA_DEFAULT = "19:00"

function minutosATexto(minutos: number) {
    const h = Math.floor(minutos / 60)
        .toString()
        .padStart(2, "0")
    const m = (minutos % 60).toString().padStart(2, "0")
    return `${h}:${m}`
}

function textoAMinutos(texto: string) {
    const [h, m] = texto.split(":").map(Number)
    return h * 60 + m
}

function aFilas(horario: HorarioBot): FilaHorario[] {
    return [...horario.dias]
        .sort((a, b) => a.diaSemana - b.diaSemana)
        .map((d) => ({
            diaSemana: d.diaSemana,
            activo: d.activo,
            abre: minutosATexto(d.abreMinutos),
            cierra: minutosATexto(d.cierraMinutos),
            activoTarde: d.activoTarde,
            abreTarde: d.abreMinutosTarde !== null ? minutosATexto(d.abreMinutosTarde) : TARDE_ABRE_DEFAULT,
            cierraTarde: d.cierraMinutosTarde !== null ? minutosATexto(d.cierraMinutosTarde) : TARDE_CIERRA_DEFAULT,
        }))
}

export function HorarioClient({ inicial, error }: { inicial: HorarioBot | null; error: string | null }) {
    const [automatico, setAutomatico] = useState(inicial?.automatico ?? false)
    const [filas, setFilas] = useState<FilaHorario[]>(inicial ? aFilas(inicial) : [])
    const [pendiente, arrancarTransicion] = useTransition()
    const [guardando, arrancarGuardado] = useTransition()
    const [fallo, setFallo] = useState<string | null>(error)
    const [guardadoOk, setGuardadoOk] = useState(false)

    if (!inicial && fallo) {
        return (
            <Card className="border-l-4 border-l-red-500">
                <CardContent className="flex items-start gap-3 py-4 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{fallo}</span>
                </CardContent>
            </Card>
        )
    }

    const cambiarFila = (diaSemana: number, cambios: Partial<FilaHorario>) => {
        setFilas((prev) => prev.map((f) => (f.diaSemana === diaSemana ? { ...f, ...cambios } : f)))
        setGuardadoOk(false)
    }

    const alternar = (nuevo: boolean) => {
        setFallo(null)
        arrancarTransicion(async () => {
            try {
                await alternarHorarioAutomatico(nuevo)
                setAutomatico(nuevo)
                // Si al prenderlo el horario ya reconcilió el estado del bot, no
                // hace falta reflejarlo acá: /admin/chatwoot lo va a mostrar.
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo cambiar el modo automático")
            }
        })
    }

    const guardar = () => {
        setFallo(null)
        setGuardadoOk(false)
        for (const fila of filas) {
            if (fila.activo && textoAMinutos(fila.cierra) <= textoAMinutos(fila.abre)) {
                setFallo(`${NOMBRES_DIAS[fila.diaSemana]}: el cierre de la mañana tiene que ser después de la apertura`)
                return
            }
            if (fila.activo && fila.activoTarde) {
                if (textoAMinutos(fila.cierraTarde) <= textoAMinutos(fila.abreTarde)) {
                    setFallo(`${NOMBRES_DIAS[fila.diaSemana]}: el cierre de la tarde tiene que ser después de la apertura de la tarde`)
                    return
                }
                if (textoAMinutos(fila.abreTarde) < textoAMinutos(fila.cierra)) {
                    setFallo(`${NOMBRES_DIAS[fila.diaSemana]}: la tarde tiene que empezar después de que cierra la mañana`)
                    return
                }
            }
        }
        arrancarGuardado(async () => {
            try {
                await guardarHorarioBot(
                    filas.map((f) => ({
                        diaSemana: f.diaSemana,
                        activo: f.activo,
                        abreMinutos: textoAMinutos(f.abre),
                        cierraMinutos: textoAMinutos(f.cierra),
                        activoTarde: f.activo && f.activoTarde,
                        abreMinutosTarde: f.activo && f.activoTarde ? textoAMinutos(f.abreTarde) : null,
                        cierraMinutosTarde: f.activo && f.activoTarde ? textoAMinutos(f.cierraTarde) : null,
                    }))
                )
                setGuardadoOk(true)
                const fresco = await obtenerHorarioBot()
                setFilas(aFilas(fresco))
                setAutomatico(fresco.automatico)
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo guardar el horario")
            }
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/admin/chatwoot" className="text-sm text-gray-500 hover:underline flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> Volver
                </Link>
            </div>

            <div>
                <h1 className="text-3xl font-bold tracking-tight">Horario automático del bot</h1>
                <p className="text-gray-500">
                    Prende y apaga el bot solo según el horario que cargues acá. Con el automático activo, el botón
                    manual de /admin/chatwoot queda deshabilitado — el horario manda solo.
                </p>
            </div>

            <Card className={`border-l-4 ${automatico ? "border-l-emerald-500" : "border-l-slate-400"}`}>
                <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${automatico ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                                }`}
                        >
                            <Clock className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold">
                                    {automatico ? "Horario automático activo" : "Horario automático apagado"}
                                </h2>
                                <Badge variant={automatico ? "default" : "secondary"}>{automatico ? "ON" : "OFF"}</Badge>
                            </div>
                            <p className="mt-1 max-w-xl text-sm text-gray-500">
                                {automatico
                                    ? "El bot se prende y se apaga solo, según los días y horarios de abajo."
                                    : "El bot se maneja con el botón manual de /admin/chatwoot, como siempre."}
                            </p>
                        </div>
                    </div>

                    <Button
                        size="lg"
                        disabled={pendiente || !inicial}
                        onClick={() => alternar(!automatico)}
                        className={automatico ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"}
                    >
                        {pendiente ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                        {automatico ? "Apagar automático" : "Prender automático"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Días y horarios</CardTitle>
                    <CardDescription>
                        Tildá los días que abrís y cargá el horario de cada uno. Los días sin tildar quedan cerrados
                        todo el día.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {filas.map((fila) => (
                        <div key={fila.diaSemana} className="flex flex-col gap-3 rounded-md border p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <label className="flex items-center gap-3">
                                    <Checkbox
                                        checked={fila.activo}
                                        onCheckedChange={(checked) => cambiarFila(fila.diaSemana, { activo: checked })}
                                    />
                                    <span className="w-24 font-medium">{NOMBRES_DIAS[fila.diaSemana]}</span>
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="w-14 text-sm text-gray-500">Mañana</span>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        value={fila.abre}
                                        disabled={!fila.activo}
                                        onChange={(e) => cambiarFila(fila.diaSemana, { abre: e.target.value })}
                                    />
                                    <span className="text-gray-400">a</span>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        value={fila.cierra}
                                        disabled={!fila.activo}
                                        onChange={(e) => cambiarFila(fila.diaSemana, { cierra: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pl-9">
                                <label className="flex items-center gap-3">
                                    <Checkbox
                                        checked={fila.activoTarde}
                                        disabled={!fila.activo}
                                        onCheckedChange={(checked) => cambiarFila(fila.diaSemana, { activoTarde: checked })}
                                    />
                                    <span className="w-24 text-sm text-gray-600">También tarde</span>
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="w-14 text-sm text-gray-500">Tarde</span>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        value={fila.abreTarde}
                                        disabled={!fila.activo || !fila.activoTarde}
                                        onChange={(e) => cambiarFila(fila.diaSemana, { abreTarde: e.target.value })}
                                    />
                                    <span className="text-gray-400">a</span>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        value={fila.cierraTarde}
                                        disabled={!fila.activo || !fila.activoTarde}
                                        onChange={(e) => cambiarFila(fila.diaSemana, { cierraTarde: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    {fallo && <p className="text-sm text-red-600">{fallo}</p>}
                    {guardadoOk && <p className="text-sm text-emerald-600">Horario guardado.</p>}

                    <div className="flex justify-end pt-2">
                        <Button onClick={guardar} disabled={guardando || filas.length === 0}>
                            {guardando ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Guardar horario
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
