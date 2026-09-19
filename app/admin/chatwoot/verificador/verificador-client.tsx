"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, ShieldCheck, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
    cambiarModoVerificador,
    listarChequeosMarcados,
    marcarVeredicto,
    type ChequeoRow,
    type ResumenVerificador,
    type VeredictoHumano
} from "@/app/actions/verificador-grounding"

const fecha = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Cordoba",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    })

const soloFecha = (iso: string) =>
    new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Cordoba", day: "2-digit", month: "2-digit" })

/**
 * Una caja de número con su lectura al lado. El número solo no dice nada: que
 * el marcado esté en 4% es bueno o malo según el criterio del plan, y ese
 * criterio tiene que estar a la vista de quien mira, no en un documento.
 */
function Metrica({
    titulo,
    valor,
    lectura,
    estado
}: {
    titulo: string
    valor: string
    lectura: string
    estado?: "bien" | "ojo" | "neutro"
}) {
    const color =
        estado === "bien"
            ? "border-emerald-200 bg-emerald-50"
            : estado === "ojo"
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50"
    return (
        <div className={`rounded-lg border p-3 ${color}`}>
            <div className="text-xs font-medium text-slate-500">{titulo}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{valor}</div>
            <div className="mt-1 text-xs leading-snug text-slate-600">{lectura}</div>
        </div>
    )
}

function FichaChequeo({
    chequeo,
    onVeredicto,
    guardando
}: {
    chequeo: ChequeoRow
    onVeredicto: (id: number, v: VeredictoHumano | null) => void
    guardando: boolean
}) {
    const [abierto, setAbierto] = useState(false)
    const juzgado = chequeo.veredictoHumano !== null

    return (
        <Card className={`border-l-4 ${juzgado ? "border-l-slate-300 opacity-70" : "border-l-amber-500"}`}>
            <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 font-mono text-amber-900">
                        {chequeo.noul.toFixed(2)}
                    </Badge>
                    <span>{fecha(chequeo.creadoEn)}</span>
                    {chequeo.conversationId && <span>· conversación {chequeo.conversationId}</span>}
                    {chequeo.ms !== null && <span>· {chequeo.ms} ms</span>}
                    {juzgado && (
                        <Badge
                            variant="outline"
                            className={
                                chequeo.veredictoHumano === "acertado"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-slate-300 bg-slate-100 text-slate-700"
                            }
                        >
                            {chequeo.veredictoHumano === "acertado" ? "Estaba mal el bot" : "Falsa alarma"}
                        </Badge>
                    )}
                </div>

                {/* Lo que el bot iba a mandar: es lo único que hay que leer para decidir. */}
                <div className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-sm leading-relaxed text-slate-100">
                    {chequeo.borrador}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant={chequeo.veredictoHumano === "acertado" ? "default" : "outline"}
                        disabled={guardando}
                        onClick={() => onVeredicto(chequeo.id, chequeo.veredictoHumano === "acertado" ? null : "acertado")}
                        className="gap-1"
                    >
                        <AlertTriangle className="h-4 w-4" />
                        El bot se mandó una macana
                    </Button>
                    <Button
                        size="sm"
                        variant={chequeo.veredictoHumano === "falso_positivo" ? "default" : "outline"}
                        disabled={guardando}
                        onClick={() =>
                            onVeredicto(chequeo.id, chequeo.veredictoHumano === "falso_positivo" ? null : "falso_positivo")
                        }
                        className="gap-1"
                    >
                        <Check className="h-4 w-4" />
                        Estaba bien, falsa alarma
                    </Button>

                    <button
                        type="button"
                        onClick={() => setAbierto((v) => !v)}
                        className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                    >
                        {abierto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Ver los datos que tenía a mano
                    </button>
                </div>

                {/*
                 * Los hechos del turno, crudos. Están para poder juzgar el
                 * marcado sin tener que adivinar qué sabía el bot cuando lo
                 * escribió — es la diferencia entre "me parece" y saberlo.
                 */}
                {abierto && (
                    <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
                        {JSON.stringify(chequeo.estadoTools, null, 2)}
                    </pre>
                )}
            </CardContent>
        </Card>
    )
}

export function VerificadorClient({
    resumen: resumenInicial,
    chequeos: chequeosIniciales
}: {
    resumen: ResumenVerificador
    chequeos: ChequeoRow[]
}) {
    const [resumen, setResumen] = useState(resumenInicial)
    const [chequeos, setChequeos] = useState(chequeosIniciales)
    const [soloPendientes, setSoloPendientes] = useState(true)
    const [pendiente, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const prendido = resumen.modo !== "off"

    const recargar = (pendientes: boolean) => {
        startTransition(async () => {
            const filas = await listarChequeosMarcados({ soloPendientes: pendientes })
            setChequeos(filas)
        })
    }

    const alternarModo = (encender: boolean) => {
        setError(null)
        startTransition(async () => {
            const r = await cambiarModoVerificador(encender ? "sombra" : "off")
            if (!r.ok) {
                setError(r.error || "No se pudo cambiar el modo")
                return
            }
            setResumen((v) => ({ ...v, modo: encender ? "sombra" : "off" }))
        })
    }

    const guardarVeredicto = (id: number, veredicto: VeredictoHumano | null) => {
        setError(null)
        // Optimista: el clic tiene que sentirse inmediato, son muchos seguidos.
        setChequeos((prev) => prev.map((c) => (c.id === id ? { ...c, veredictoHumano: veredicto } : c)))
        startTransition(async () => {
            const r = await marcarVeredicto(id, veredicto)
            if (!r.ok) {
                setError(r.error || "No se pudo guardar el veredicto")
                recargar(soloPendientes)
            }
        })
    }

    if (!resumen.existeTabla) {
        return (
            <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-6 text-sm text-amber-900">
                    Falta crear la tabla. Corré una vez{" "}
                    <code className="rounded bg-amber-100 px-1">n8n-workflows/bot-verificador-grounding.sql</code> y
                    volvé a entrar.
                </CardContent>
            </Card>
        )
    }

    const sinDatos = resumen.totalChequeos === 0
    const marcadoAlto = resumen.porcentajeMarcado > 5

    return (
        <div className="space-y-5">
            {/* --- Prendido / apagado ------------------------------------- */}
            <Card className={prendido ? "border-teal-300 bg-teal-50/50" : ""}>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ShieldCheck className={`h-5 w-5 ${prendido ? "text-teal-600" : "text-slate-400"}`} />
                        Control de calidad {prendido ? "prendido" : "apagado"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Switch checked={prendido} onCheckedChange={alternarModo} disabled={pendiente} />
                        <div className="text-sm text-slate-700">
                            {prendido ? (
                                <>
                                    <strong>Modo espía.</strong> Mira cada mensaje antes de salir y anota los
                                    sospechosos. <strong>No frena nada</strong>: todos los mensajes se mandan igual.
                                </>
                            ) : (
                                <>Apagado del todo: no se llama ni una vez y el bot funciona como siempre.</>
                            )}
                        </div>
                    </div>
                    {prendido && resumen.ultimaHora === 0 && resumen.totalChequeos > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            Sin chequeos en la última hora. Puede ser que no haya habido mensajes, o que el servicio
                            esté caído. Si está caído, los mensajes salen igual: nunca frena por una falla.
                        </div>
                    )}
                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>
                    )}
                </CardContent>
            </Card>

            {/* --- Los números que deciden -------------------------------- */}
            {sinDatos ? (
                <Card>
                    <CardContent className="pt-6 text-sm text-slate-600">
                        Todavía no hay ningún chequeo.{" "}
                        {prendido
                            ? "Recién prendido: van a aparecer a medida que el bot conteste."
                            : "Prendé el modo espía arriba para que empiece a mirar."}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Metrica
                        titulo="Mensajes mirados"
                        valor={resumen.totalChequeos.toLocaleString("es-AR")}
                        lectura={resumen.desde ? `desde el ${soloFecha(resumen.desde)}` : ""}
                    />
                    <Metrica
                        titulo="Marcados"
                        valor={`${resumen.totalMarcados} · ${resumen.porcentajeMarcado.toFixed(1)}%`}
                        lectura={
                            marcadoAlto
                                ? "Arriba del 5%: marca demasiado para llegar a frenar mensajes algún día"
                                : "Abajo del 5%, que es el techo para que esto sirva"
                        }
                        estado={marcadoAlto ? "ojo" : "bien"}
                    />
                    <Metrica
                        titulo="Acierto"
                        valor={resumen.precision === null ? "—" : `${resumen.precision.toFixed(0)}%`}
                        lectura={
                            resumen.precision === null
                                ? "Juzgá los marcados de abajo para que aparezca"
                                : `${resumen.acertados} de ${resumen.juzgados} juzgados. Hace falta 80% para dejarlo frenar mensajes`
                        }
                        estado={resumen.precision === null ? "neutro" : resumen.precision >= 80 ? "bien" : "ojo"}
                    />
                    <Metrica
                        titulo="Demora"
                        valor={resumen.msP90 === null ? "—" : `${resumen.msP90} ms`}
                        lectura={
                            resumen.msP90 !== null && resumen.msP90 > 1200
                                ? "Arriba de 1,2 s: se está haciendo caro en tiempo"
                                : `Bien. Costó US$${resumen.costoTotalUsd.toFixed(4)} en total`
                        }
                        estado={resumen.msP90 !== null && resumen.msP90 > 1200 ? "ojo" : "bien"}
                    />
                </div>
            )}

            {/* --- La bandeja de lectura ---------------------------------- */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                    Para revisar {chequeos.length > 0 && <span className="text-slate-400">({chequeos.length})</span>}
                </h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <Switch
                        checked={soloPendientes}
                        onCheckedChange={(v) => {
                            setSoloPendientes(v)
                            recargar(v)
                        }}
                        disabled={pendiente}
                    />
                    Ocultar los que ya juzgué
                </label>
            </div>

            {pendiente && chequeos.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </div>
            ) : chequeos.length === 0 ? (
                <Card>
                    <CardContent className="flex items-center gap-2 pt-6 text-sm text-slate-600">
                        <Check className="h-4 w-4 text-emerald-600" />
                        {soloPendientes && resumen.totalMarcados > 0
                            ? "No queda ninguno sin juzgar."
                            : "Ningún mensaje marcado. Es la buena noticia: el bot no afirmó nada que no tuviera."}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {chequeos.map((c) => (
                        <FichaChequeo key={c.id} chequeo={c} onVeredicto={guardarVeredicto} guardando={pendiente} />
                    ))}
                </div>
            )}
        </div>
    )
}
