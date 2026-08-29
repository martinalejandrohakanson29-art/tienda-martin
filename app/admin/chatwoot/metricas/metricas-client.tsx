"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import {
    ArrowLeft, MessageCircle, Clock, AlertTriangle, Loader2, RefreshCw, Moon,
    Users, Bot, Sparkles, ArrowRight, CheckCircle2, MessageSquare,
} from "lucide-react"
import { obtenerMetricasChatwoot } from "@/app/actions/chatwoot-metricas"
import type { MetricasChatwoot } from "@/lib/chatwoot-metricas"

const PERIODOS = [7, 30, 90]

const fmtFechaCorta = (fecha: string) => {
    const [, m, d] = fecha.split("-")
    return `${d}/${m}`
}

const hace = (iso: string) => {
    const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutos < 1) return "recién"
    if (minutos < 60) return `hace ${minutos} min`
    return `hace ${Math.round(minutos / 60)} h`
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
    icon: any; label: string; value: string; sub?: string; color: string
}) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
            <div className={`p-2.5 rounded-xl w-fit ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">{label}</p>
                <p className="text-2xl font-black text-slate-900 mt-0.5 leading-tight">{value}</p>
                {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
            </div>
        </div>
    )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
            <div>
                <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
                {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            {children}
        </div>
    )
}

export function MetricasChatwootClient({
    periodoInicial, datosIniciales, errorInicial,
}: {
    periodoInicial: number
    datosIniciales: MetricasChatwoot | null
    errorInicial: string | null
}) {
    const [periodo, setPeriodo] = useState(periodoInicial)
    const [datos, setDatos] = useState(datosIniciales)
    const [error, setError] = useState(errorInicial)
    const [pendiente, arrancarTransicion] = useTransition()

    const cargar = (nuevoPeriodo: number, forzar: boolean) => {
        setError(null)
        arrancarTransicion(async () => {
            const resultado = await obtenerMetricasChatwoot(nuevoPeriodo, forzar)
            if (resultado.success) {
                setDatos(resultado.datos)
            } else {
                setError(resultado.error)
            }
        })
    }

    const cambiarPeriodo = (nuevoPeriodo: number) => {
        setPeriodo(nuevoPeriodo)
        cargar(nuevoPeriodo, false)
    }

    const horaMax = datos ? Math.max(...datos.porHora.map((h) => h.cantidad), 0) : 0

    // Cálculos del embudo
    const totalConv = datos?.totalConversaciones || 0
    const respondidas = datos?.continuidad.conversacionesConRespuesta || 0
    const continuaron = datos?.continuidad.conversacionesConContinuacion || 0
    const sinRespuesta = Math.max(totalConv - respondidas, 0)
    const tasaAtencion = totalConv > 0 ? Math.round((respondidas / totalConv) * 1000) / 10 : 0
    const tasaContinuidad = datos?.continuidad.porcentaje || 0
    const tasaGlobal = datos?.continuidad.porcentajeSobreTotal ?? (totalConv > 0 ? Math.round((continuaron / totalConv) * 1000) / 10 : 0)
    const promedioMensajes = totalConv > 0 && datos ? (datos.totalMensajesEntrantes / totalConv).toFixed(1) : "0"

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/admin/chatwoot"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-1"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a Chatwoot
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Métricas de Clientes en Chatwoot</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Embudo de WhatsApp: cuántas personas llegan por publicidad/mensajes, cuántas reciben respuesta y cuántas continúan dialogando.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                            {PERIODOS.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => cambiarPeriodo(p)}
                                    disabled={pendiente}
                                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                                        periodo === p ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                                >
                                    {p}d
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => cargar(periodo, true)}
                            disabled={pendiente}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-60"
                        >
                            {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Actualizar
                        </button>
                    </div>
                </div>
            </div>

            {error && !datos && (
                <div className="flex items-start gap-3 rounded-xl border-l-4 border-l-red-500 bg-white p-4 text-sm text-red-700 shadow-sm">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {datos && (
                <>
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Últimos {datos.periodoDias} días · {datos.totalConversaciones.toLocaleString("es-AR")} conversaciones analizadas · actualizado{" "}
                            {hace(datos.actualizadoEn)} (guardado en PostgreSQL)
                        </p>
                        {error && <Badge variant="destructive" className="text-[10px]">{error}</Badge>}
                    </div>

                    {/* SECCIÓN EMBUDO DE CONVERSIÓN DE WHATSAPP */}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 text-white shadow-lg">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-6 border-b border-slate-700/60 pb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <MessageSquare className="h-5 w-5 text-indigo-400" />
                                    Embudo de WhatsApp (Llegada → Bienvenida → Re-enganche)
                                </h2>
                                <p className="text-xs text-slate-300 mt-0.5">
                                    Seguimiento claro del recorrido de cada persona que escribe a la tienda
                                </p>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                                {datos.periodoDias} días
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                            {/* PASO 1: LLEGARON */}
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col justify-between relative overflow-hidden">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <span className="text-[11px] font-bold tracking-wider text-blue-200 uppercase">
                                            1. Llegaron por WhatsApp
                                        </span>
                                    </div>
                                    <span className="text-xs text-slate-400 font-mono">100%</span>
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-white tracking-tight">
                                        {totalConv.toLocaleString("es-AR")}
                                    </p>
                                    <p className="text-xs text-slate-300 mt-1">
                                        conversaciones iniciadas por publicidad o consulta directa ({datos.totalMensajesEntrantes.toLocaleString("es-AR")} msgs recibidos).
                                    </p>
                                </div>
                            </div>

                            {/* PASO 2: BIENVENIDA */}
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col justify-between relative overflow-hidden">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-400/30">
                                            <Bot className="h-5 w-5" />
                                        </div>
                                        <span className="text-[11px] font-bold tracking-wider text-violet-200 uppercase">
                                            2. Recibieron Bienvenida
                                        </span>
                                    </div>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-200 border border-violet-400/30 font-mono">
                                        {tasaAtencion}%
                                    </span>
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-white tracking-tight">
                                        {respondidas.toLocaleString("es-AR")}
                                    </p>
                                    <p className="text-xs text-slate-300 mt-1">
                                        conversaciones respondidas con mensaje de bienvenida ({sinRespuesta} quedaron sin respuesta).
                                    </p>
                                </div>
                            </div>

                            {/* PASO 3: RE-ENGANCHE / CONTINUARON */}
                            <div className="bg-emerald-950/40 backdrop-blur-md rounded-2xl p-5 border border-emerald-500/30 flex flex-col justify-between relative overflow-hidden">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                            <Sparkles className="h-5 w-5" />
                                        </div>
                                        <span className="text-[11px] font-bold tracking-wider text-emerald-200 uppercase">
                                            3. Siguieron la charla
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 font-mono">
                                        {tasaContinuidad}%
                                    </span>
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-emerald-300 tracking-tight">
                                        {continuaron.toLocaleString("es-AR")} <span className="text-base font-normal text-emerald-200/80">personas</span>
                                    </p>
                                    <p className="text-xs text-emerald-100/90 mt-1">
                                        volvieron a escribir tras la bienvenida ({tasaContinuidad}% de los respondidos · {tasaGlobal}% del total de llegadas).
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TARJETAS COMPLEMENTARIAS */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <KpiCard
                            icon={MessageCircle}
                            label="Volumen de Mensajes"
                            value={datos.totalMensajesEntrantes.toLocaleString("es-AR")}
                            sub={`Promedio de ~${promedioMensajes} mensajes por conversación`}
                            color="bg-indigo-100 text-indigo-600"
                        />
                        <KpiCard
                            icon={Clock}
                            label="Hora pico de llegada"
                            value={datos.horaPico ? `${datos.horaPico.hora}:00 hs` : "—"}
                            sub={datos.horaPico ? `${datos.horaPico.cantidad} mensajes ingresaron en esa hora` : "sin datos suficientes"}
                            color="bg-sky-100 text-sky-600"
                        />
                        <KpiCard
                            icon={Moon}
                            label="Fuera de horario (Cola)"
                            value={datos.totalMensajesFueraHorario.toLocaleString("es-AR")}
                            sub={`${datos.totalEncolados} respuestas generadas en cola con bot apagado`}
                            color="bg-rose-100 text-rose-600"
                        />
                    </div>

                    {/* GRÁFICOS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <ChartCard
                            title="Distribución horaria real de mensajes"
                            subtitle="Horario exacto de llegada de todos los mensajes de clientes (0 a 23 hs Argentina UTC-3)"
                        >
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={datos.porHora} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="hora" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const d = payload[0].payload as { hora: number; cantidad: number }
                                            return (
                                                <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 text-sm">
                                                    <p className="font-bold text-slate-700">{d.hora}:00 hs</p>
                                                    <p className="text-slate-500">
                                                        Mensajes entrantes: <span className="font-bold text-slate-800">{d.cantidad}</span>
                                                    </p>
                                                </div>
                                            )
                                        }}
                                    />
                                    <Bar dataKey="cantidad" name="Mensajes" radius={[4, 4, 0, 0]}>
                                        {datos.porHora.map((h, i) => (
                                            <Cell key={i} fill={h.cantidad === horaMax && horaMax > 0 ? "#7c3aed" : "#ddd6fe"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Mensajes entrantes por día" subtitle={`Serie continua de los últimos ${datos.periodoDias} días`}>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart
                                    data={datos.porDia.map((d) => ({ ...d, fechaCorta: fmtFechaCorta(d.fecha) }))}
                                    margin={{ top: 0, right: 5, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="fechaCorta" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const d = payload[0].payload as { fecha: string; cantidad: number }
                                            return (
                                                <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 text-sm">
                                                    <p className="font-bold text-slate-700">{d.fecha}</p>
                                                    <p className="text-slate-500">
                                                        Mensajes entrantes: <span className="font-bold text-slate-800">{d.cantidad}</span>
                                                    </p>
                                                </div>
                                            )
                                        }}
                                    />
                                    <Bar dataKey="cantidad" name="Mensajes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </>
            )}
        </div>
    )
}

