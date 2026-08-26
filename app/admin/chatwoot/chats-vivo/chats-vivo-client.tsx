"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    forzarSincronizacionChatsVivo,
    obtenerChatsVivo,
    obtenerHiloChatVivo,
    type MensajeConversacion,
    type PanelChatsVivo,
} from "@/app/actions/chats-vivo"
import type { Categoria, ConversacionVivo } from "@/lib/chatwoot-chats-vivo"

// Panel de chats en vivo. Lee directamente desde la tabla espejo en PostgreSQL
// para carga instantánea (< 20ms); la categoría de cada una sale de
// nuestras propias tablas de pendientes (preguntas_tecnicas/negocio/precio/
// sin_match_pendientes), no de un label de Chatwoot.
// Solo lectura: el hilo se trae bajo demanda al seleccionar una conversación.

const CATEGORIA_INFO: Record<Categoria, { texto: string; clase: string }> = {
    tecnica: { texto: "Técnica", clase: "bg-blue-100 text-blue-800 border-blue-200" },
    negocio: { texto: "Negocio", clase: "bg-purple-100 text-purple-800 border-purple-200" },
    precio: { texto: "Precio", clase: "bg-amber-100 text-amber-800 border-amber-200" },
    sin_match: { texto: "Sin resolver", clase: "bg-orange-100 text-orange-800 border-orange-200" },
    sin_etiqueta: { texto: "Sin etiqueta", clase: "bg-slate-100 text-slate-600 border-slate-200" },
}

const PERIODOS = [
    { valor: 1, texto: "24hs" },
    { valor: 3, texto: "3 días" },
    { valor: 7, texto: "7 días" },
]

const fondoChat: React.CSSProperties = {
    backgroundColor: "#efeae2",
    backgroundImage: "radial-gradient(circle at 2px 2px, rgba(0,0,0,0.045) 1px, transparent 0)",
    backgroundSize: "22px 22px",
}

const horaMensaje = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "2-digit",
        minute: "2-digit",
    })

export function ChatsVivoClient({
    inicial,
    error,
    periodoInicialDias,
    chatwootUrl,
}: {
    inicial: PanelChatsVivo | null
    error: string | null
    periodoInicialDias: number
    chatwootUrl: string
}) {
    const [panel, setPanel] = useState<PanelChatsVivo | null>(inicial)
    const [fallo, setFallo] = useState<string | null>(error)
    const [periodoDias, setPeriodoDias] = useState(periodoInicialDias)
    const [cargandoLista, arrancarCargaLista] = useTransition()

    const [filtro, setFiltro] = useState<Categoria | "todas">("todas")
    const [busqueda, setBusqueda] = useState("")
    const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)

    const [hilos, setHilos] = useState<Record<number, MensajeConversacion[]>>({})
    const [cargandoHilo, arrancarCargaHilo] = useTransition()
    const [falloHilo, setFalloHilo] = useState<string | null>(null)

    const conversaciones = panel?.conversaciones ?? []

    const refrescar = (dias: number) => {
        arrancarCargaLista(async () => {
            try {
                const nuevo = await obtenerChatsVivo(dias)
                setPanel(nuevo)
                setFallo(null)
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudieron leer las conversaciones de Chatwoot")
            }
        })
    }

    const sincronizar = (dias: number) => {
        arrancarCargaLista(async () => {
            try {
                const nuevo = await forzarSincronizacionChatsVivo(dias)
                setPanel(nuevo)
                setFallo(null)
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudieron sincronizar las conversaciones de Chatwoot")
            }
        })
    }

    const cambiarPeriodo = (dias: number) => {
        setPeriodoDias(dias)
        refrescar(dias)
    }

    // Escuchar eventos en tiempo real vía Server-Sent Events (SSE)
    useEffect(() => {
        let es: EventSource | null = null
        try {
            es = new EventSource("/api/chatwoot/stream")

            es.onmessage = (event) => {
                if (!event.data) return
                try {
                    const data = JSON.parse(event.data)
                    const convId = Number(data.conversationId)
                    if (!convId) return

                    // Si llegó un mensaje nuevo y tenemos esa conversación en pantalla,
                    // agregamos el globito al hilo de inmediato
                    if (data.mensaje) {
                        setHilos((prev) => {
                            const actual = prev[convId] || []
                            if (actual.some((m) => m.id === data.mensaje.id)) return prev
                            return {
                                ...prev,
                                [convId]: [...actual, data.mensaje],
                            }
                        })
                    }

                    // Actualizar la lista de conversaciones desde PostgreSQL (< 20ms)
                    refrescar(periodoDias)
                } catch {
                    // ignorar parse error
                }
            }
        } catch (e) {
            console.error("Error conectando a stream SSE de chatwoot:", e)
        }

        return () => {
            if (es) es.close()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodoDias])

    const conversacionesFiltradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase()
        return conversaciones.filter((c) => {
            const pasaCategoria = filtro === "todas" || c.categoria === filtro
            const pasaBusqueda =
                q.length === 0 || c.nombre.toLowerCase().includes(q) || c.telefono.toLowerCase().includes(q)
            return pasaCategoria && pasaBusqueda
        })
    }, [conversaciones, filtro, busqueda])

    useEffect(() => {
        if (seleccionadaId === null && conversacionesFiltradas.length > 0) {
            setSeleccionadaId(conversacionesFiltradas[0].id)
        }
    }, [conversacionesFiltradas, seleccionadaId])

    const seleccionada: ConversacionVivo | undefined =
        conversaciones.find((c) => c.id === seleccionadaId) ?? conversacionesFiltradas[0]

    useEffect(() => {
        if (!seleccionada || hilos[seleccionada.id]) return
        setFalloHilo(null)
        arrancarCargaHilo(async () => {
            try {
                const mensajes = await obtenerHiloChatVivo(seleccionada.id)
                setHilos((prev) => ({ ...prev, [seleccionada.id]: mensajes }))
            } catch (e) {
                setFalloHilo(e instanceof Error ? e.message : "No se pudo leer el hilo de la conversación")
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seleccionada?.id])

    const chips: { valor: Categoria | "todas"; texto: string }[] = [
        { valor: "todas", texto: "Todas" },
        { valor: "tecnica", texto: "Técnica" },
        { valor: "negocio", texto: "Negocio" },
        { valor: "precio", texto: "Precio" },
        { valor: "sin_match", texto: "Sin resolver" },
        { valor: "sin_etiqueta", texto: "Sin etiqueta" },
    ]

    const hiloActual = seleccionada ? hilos[seleccionada.id] : undefined

    return (
        <div className="h-screen w-full overflow-hidden flex flex-col bg-[#f0f2f5]">
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-white shrink-0">
                <Link href="/admin/chatwoot" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-semibold text-gray-800">Chats en vivo</h1>
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            En vivo
                        </span>
                    </div>
                    <p className="text-xs text-gray-500">
                        {fallo
                            ? fallo
                            : panel
                              ? `${conversaciones.length} conversaciones · actualizado ${new Date(panel.actualizadoEn).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}`
                              : "Cargando…"}
                    </p>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {PERIODOS.map((p) => (
                        <button
                            key={p.valor}
                            onClick={() => cambiarPeriodo(p.valor)}
                            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                                periodoDias === p.valor ? "bg-white shadow-sm text-gray-800 font-medium" : "text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {p.texto}
                        </button>
                    ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => sincronizar(periodoDias)} disabled={cargandoLista} title="Sincronizar con Chatwoot">
                    {cargandoLista ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Columna izquierda: lista de conversaciones */}
                <div className="w-[440px] shrink-0 border-r bg-white flex flex-col min-h-0">
                    <div className="px-4 py-3 bg-[#f0f2f5] shrink-0">
                        <span className="font-semibold text-[#111b25] text-base">Conversaciones</span>
                    </div>

                    <div className="px-3 py-2 shrink-0">
                        <div className="flex items-center gap-2 bg-[#f0f2f5] rounded-lg px-3 py-1.5">
                            <Search className="h-4 w-4 text-[#54656f]" />
                            <input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar por nombre o teléfono"
                                className="bg-transparent outline-none text-sm w-full text-[#111b25] placeholder:text-[#667781]"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 px-3 pb-2 overflow-x-auto shrink-0">
                        {chips.map((chip) => (
                            <button
                                key={chip.valor}
                                onClick={() => setFiltro(chip.valor)}
                                className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${
                                    filtro === chip.valor
                                        ? "bg-[#00a884] text-white border-[#00a884]"
                                        : "bg-white text-[#54656f] border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                                {chip.texto}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {fallo && conversaciones.length === 0 && (
                            <p className="text-sm text-red-500 text-center mt-8 px-4">{fallo}</p>
                        )}
                        {!fallo && conversacionesFiltradas.length === 0 && (
                            <p className="text-sm text-gray-400 text-center mt-8">
                                {cargandoLista ? "Cargando conversaciones…" : "Ninguna conversación con este filtro"}
                            </p>
                        )}
                        {conversacionesFiltradas.map((c) => {
                            const cat = CATEGORIA_INFO[c.categoria]
                            const activa = c.id === seleccionada?.id
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => setSeleccionadaId(c.id)}
                                    className={`w-full flex items-start gap-4 px-4 py-4 border-b border-gray-100 text-left transition-colors ${
                                        activa ? "bg-[#f0f2f5]" : "bg-white hover:bg-[#f5f6f6]"
                                    }`}
                                >
                                    <div
                                        className={`h-16 w-16 rounded-full ${c.colorAvatar} text-white flex items-center justify-center font-semibold text-lg shrink-0`}
                                    >
                                        {c.iniciales}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-[#111b25] text-base truncate">{c.nombre}</span>
                                            <span className="text-xs text-[#667781] shrink-0">{c.horaEtiqueta}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-sm text-[#667781] truncate">
                                                {c.ultimoMensajePropio ? "Vos: " : ""}
                                                {c.ultimoMensaje}
                                            </span>
                                            {c.noLeidos > 0 && (
                                                <span className="bg-[#25d366] text-white text-xs font-semibold rounded-full h-6 min-w-6 px-1.5 flex items-center justify-center shrink-0">
                                                    {c.noLeidos}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border ${cat.clase}`}>
                                            {cat.texto}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Columna derecha: hilo de la conversación seleccionada */}
                <div className="flex-1 flex flex-col min-h-0">
                    {seleccionada ? (
                        <>
                            <div className="flex items-center justify-between px-4 py-2.5 bg-[#f0f2f5] border-b shrink-0">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`h-10 w-10 rounded-full ${seleccionada.colorAvatar} text-white flex items-center justify-center font-semibold text-sm`}
                                    >
                                        {seleccionada.iniciales}
                                    </div>
                                    <div>
                                        <p className="font-medium text-[#111b25] text-sm">{seleccionada.nombre}</p>
                                        <p className="text-xs text-[#667781]">{seleccionada.telefono}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CATEGORIA_INFO[seleccionada.categoria].clase}`}>
                                        {CATEGORIA_INFO[seleccionada.categoria].texto}
                                    </span>
                                </div>
                                <a
                                    href={`${chatwootUrl}/app/accounts/1/conversations/${seleccionada.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-[#00a884] font-medium hover:underline"
                                >
                                    Ver en Chatwoot <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1" style={fondoChat}>
                                {cargandoHilo && !hiloActual && (
                                    <div className="flex items-center justify-center h-full text-[#667781] text-sm gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando conversación…
                                    </div>
                                )}
                                {falloHilo && !hiloActual && (
                                    <p className="text-sm text-red-500 text-center mt-8">{falloHilo}</p>
                                )}
                                {hiloActual?.length === 0 && (
                                    <p className="text-sm text-[#667781] text-center mt-8">Sin mensajes de texto en esta conversación</p>
                                )}
                                {hiloActual?.map((m) =>
                                    m.privado ? (
                                        <div key={m.id} className="flex justify-center py-1">
                                            <div className="max-w-[75%] rounded-md px-3 py-1.5 bg-[#fff3cd] text-[#664d03] text-xs shadow-sm">
                                                <p className="whitespace-pre-wrap">{m.contenido}</p>
                                                <span className="block text-right text-[10px] opacity-70 mt-0.5">
                                                    Nota interna · {horaMensaje(m.creadoEn)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div key={m.id} className={`flex ${m.saliente ? "justify-end" : "justify-start"}`}>
                                            <div
                                                className={`max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm text-sm text-[#111b25] ${
                                                    m.saliente ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
                                                }`}
                                            >
                                                <p className="whitespace-pre-wrap">{m.contenido}</p>
                                                <span className="block text-right text-[10px] text-[#667781] mt-0.5">
                                                    {horaMensaje(m.creadoEn)}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="px-4 py-3 bg-[#f0f2f5] border-t shrink-0">
                                <p className="text-xs text-[#667781] text-center">
                                    Solo lectura por ahora — esto es un panel para mirar la cola filtrada, no para responder desde acá.
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                            {fallo ? fallo : "Seleccioná una conversación"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
