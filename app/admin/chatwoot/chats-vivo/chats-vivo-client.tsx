"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, Bot, BotOff, ExternalLink, Loader2, RefreshCw, Search, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    cambiarEstadoBotChatVivo,
    enviarMensajeChatVivo,
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
// Permite pausar/reactivar el bot por conversación (/bot off y /bot on) con un switch
// y responder mensajes manualmente en texto hacia WhatsApp a través de Chatwoot.

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

/**
 * Agrega un mensaje recibido evitando duplicaciones con mensajes existentes o mensajes optimistas recientes.
 */
function fusionarMensajeEnHilo(
    mensajes: MensajeConversacion[],
    nuevo: MensajeConversacion
): MensajeConversacion[] {
    // 1. Si ya existe un mensaje con el mismo id exacto, ignorar
    if (mensajes.some((m) => m.id === nuevo.id)) {
        return mensajes
    }

    // 2. Si coincide en contenido, privacidad y dirección con un mensaje reciente (< 30s),
    // es la confirmación oficial del mensaje optimista: reemplazamos el optimista por el definitivo.
    const nuevoEpoch = new Date(nuevo.creadoEn).getTime() || Date.now()
    const idxOptimista = mensajes.findIndex((m) => {
        if (m.privado !== nuevo.privado || m.saliente !== nuevo.saliente) return false
        if (m.contenido.trim().toLowerCase() !== nuevo.contenido.trim().toLowerCase()) return false
        const mEpoch = new Date(m.creadoEn).getTime() || Date.now()
        return Math.abs(nuevoEpoch - mEpoch) < 30000
    })

    if (idxOptimista >= 0) {
        const copia = [...mensajes]
        copia[idxOptimista] = nuevo
        return copia
    }

    return [...mensajes, nuevo]
}

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

    const [togglingBot, setTogglingBot] = useState<number | null>(null)

    const [textoMensaje, setTextoMensaje] = useState("")
    const [enviandoMensaje, setEnviandoMensaje] = useState(false)
    const mensajesEndRef = useRef<HTMLDivElement>(null)

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

    // Auto-scroll al final del chat cuando se selecciona una conversación o llegan mensajes
    const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
        mensajesEndRef.current?.scrollIntoView({ behavior })
    }

    useEffect(() => {
        scrollToBottom("auto")
    }, [seleccionadaId])

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

                    // Si llegó un mensaje nuevo y tenemos esa conversación en memoria,
                    // lo fusionamos sin duplicar
                    if (data.mensaje) {
                        setHilos((prev) => {
                            const actual = prev[convId]
                            if (!actual) return prev
                            const actualizados = fusionarMensajeEnHilo(actual, data.mensaje)
                            if (actualizados === actual) return prev
                            return {
                                ...prev,
                                [convId]: actualizados,
                            }
                        })
                    }

                    // Si vino actualización de botPausado, reflejarla en la lista
                    if (typeof data.botPausado === "boolean") {
                        setPanel((prev) => {
                            if (!prev) return prev
                            return {
                                ...prev,
                                conversaciones: prev.conversaciones.map((c) =>
                                    c.id === convId ? { ...c, botPausado: data.botPausado } : c
                                ),
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

    useEffect(() => {
        if (hiloActual && hiloActual.length > 0) {
            scrollToBottom("smooth")
        }
    }, [hiloActual?.length])

    const handleToggleBot = async (conversationId: number, currentBotPausado: boolean) => {
        const nuevoEncendido = currentBotPausado // si estaba pausado (true), lo prendemos (true); si no, lo apagamos (false)
        const nuevoPausado = !nuevoEncendido

        // Actualización optimista del estado local en panel.conversaciones
        setPanel((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                conversaciones: prev.conversaciones.map((c) =>
                    c.id === conversationId ? { ...c, botPausado: nuevoPausado } : c
                ),
            }
        })

        setTogglingBot(conversationId)
        try {
            const res = await cambiarEstadoBotChatVivo(conversationId, nuevoEncendido)
            if (!res.success) {
                throw new Error("No se pudo cambiar el estado del bot")
            }
        } catch (err) {
            console.error("Error cambiando estado del bot:", err)
            // Revertir estado optimista en caso de falla
            setPanel((prev) => {
                if (!prev) return prev
                return {
                    ...prev,
                    conversaciones: prev.conversaciones.map((c) =>
                        c.id === conversationId ? { ...c, botPausado: currentBotPausado } : c
                    ),
                }
            })
            alert("Error al cambiar estado del bot: " + (err instanceof Error ? err.message : "Error desconocido"))
        } finally {
            setTogglingBot(null)
        }
    }

    const handleEnviarMensaje = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!seleccionada) return
        const contenido = textoMensaje.trim()
        if (!contenido || enviandoMensaje) return

        const convId = seleccionada.id
        setTextoMensaje("")

        const tempId = Date.now()
        const mensajeOptimista: MensajeConversacion = {
            id: tempId,
            contenido,
            privado: false,
            saliente: true,
            remitente: "Nosotros",
            creadoEn: new Date().toISOString(),
        }

        // 1. Agregar de inmediato al hilo (optimista)
        setHilos((prev) => {
            const actual = prev[convId] || []
            return {
                ...prev,
                [convId]: [...actual, mensajeOptimista],
            }
        })

        // 2. Actualizar lista de conversaciones (último mensaje y bot pausado)
        setPanel((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                conversaciones: prev.conversaciones.map((c) =>
                    c.id === convId
                        ? {
                              ...c,
                              ultimoMensaje: contenido,
                              ultimoMensajePropio: true,
                              botPausado: true,
                          }
                        : c
                ),
            }
        })

        setEnviandoMensaje(true)
        try {
            const res = await enviarMensajeChatVivo(convId, contenido)
            if (!res.success) {
                throw new Error("No se pudo enviar el mensaje")
            }
            if (res.mensaje) {
                setHilos((prev) => {
                    const actual = prev[convId] || []
                    return {
                        ...prev,
                        [convId]: fusionarMensajeEnHilo(actual, res.mensaje),
                    }
                })
            }
        } catch (err) {
            console.error("Error enviando mensaje:", err)
            alert("Error al enviar mensaje: " + (err instanceof Error ? err.message : "Error desconocido"))
        } finally {
            setEnviandoMensaje(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleEnviarMensaje()
        }
    }

    return (
        <div className="h-screen w-full overflow-hidden flex flex-col bg-[#f0f2f5]">
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-white shrink-0 h-12">
                <Link href="/admin/chatwoot" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-semibold text-gray-800">Chats en vivo</h1>
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            En vivo
                        </span>
                    </div>
                    <p className="text-[11px] text-gray-500" suppressHydrationWarning>
                        {fallo
                            ? fallo
                            : panel
                              ? `${conversaciones.length} conversaciones · act. ${new Date(panel.actualizadoEn).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}`
                              : "Cargando…"}
                    </p>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {PERIODOS.map((p) => (
                        <button
                            key={p.valor}
                            onClick={() => cambiarPeriodo(p.valor)}
                            className={`text-xs px-2.5 py-0.5 rounded-md transition-colors ${
                                periodoDias === p.valor ? "bg-white shadow-sm text-gray-800 font-medium" : "text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {p.texto}
                        </button>
                    ))}
                </div>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => sincronizar(periodoDias)} disabled={cargandoLista} title="Sincronizar con Chatwoot">
                    {cargandoLista ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Columna izquierda: lista de conversaciones */}
                <div className="w-[360px] lg:w-[390px] shrink-0 border-r bg-white flex flex-col min-h-0">
                    <div className="px-3.5 py-2 bg-[#f0f2f5] shrink-0 flex items-center justify-between">
                        <span className="font-semibold text-[#111b25] text-sm">Conversaciones</span>
                        <span className="text-xs text-gray-500">{conversacionesFiltradas.length}</span>
                    </div>

                    <div className="px-3 py-1.5 shrink-0">
                        <div className="flex items-center gap-2 bg-[#f0f2f5] rounded-lg px-2.5 py-1">
                            <Search className="h-3.5 w-3.5 text-[#54656f]" />
                            <input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar nombre o teléfono"
                                className="bg-transparent outline-none text-xs w-full text-[#111b25] placeholder:text-[#667781]"
                            />
                        </div>
                    </div>

                    <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0 scrollbar-none">
                        {chips.map((chip) => (
                            <button
                                key={chip.valor}
                                onClick={() => setFiltro(chip.valor)}
                                className={`text-[11px] px-2.5 py-0.5 rounded-full border whitespace-nowrap transition-colors ${
                                    filtro === chip.valor
                                        ? "bg-[#00a884] text-white border-[#00a884]"
                                        : "bg-white text-[#54656f] border-gray-200 hover:bg-gray-50"
                                }`}
                            >
                                {chip.texto}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {fallo && conversaciones.length === 0 && (
                            <p className="text-xs text-red-500 text-center mt-6 px-4">{fallo}</p>
                        )}
                        {!fallo && conversacionesFiltradas.length === 0 && (
                            <p className="text-xs text-gray-400 text-center mt-6">
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
                                    className={`w-full flex items-start gap-3 px-3.5 py-2.5 border-b border-gray-100 text-left transition-colors ${
                                        activa ? "bg-[#f0f2f5]" : "bg-white hover:bg-[#f5f6f6]"
                                    }`}
                                >
                                    <div
                                        className={`h-11 w-11 rounded-full ${c.colorAvatar} text-white flex items-center justify-center font-semibold text-sm shrink-0`}
                                        suppressHydrationWarning
                                    >
                                        {c.iniciales}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="font-medium text-[#111b25] text-sm truncate">{c.nombre}</span>
                                            <span className="text-[11px] text-[#667781] shrink-0">{c.horaEtiqueta}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1 mt-0.5">
                                            <span className="text-xs text-[#667781] truncate">
                                                {c.ultimoMensajePropio ? "Vos: " : ""}
                                                {c.ultimoMensaje}
                                            </span>
                                            {c.noLeidos > 0 && (
                                                <span className="bg-[#25d366] text-white text-[10px] font-semibold rounded-full h-4 min-w-4 px-1 flex items-center justify-center shrink-0">
                                                    {c.noLeidos}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border ${cat.clase}`}>
                                                {cat.texto}
                                            </span>
                                            {c.botPausado ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                                    <BotOff className="h-2.5 w-2.5" />
                                                    Bot OFF
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                                    <Bot className="h-2.5 w-2.5 text-emerald-600" />
                                                    Bot ON
                                                </span>
                                            )}
                                        </div>
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
                            <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f5] border-b shrink-0 gap-3 min-h-[52px]">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                        className={`h-9 w-9 rounded-full ${seleccionada.colorAvatar} text-white flex items-center justify-center font-semibold text-xs shrink-0`}
                                        suppressHydrationWarning
                                    >
                                        {seleccionada.iniciales}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-[#111b25] text-sm truncate">{seleccionada.nombre}</p>
                                        <p className="text-[11px] text-[#667781] truncate">{seleccionada.telefono}</p>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${CATEGORIA_INFO[seleccionada.categoria].clase}`}>
                                        {CATEGORIA_INFO[seleccionada.categoria].texto}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2.5 shrink-0">
                                    {/* Switch ON/OFF del Bot para esta conversación */}
                                    <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border shadow-sm">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={!seleccionada.botPausado}
                                            disabled={togglingBot === seleccionada.id}
                                            onClick={() => handleToggleBot(seleccionada.id, seleccionada.botPausado)}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:ring-offset-1 ${
                                                !seleccionada.botPausado ? "bg-[#00a884]" : "bg-gray-300"
                                            } ${togglingBot === seleccionada.id ? "opacity-60 cursor-wait" : ""}`}
                                            title={
                                                !seleccionada.botPausado
                                                    ? "Hacé clic para pausar el Bot (/bot off)"
                                                    : "Hacé clic para reactivar el Bot (/bot on)"
                                            }
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                                    !seleccionada.botPausado ? "translate-x-4" : "translate-x-0"
                                                }`}
                                            />
                                        </button>
                                        <div className="flex items-center gap-1 min-w-[70px]">
                                            {togglingBot === seleccionada.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                                            ) : !seleccionada.botPausado ? (
                                                <Bot className="h-3 w-3 text-[#00a884]" />
                                            ) : (
                                                <BotOff className="h-3 w-3 text-gray-500" />
                                            )}
                                            <span
                                                className={`text-[11px] font-semibold ${
                                                    !seleccionada.botPausado ? "text-[#00a884]" : "text-gray-500"
                                                }`}
                                            >
                                                {!seleccionada.botPausado ? "Bot ON" : "Bot OFF"}
                                            </span>
                                        </div>
                                    </div>

                                    <a
                                        href={`${chatwootUrl}/app/accounts/1/conversations/${seleccionada.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-xs text-[#00a884] font-medium hover:underline"
                                    >
                                        Chatwoot <ExternalLink className="h-3 w-3" />
                                    </a>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5" style={fondoChat}>
                                {cargandoHilo && !hiloActual && (
                                    <div className="flex items-center justify-center h-full text-[#667781] text-xs gap-2">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando conversación…
                                    </div>
                                )}
                                {falloHilo && !hiloActual && (
                                    <p className="text-xs text-red-500 text-center mt-6">{falloHilo}</p>
                                )}
                                {hiloActual?.length === 0 && (
                                    <p className="text-xs text-[#667781] text-center mt-6">Sin mensajes de texto en esta conversación</p>
                                )}
                                {hiloActual
                                    ?.filter((m) => {
                                        const txt = m.contenido.trim().toLowerCase()
                                        return !(m.privado && (txt === "/bot on" || txt === "/bot off"))
                                    })
                                    .map((m) =>
                                        m.privado ? (
                                            <div key={m.id} className="flex justify-center py-0.5">
                                                <div className="max-w-[75%] rounded-md px-2.5 py-1 bg-[#fff3cd] text-[#664d03] text-xs shadow-sm">
                                                    <p className="whitespace-pre-wrap">{m.contenido}</p>
                                                    <span className="block text-right text-[9px] opacity-70 mt-0.5">
                                                        Nota interna · {horaMensaje(m.creadoEn)}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={m.id} className={`flex ${m.saliente ? "justify-end" : "justify-start"}`}>
                                                <div
                                                    className={`max-w-[65%] rounded-lg px-3 py-1 shadow-sm text-xs md:text-sm text-[#111b25] ${
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
                                <div ref={mensajesEndRef} />
                            </div>

                            {/* Barra para escribir y responder manualmente */}
                            <div className="px-3.5 py-2 bg-[#f0f2f5] border-t shrink-0">
                                <form onSubmit={handleEnviarMensaje} className="flex items-end gap-2">
                                    <div className="flex-1 bg-white rounded-lg px-3 py-1.5 border border-gray-200 focus-within:border-[#00a884] focus-within:ring-1 focus-within:ring-[#00a884] shadow-sm transition-all">
                                        <textarea
                                            value={textoMensaje}
                                            onChange={(e) => setTextoMensaje(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Escribe un mensaje para responder al cliente... (Enter para enviar)"
                                            rows={1}
                                            className="w-full resize-none bg-transparent outline-none text-xs md:text-sm text-[#111b25] placeholder:text-[#8696a0] max-h-32 min-h-[22px] block leading-relaxed"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={!textoMensaje.trim() || enviandoMensaje}
                                        className="h-8 w-8 p-0 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white shrink-0 disabled:opacity-40 transition-colors shadow-sm"
                                        title="Enviar mensaje (Enter)"
                                    >
                                        {enviandoMensaje ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Send className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                </form>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                            {fallo ? fallo : "Seleccioná una conversación"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

