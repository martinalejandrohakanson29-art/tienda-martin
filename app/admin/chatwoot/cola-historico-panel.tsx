"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Clock,
    Sun,
    Moon,
    Users,
    MessageSquare,
    RefreshCw,
    Loader2,
    Calendar,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    AlertCircle,
    CheckCircle2,
    Sparkles,
} from "lucide-react"
import {
    obtenerHistoricoColasAction,
    obtenerEstadoColaEnVivoAction,
    reprocesarBackfillHistoricoAction,
} from "@/app/actions/chatwoot-cola-historico"
import type { ResumenDiaCola, EstadoColaEnVivo } from "@/lib/chatwoot-cola-historico"

const PERIODOS = [7, 14, 30]

const formatearFechaCorta = (fechaStr: string) => {
    const [, m, d] = fechaStr.split("-")
    return `${d}/${m}`
}

export function ColaHistoricoPanel({
    inicialHistorico,
    inicialEnVivo,
    chatwootUrl = "https://chat.revolucionmotos.tech",
}: {
    inicialHistorico: ResumenDiaCola[]
    inicialEnVivo: EstadoColaEnVivo | null
    chatwootUrl?: string
}) {
    const [periodo, setPeriodo] = useState(14)
    const [historico, setHistorico] = useState<ResumenDiaCola[]>(inicialHistorico)
    const [colaEnVivo, setColaEnVivo] = useState<EstadoColaEnVivo | null>(inicialEnVivo)
    const [pendiente, arrancarTransicion] = useTransition()
    const [expandidoDia, setExpandidoDia] = useState<string | null>(null)
    const [verPendientesEnVivo, setVerPendientesEnVivo] = useState(false)
    const [mensajeSincro, setMensajeSincro] = useState<string | null>(null)

    const recargar = (dias: number) => {
        arrancarTransicion(async () => {
            const [resHist, resVivo] = await Promise.all([
                obtenerHistoricoColasAction(dias),
                obtenerEstadoColaEnVivoAction(),
            ])
            if (resHist.success) setHistorico(resHist.datos)
            if (resVivo.success) setColaEnVivo(resVivo.datos)
        })
    }

    const cambiarPeriodo = (dias: number) => {
        setPeriodo(dias)
        recargar(dias)
    }

    const sincronizar = () => {
        setMensajeSincro(null)
        arrancarTransicion(async () => {
            const resBackfill = await reprocesarBackfillHistoricoAction()
            const [resHist, resVivo] = await Promise.all([
                obtenerHistoricoColasAction(periodo),
                obtenerEstadoColaEnVivoAction(),
            ])
            if (resHist.success) setHistorico(resHist.datos)
            if (resVivo.success) setColaEnVivo(resVivo.datos)
            if (resBackfill.success) {
                setMensajeSincro(`Sincronizados ${resBackfill.insertados} registros históricos.`)
                setTimeout(() => setMensajeSincro(null), 4000)
            }
        })
    }

    // Métricas globales del período
    const diasConDatos = historico.filter((d) => d.totalMensajes > 0)
    const totalMsgsPeriodo = historico.reduce((acc, d) => acc + d.totalMensajes, 0)
    const totalConvsPeriodo = historico.reduce((acc, d) => acc + d.totalConversaciones, 0)

    const diasHabilesManana = historico.filter((d) => d.manana.mensajes > 0)
    const promedioManana = diasHabilesManana.length > 0
        ? Math.round(diasHabilesManana.reduce((acc, d) => acc + d.manana.mensajes, 0) / diasHabilesManana.length)
        : 0

    const diasHabilesTarde = historico.filter((d) => d.tarde.mensajes > 0)
    const promedioTarde = diasHabilesTarde.length > 0
        ? Math.round(diasHabilesTarde.reduce((acc, d) => acc + d.tarde.mensajes, 0) / diasHabilesTarde.length)
        : 0

    return (
        <Card id="cola-historico" className="border-l-4 border-l-sky-500 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/60 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-6 w-6 text-sky-600" />
                            <CardTitle className="text-xl font-bold tracking-tight text-slate-900">
                                Cola de Mensajes con Bot Apagado
                            </CardTitle>
                        </div>
                        <CardDescription className="text-sm text-slate-600 mt-1">
                            Monitoreo de mensajes que se van acumulando en cola cada vez que el bot está apagado.
                            Histórico registrado y desglosado para el <strong>bloque de la mañana</strong> y el <strong>bloque de la tarde</strong>.
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                            {PERIODOS.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => cambiarPeriodo(p)}
                                    disabled={pendiente}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        periodo === p
                                            ? "bg-sky-600 text-white"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`}
                                >
                                    {p}d
                                </button>
                            ))}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => recargar(periodo)}
                            disabled={pendiente}
                            className="h-8 shadow-sm text-xs gap-1.5"
                        >
                            {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Actualizar
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={sincronizar}
                            disabled={pendiente}
                            title="Recalcula el histórico desde los turnos registrados"
                            className="h-8 text-xs text-slate-500 hover:text-slate-800"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-amber-500 mr-1" />
                            Sincronizar
                        </Button>
                    </div>
                </div>

                {mensajeSincro && (
                    <div className="mt-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {mensajeSincro}
                    </div>
                )}
            </CardHeader>

            <CardContent className="pt-5 space-y-6">
                {/* BANNER COLA EN VIVO ACTUAL */}
                {colaEnVivo && (
                    <div
                        className={`rounded-2xl p-4 border transition-all ${
                            !colaEnVivo.botEncendido
                                ? "bg-amber-50/80 border-amber-200/80 text-amber-950"
                                : "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                        }`}
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div
                                    className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                                        !colaEnVivo.botEncendido ? "bg-amber-200/70 text-amber-800" : "bg-emerald-200/70 text-emerald-800"
                                    }`}
                                >
                                    {!colaEnVivo.botEncendido ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm">
                                            {!colaEnVivo.botEncendido
                                                ? `Bot apagado · Acumulando cola para Bloque ${colaEnVivo.bloqueActual === "manana" ? "Mañana" : "Tarde"}`
                                                : "Bot encendido · Atendiendo mensajes en vivo"}
                                        </h3>
                                        <Badge
                                            variant={!colaEnVivo.botEncendido ? "secondary" : "default"}
                                            className="text-[11px] uppercase tracking-wider font-semibold"
                                        >
                                            {!colaEnVivo.botEncendido ? "OFF" : "ON"}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1">
                                        {!colaEnVivo.botEncendido
                                            ? `Hay ${colaEnVivo.mensajesEncoladosActual} mensajes acumulados de ${colaEnVivo.conversacionesEncoladasActual} clientes esperando respuesta.`
                                            : "No hay cola acumulándose. Las conversaciones entrantes se responden al instante."}
                                    </p>
                                </div>
                            </div>

                            {colaEnVivo.conversacionesPendientes.length > 0 && (
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setVerPendientesEnVivo(!verPendientesEnVivo)}
                                        className="text-xs font-semibold bg-white shadow-sm border-amber-300 hover:bg-amber-100/50"
                                    >
                                        <Users className="h-3.5 w-3.5 mr-1.5 text-amber-700" />
                                        {verPendientesEnVivo ? "Ocultar clientes en cola" : `Ver ${colaEnVivo.conversacionesPendientes.length} clientes en cola`}
                                        {verPendientesEnVivo ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                                    </Button>
                                    <Link
                                        href="/admin/chatwoot/cola"
                                        className="text-xs font-medium text-amber-800 hover:underline inline-flex items-center gap-1"
                                    >
                                        Ir a despachar <ExternalLink className="h-3 w-3" />
                                    </Link>
                                </div>
                            )}
                        </div>

                        {/* LISTA EXPANDIBLE DE CLIENTES EN COLA EN VIVO */}
                        {verPendientesEnVivo && colaEnVivo.conversacionesPendientes.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-amber-200/60 space-y-2">
                                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                                    Clientes esperando apertura ({colaEnVivo.conversacionesPendientes.length}):
                                </p>
                                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                                    {colaEnVivo.conversacionesPendientes.map((c) => (
                                        <div
                                            key={c.conversationId}
                                            className="bg-white/80 rounded-xl p-2.5 border border-amber-200/50 flex items-center justify-between gap-3 text-xs"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-slate-800">
                                                        {c.nombre || "Cliente WhatsApp"}
                                                    </span>
                                                    {c.telefono && (
                                                        <span className="text-slate-500 font-mono text-[11px]">
                                                            {c.telefono}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-slate-600 truncate mt-0.5 text-[11px]">
                                                    &ldquo;{c.ultimoMensaje || "Mensaje entrante"}&rdquo;
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-[10px] text-slate-400 block">
                                                    Llegó {new Date(c.ultimoMensajeEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                                                </span>
                                                <a
                                                    href={`${chatwootUrl}/app/accounts/1/conversations/${c.conversationId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-0.5 font-medium"
                                                >
                                                    Chatwoot #{c.conversationId} <ExternalLink className="h-2.5 w-2.5" />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TARJETAS DE RESUMEN KPI */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-start gap-3.5">
                        <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                            <Sun className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Promedio Bloque Mañana
                            </p>
                            <p className="text-2xl font-black text-slate-900 mt-0.5">
                                ~{promedioManana} <span className="text-xs font-normal text-slate-500">msgs/apertura</span>
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Acumulados durante noche y madrugada (19hs a 09hs)
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-start gap-3.5">
                        <div className="p-2.5 rounded-xl bg-orange-100 text-orange-700 shrink-0">
                            <SunsetIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Promedio Bloque Tarde
                            </p>
                            <p className="text-2xl font-black text-slate-900 mt-0.5">
                                ~{promedioTarde} <span className="text-xs font-normal text-slate-500">msgs/apertura</span>
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Acumulados durante el mediodía y siesta (13:30 a 16hs)
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-start gap-3.5">
                        <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 shrink-0">
                            <MessageSquare className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Total Encolados ({periodo}d)
                            </p>
                            <p className="text-2xl font-black text-slate-900 mt-0.5">
                                {totalMsgsPeriodo.toLocaleString("es-AR")} <span className="text-xs font-normal text-slate-500">mensajes</span>
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                                de {totalConvsPeriodo.toLocaleString("es-AR")} clientes recibidos con bot apagado
                            </p>
                        </div>
                    </div>
                </div>

                {/* TABLA HISTÓRICA DÍA POR DÍA */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            Histórico de Colas por Día (Últimos {periodo} días)
                        </h4>
                        <span className="text-xs text-slate-400">
                            Hora Argentina (UTC-3) · Datos persistidos en PostgreSQL
                        </span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">Fecha / Día</th>
                                        <th className="py-3 px-4">
                                            <div className="flex items-center gap-1.5">
                                                <Sun className="h-3.5 w-3.5 text-amber-600" />
                                                <span>Bloque Mañana (Noche/Madrugada)</span>
                                            </div>
                                        </th>
                                        <th className="py-3 px-4">
                                            <div className="flex items-center gap-1.5">
                                                <SunsetIcon className="h-3.5 w-3.5 text-orange-600" />
                                                <span>Bloque Tarde (Mediodía/Siesta)</span>
                                            </div>
                                        </th>
                                        <th className="py-3 px-4 text-right">Total Día</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {historico.map((dia) => {
                                        const tieneManana = dia.manana.mensajes > 0
                                        const tieneTarde = dia.tarde.mensajes > 0
                                        const esHoy = dia.fecha === colaEnVivo?.fechaOperativa

                                        return (
                                            <tr
                                                key={dia.fecha}
                                                className={`hover:bg-slate-50/70 transition-colors ${
                                                    esHoy ? "bg-sky-50/40" : ""
                                                }`}
                                            >
                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-slate-900 flex items-center gap-2">
                                                        <span>{dia.diaNombre} {formatearFechaCorta(dia.fecha)}</span>
                                                        {esHoy && (
                                                            <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-[10px] font-semibold">
                                                                Hoy
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <span className="text-[11px] text-slate-400">
                                                        {dia.fecha}
                                                    </span>
                                                </td>

                                                {/* BLOQUE MAÑANA */}
                                                <td className="py-3.5 px-4">
                                                    {tieneManana ? (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-black text-slate-900 text-sm">
                                                                    {dia.manana.mensajes} msgs
                                                                </span>
                                                                <span className="text-slate-500 font-medium">
                                                                    ({dia.manana.conversaciones} {dia.manana.conversaciones === 1 ? "cliente" : "clientes"})
                                                                </span>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={`text-[10px] ${
                                                                        dia.manana.estado === "acumulando"
                                                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                            : "bg-slate-50 text-slate-600 border-slate-200"
                                                                    }`}
                                                                >
                                                                    {dia.manana.estado === "acumulando" ? "En cola" : "Despachada"}
                                                                </Badge>
                                                            </div>
                                                            {dia.manana.primeroEn && dia.manana.ultimoEn && (
                                                                <span className="text-[10px] text-slate-400 block">
                                                                    De {new Date(dia.manana.primeroEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} a {new Date(dia.manana.ultimoEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 font-mono text-sm">—</span>
                                                    )}
                                                </td>

                                                {/* BLOQUE TARDE */}
                                                <td className="py-3.5 px-4">
                                                    {tieneTarde ? (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-black text-slate-900 text-sm">
                                                                    {dia.tarde.mensajes} msgs
                                                                </span>
                                                                <span className="text-slate-500 font-medium">
                                                                    ({dia.tarde.conversaciones} {dia.tarde.conversaciones === 1 ? "cliente" : "clientes"})
                                                                </span>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={`text-[10px] ${
                                                                        dia.tarde.estado === "acumulando"
                                                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                            : "bg-slate-50 text-slate-600 border-slate-200"
                                                                    }`}
                                                                >
                                                                    {dia.tarde.estado === "acumulando" ? "En cola" : "Despachada"}
                                                                </Badge>
                                                            </div>
                                                            {dia.tarde.primeroEn && dia.tarde.ultimoEn && (
                                                                <span className="text-[10px] text-slate-400 block">
                                                                    De {new Date(dia.tarde.primeroEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} a {new Date(dia.tarde.ultimoEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 font-mono text-sm">—</span>
                                                    )}
                                                </td>

                                                {/* TOTAL DÍA */}
                                                <td className="py-3.5 px-4 text-right">
                                                    {dia.totalMensajes > 0 ? (
                                                        <div>
                                                            <span className="font-black text-slate-900 text-sm">
                                                                {dia.totalMensajes} msgs
                                                            </span>
                                                            <span className="text-[11px] text-slate-500 block">
                                                                {dia.totalConversaciones} clientes
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 font-mono text-sm">0</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function SunsetIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 10V2" />
            <path d="m4.93 10.93 1.41 1.41" />
            <path d="M2 18h2" />
            <path d="M20 18h2" />
            <path d="m19.07 10.93-1.41 1.41" />
            <path d="M22 22H2" />
            <path d="m16 6-4 4-4-4" />
            <path d="M16 18a4 4 0 0 0-8 0" />
        </svg>
    )
}
