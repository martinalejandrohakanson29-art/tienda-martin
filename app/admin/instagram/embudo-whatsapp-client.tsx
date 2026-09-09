"use client"

import { useMemo, useState, useTransition } from "react"
import {
    AlertTriangle,
    ArrowUpRight,
    Info,
    Loader2,
    MessageSquare,
    RefreshCw,
    ShoppingCart,
    Users,
    X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { obtenerEmbudoWhatsapp } from "@/app/actions/embudo-whatsapp"
import type { ConversacionEmbudo, EmbudoWhatsapp, EtapaCorte, FilaEmbudoKit } from "@/lib/embudo-whatsapp"

/**
 * Pestaña "Embudo WhatsApp" de /admin/instagram.
 *
 * Lee lo que el bot ya venía guardando turno a turno y lo abre por kit: cuántas
 * consultas entran por cada uno y en qué punto se apagan. Los dos cortes que
 * disparan la sección —"se fue con la primera respuesta" y "se fue porque no
 * era compatible"— son columnas distintas a propósito.
 */

const ETIQUETA_CORTE: Record<EtapaCorte, string> = {
    en_curso: "En curso",
    sin_respuesta: "Nunca le contestamos",
    tras_primera_respuesta: "Se fue con la primera respuesta",
    sin_avance: "Charló y se fue sin avanzar",
    tras_precio: "Se fue después de cotizar",
    incompatible: "Se fue por incompatibilidad",
    tras_variante: "Se fue con la variante elegida",
    tras_escalado: "Quedó en manos del equipo",
}

const COLOR_CORTE: Record<EtapaCorte, string> = {
    en_curso: "bg-sky-400",
    sin_respuesta: "bg-slate-400",
    tras_primera_respuesta: "bg-rose-400",
    sin_avance: "bg-orange-300",
    tras_precio: "bg-amber-400",
    incompatible: "bg-red-600",
    tras_variante: "bg-emerald-400",
    tras_escalado: "bg-violet-400",
}

const ORDEN_CORTES: EtapaCorte[] = [
    "tras_primera_respuesta",
    "sin_avance",
    "tras_precio",
    "incompatible",
    "tras_variante",
    "tras_escalado",
    "sin_respuesta",
    "en_curso",
]

const ETIQUETA_MOTIVO: Record<string, string> = {
    moto_no_registrada: "Moto que no tenemos cargada",
    producto_no_catalogado: "Producto fuera del catálogo",
    producto_no_encontrado: "Producto que no se encontró",
    producto_sin_catalogo: "Producto fuera del catálogo",
    pieza_no_catalogada: "Pieza fuera del catálogo",
    consulta_tecnica: "Consulta técnica",
    compatibilidad_dudosa: "Compatibilidad dudosa",
    ambiguo: "Consulta ambigua",
    pago: "Pago / cierre",
    otro: "Otro",
    sin_motivo: "Sin motivo declarado",
}

const PERIODOS = [
    { dias: 7, texto: "7 días" },
    { dias: 15, texto: "15 días" },
    { dias: 30, texto: "30 días" },
    { dias: 90, texto: "90 días" },
]

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`

const fecha = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })

/** Celda de etapa: el número grande y, abajo, cuánto es del total de entradas. */
function Celda({ n, total, tono }: { n: number; total: number; tono?: string }) {
    return (
        <td className="px-3 py-2 text-center">
            <div className={`font-semibold ${n === 0 ? "text-slate-300" : tono || "text-slate-800"}`}>{n}</div>
            {total > 0 && n > 0 && <div className="text-[11px] text-slate-400">{pct(n, total)}%</div>}
        </td>
    )
}

function BarraCortes({ fila, onElegir }: { fila: FilaEmbudoKit; onElegir: (c: EtapaCorte) => void }) {
    const total = ORDEN_CORTES.reduce((acc, c) => acc + fila.cortes[c], 0)
    if (total === 0) return null
    return (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {ORDEN_CORTES.filter((c) => fila.cortes[c] > 0).map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onElegir(c)}
                    title={`${ETIQUETA_CORTE[c]}: ${fila.cortes[c]} (${pct(fila.cortes[c], total)}%)`}
                    className={`${COLOR_CORTE[c]} transition-opacity hover:opacity-70`}
                    style={{ width: `${(fila.cortes[c] / total) * 100}%` }}
                />
            ))}
        </div>
    )
}

export function EmbudoWhatsappClient({
    inicial,
    chatwootUrl,
}: {
    inicial: EmbudoWhatsapp | null
    chatwootUrl: string
}) {
    const [datos, setDatos] = useState<EmbudoWhatsapp | null>(inicial)
    const [dias, setDias] = useState(inicial?.dias ?? 15)
    const [cargando, iniciarCarga] = useTransition()
    const [detalle, setDetalle] = useState<{ kitClave: string; corte: EtapaCorte | null } | null>(null)
    const [notaAbierta, setNotaAbierta] = useState(false)

    const recargar = (nuevosDias: number) => {
        setDias(nuevosDias)
        setDetalle(null)
        iniciarCarga(async () => {
            const d = await obtenerEmbudoWhatsapp(nuevosDias)
            setDatos(d)
        })
    }

    const totales = useMemo(() => {
        const filas = datos?.filas || []
        const base = {
            entradas: 0,
            conRespuesta: 0,
            volvieron: 0,
            escaladas: 0,
            variantes: 0,
            cortePrimera: 0,
            incompatibles: 0,
            ventasInstagram: 0,
            montoInstagram: 0,
        }
        for (const f of filas) {
            base.entradas += f.entradas
            base.conRespuesta += f.conRespuesta
            base.volvieron += f.volvieron
            base.escaladas += f.escaladas
            base.variantes += f.variantes
            base.cortePrimera += f.cortes.tras_primera_respuesta
            base.incompatibles += f.cortes.incompatible
            base.ventasInstagram += f.ventasInstagram
            base.montoInstagram += f.montoInstagram
        }
        return base
    }, [datos])

    const conversacionesDetalle = useMemo(() => {
        if (!datos || !detalle) return []
        return datos.conversaciones.filter(
            (c) => c.kitClave === detalle.kitClave && (!detalle.corte || c.corte === detalle.corte)
        )
    }, [datos, detalle])

    const kitDelDetalle = datos?.filas.find((f) => f.kitClave === detalle?.kitClave)

    if (!datos || datos.totalConversaciones === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-12 text-center text-slate-500">
                    Todavía no hay turnos del bot registrados en los últimos {dias} días.
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            {/* --- Encabezado + período --- */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Embudo de WhatsApp por kit</h3>
                    <p className="text-sm text-slate-500">
                        {datos.desde && datos.hasta
                            ? `Datos del ${fecha(datos.desde)} al ${fecha(datos.hasta)}`
                            : "Sin datos"}
                        {" · "}
                        {datos.totalConversaciones} conversaciones
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {PERIODOS.map((p) => (
                        <Button
                            key={p.dias}
                            size="sm"
                            variant={p.dias === dias ? "default" : "outline"}
                            onClick={() => recargar(p.dias)}
                            disabled={cargando}
                        >
                            {p.texto}
                        </Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => recargar(dias)} disabled={cargando}>
                        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* --- Cómo leer estos números (los límites, a la vista) --- */}
            <button
                type="button"
                onClick={() => setNotaAbierta((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-900 hover:bg-sky-100"
            >
                <Info className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Cómo leer estos números</span>
                <span className="text-sky-700">{notaAbierta ? "(ocultar)" : "(leer antes de sacar conclusiones)"}</span>
            </button>
            {notaAbierta && (
                <div className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600">
                    <ul className="list-disc space-y-1 pl-4">
                        <li>
                            Sale de los turnos del bot. Las respuestas que el equipo escribe a mano no quedan
                            registradas: en las charlas que siguió un humano, &quot;el cliente no volvió&quot; mide
                            solo el tramo que atendió el bot.
                        </li>
                        <li>
                            El kit se atribuye por el anuncio de Meta (referral), o por un catálogo con un único
                            candidato, o por el kit que quedó pineado. Lo que no encaja va a &quot;Sin kit
                            identificado&quot;.
                        </li>
                        <li>
                            Una conversación se da por cortada tras {datos.horasParaCorte} horas sin mensajes; hasta
                            ahí figura &quot;En curso&quot;.
                        </li>
                        <li>
                            &quot;Cotizó&quot; es una búsqueda en el catálogo. Quien entra por anuncio ya recibe el
                            precio en la ficha de bienvenida sin pasar por ahí.
                        </li>
                        <li>
                            <strong>Ventas IG:</strong> los kits no se facturan como un artículo único, así que una
                            venta cuenta para un kit cuando incluye todos sus componentes. Son las ventas del kit
                            por el punto de venta Instagram en el mismo período, <strong>no</strong> las ventas que
                            salieron de estas conversaciones: la venta de mostrador casi nunca trae el teléfono
                            cargado, así que no se puede unir cada charla con su venta.
                        </li>
                    </ul>
                </div>
            )}

            {/* --- KPIs --- */}
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                        <CardTitle className="text-xs font-medium text-slate-500">Consultas</CardTitle>
                        <Users className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{totales.entradas}</div>
                        <p className="text-[11px] text-slate-400">{totales.conRespuesta} con respuesta del bot</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                        <CardTitle className="text-xs font-medium text-slate-500">Siguen la charla</CardTitle>
                        <MessageSquare className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">
                            {pct(totales.volvieron, totales.conRespuesta)}%
                        </div>
                        <p className="text-[11px] text-slate-400">
                            {totales.volvieron} contestaron después de la primera respuesta
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                        <CardTitle className="text-xs font-medium text-slate-500">Se van en la primera</CardTitle>
                        <X className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-600">{totales.cortePrimera}</div>
                        <p className="text-[11px] text-slate-400">
                            {pct(totales.cortePrimera, totales.entradas)}% de las consultas
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                        <CardTitle className="text-xs font-medium text-slate-500">Derivadas al equipo</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-violet-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-violet-600">{totales.escaladas}</div>
                        <p className="text-[11px] text-slate-400">
                            {pct(totales.escaladas, totales.entradas)}% de las consultas
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                        <CardTitle className="text-xs font-medium text-slate-500">
                            Kits vendidos por Instagram
                        </CardTitle>
                        <ShoppingCart className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{totales.ventasInstagram}</div>
                        <p className="text-[11px] text-slate-400">
                            {pesos(totales.montoInstagram)} · mismo período, sin atribuir a cada charla
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* --- Tabla kit x etapa --- */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Etapas alcanzadas por kit</CardTitle>
                    <p className="text-xs text-slate-500">
                        Cada número es cuántas conversaciones de ese kit llegaron a esa etapa. Clickeá una fila para
                        ver las conversaciones.
                    </p>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Kit</th>
                                <th className="px-3 py-2 text-center">Consultas</th>
                                <th className="px-3 py-2 text-center">Contestadas</th>
                                <th className="px-3 py-2 text-center">Siguieron</th>
                                <th className="px-3 py-2 text-center">Cotizó</th>
                                <th className="px-3 py-2 text-center">Preguntó compat.</th>
                                <th className="px-3 py-2 text-center">No compatible</th>
                                <th className="px-3 py-2 text-center">Eligió variante</th>
                                <th className="px-3 py-2 text-center">Derivadas</th>
                                <th className="px-3 py-2 text-center" title="Ventas del kit completo por el punto de venta Instagram, en el mismo período. No están atribuidas a estas conversaciones.">
                                    Ventas IG
                                </th>
                                <th className="px-3 py-2 text-left">Dónde se cortan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {datos.filas.map((f) => (
                                <tr
                                    key={f.kitClave}
                                    className={`cursor-pointer hover:bg-slate-50 ${
                                        detalle?.kitClave === f.kitClave ? "bg-slate-50" : ""
                                    }`}
                                    onClick={() => setDetalle({ kitClave: f.kitClave, corte: null })}
                                >
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-slate-800">{f.kitNombre}</div>
                                        {f.kitClave === "sin_kit" && (
                                            <div className="text-[11px] text-slate-400">
                                                No se pudo atribuir a un kit
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-900">{f.entradas}</td>
                                    <Celda n={f.conRespuesta} total={f.entradas} />
                                    <Celda n={f.volvieron} total={f.entradas} tono="text-emerald-700" />
                                    <Celda n={f.cotizadas} total={f.entradas} />
                                    <Celda n={f.compatConsultada} total={f.entradas} />
                                    <Celda n={f.compatNo} total={f.entradas} tono="text-red-600" />
                                    <Celda n={f.variantes} total={f.entradas} tono="text-emerald-700" />
                                    <Celda n={f.escaladas} total={f.entradas} tono="text-violet-700" />
                                    <td
                                        className="px-3 py-2 text-center"
                                        title={
                                            f.ventasTodoCanal > 0
                                                ? `${f.ventasTodoCanal} ventas del kit completo contando todos los canales (mostrador, MercadoLibre, mayorista)`
                                                : undefined
                                        }
                                    >
                                        <div
                                            className={`font-semibold ${
                                                f.ventasInstagram === 0 ? "text-slate-300" : "text-amber-600"
                                            }`}
                                        >
                                            {f.ventasInstagram}
                                        </div>
                                        {f.ventasInstagram > 0 && (
                                            <div className="text-[11px] text-slate-400">
                                                {pesos(f.montoInstagram)}
                                            </div>
                                        )}
                                        {f.ventasTodoCanal > f.ventasInstagram && (
                                            <div className="text-[11px] text-slate-400">
                                                {f.ventasTodoCanal} en total
                                            </div>
                                        )}
                                    </td>
                                    <td className="w-56 px-3 py-2">
                                        <BarraCortes
                                            fila={f}
                                            onElegir={(c) => setDetalle({ kitClave: f.kitClave, corte: c })}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* --- Leyenda de la barra --- */}
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                {ORDEN_CORTES.map((c) => (
                    <span key={c} className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${COLOR_CORTE[c]}`} />
                        {ETIQUETA_CORTE[c]}
                    </span>
                ))}
            </div>

            {/* --- Detalle: conversaciones del kit / del corte elegido --- */}
            {detalle && kitDelDetalle && (
                <Card className="border-slate-300">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle className="text-base">{kitDelDetalle.kitNombre}</CardTitle>
                            <p className="text-xs text-slate-500">
                                {detalle.corte ? ETIQUETA_CORTE[detalle.corte] : "Todas las conversaciones"} ·{" "}
                                {conversacionesDetalle.length} conversaciones
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {detalle.corte && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setDetalle({ kitClave: detalle.kitClave, corte: null })}
                                >
                                    Ver todas
                                </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setDetalle(null)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[420px] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Cliente</th>
                                        <th className="px-3 py-2 text-left">Último mensaje del cliente</th>
                                        <th className="px-3 py-2 text-left">Estado</th>
                                        <th className="px-3 py-2 text-center">Msjs</th>
                                        <th className="px-3 py-2 text-left">Última actividad</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {conversacionesDetalle.map((c: ConversacionEmbudo) => (
                                        <tr key={c.conversationId} className="hover:bg-slate-50">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-slate-800">
                                                    {c.nombre || `#${c.conversationId}`}
                                                </div>
                                                <div className="text-[11px] text-slate-400">{c.telefono}</div>
                                            </td>
                                            <td className="max-w-md px-3 py-2 text-slate-600">
                                                <span className="line-clamp-2">{c.ultimoMensajeCliente || "—"}</span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                                    <span className={`h-2 w-2 rounded-full ${COLOR_CORTE[c.corte]}`} />
                                                    {ETIQUETA_CORTE[c.corte]}
                                                </span>
                                                {c.escalado && c.motivoEscalado && (
                                                    <div className="mt-1 text-[11px] text-violet-600">
                                                        {ETIQUETA_MOTIVO[c.motivoEscalado.split(":")[0].trim()] ||
                                                            c.motivoEscalado}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center text-slate-600">{c.turnosCliente}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500">{fecha(c.ultimoTurno)}</td>
                                            <td className="px-3 py-2">
                                                <a
                                                    href={`${chatwootUrl}/app/accounts/1/conversations/${c.conversationId}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                                                >
                                                    Abrir <ArrowUpRight className="h-3 w-3" />
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* --- Escalados por motivo --- */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Por qué se deriva al equipo</CardTitle>
                    <p className="text-xs text-slate-500">
                        Cada motivo es trabajo que el bot todavía no puede sacarte. Los primeros son los que más
                        rinde cargar.
                    </p>
                </CardHeader>
                <CardContent className="space-y-2">
                    {datos.escaladosPorMotivo.map((m) => (
                        <div key={m.motivo} className="flex items-center gap-3">
                            <span className="w-56 shrink-0 text-sm text-slate-700">
                                {ETIQUETA_MOTIVO[m.motivo] || m.motivo}
                            </span>
                            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                                <div
                                    className="h-full bg-violet-400"
                                    style={{ width: `${pct(m.n, datos.escaladosPorMotivo[0]?.n || 1)}%` }}
                                />
                            </div>
                            <span className="w-10 text-right text-sm font-semibold text-slate-700">{m.n}</span>
                        </div>
                    ))}
                    {datos.escaladosPorMotivo.length === 0 && (
                        <p className="py-4 text-center text-sm text-slate-400">Sin derivaciones en el período.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
