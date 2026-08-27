"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, Bot, BotOff, Camera, ExternalLink, FileText, Film, Loader2, Mic, RefreshCw, Search, Send, Smile } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    cambiarEstadoBotChatVivo,
    enviarMensajeChatVivo,
    forzarSincronizacionChatsVivo,
    marcarConversacionComoLeida,
    obtenerChatsVivo,
    obtenerHiloChatVivo,
    sincronizarChatsVivoLigero,
    type MensajeConversacion,
    type PanelChatsVivo,
} from "@/app/actions/chats-vivo"
import type { Categoria, ConversacionVivo } from "@/lib/chatwoot-chats-vivo"
import { CheckEstadoMensaje, ImageLightboxModal, MensajeAdjuntos } from "@/components/chatwoot/chat-media-viewer"

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

const EMOJIS_FRECUENTES = [
    "👍", "👋", "😊", "🙏", "🏍️", "🛵", "🛠️", "📦", "📍", "💰", "✅", "🚀", "📲", "⏳", "⭐", "🙌"
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
 * Agrega un mensaje recibido evitando duplicaciones con mensajes existentes o mensajes optimistas recientes,
 * actualizando el estado de entrega/lectura en tiempo real si cambió.
 */
function fusionarMensajeEnHilo(
    mensajes: MensajeConversacion[],
    nuevo: MensajeConversacion
): MensajeConversacion[] {
    // 1. Si ya existe un mensaje con el mismo id exacto, actualizar su status si cambió (ej: sent -> delivered -> read)
    const idxExistente = mensajes.findIndex((m) => m.id === nuevo.id)
    if (idxExistente >= 0) {
        if (mensajes[idxExistente].status !== nuevo.status) {
            const copia = [...mensajes]
            copia[idxExistente] = { ...copia[idxExistente], status: nuevo.status }
            return copia
        }
        return mensajes
    }

    // 2. Si coincide en contenido, privacidad y dirección con un mensaje reciente (< 60s),
    // es la confirmación oficial del mensaje optimista: reemplazamos el optimista por el definitivo.
    const nuevoEpoch = new Date(nuevo.creadoEn).getTime() || Date.now()
    const idxOptimista = mensajes.findIndex((m) => {
        if (m.privado !== nuevo.privado || m.saliente !== nuevo.saliente) return false
        if (m.contenido.trim().toLowerCase() !== nuevo.contenido.trim().toLowerCase()) return false
        const mEpoch = new Date(m.creadoEn).getTime() || Date.now()
        return Math.abs(nuevoEpoch - mEpoch) < 60000
    })

    if (idxOptimista >= 0) {
        const copia = [...mensajes]
        copia[idxOptimista] = nuevo
        return copia
    }

    return [...mensajes, nuevo]
}

/**
 * Fusiona dos listas de mensajes (actual local y nueva del servidor) preservando
 * mensajes optimistas en progreso y actualizaciones de status en tiempo real sin
 * que desaparezcan mensajes que acaban de entrar.
 */
function fusionarHilosMensajes(
    actuales: MensajeConversacion[] = [],
    nuevos: MensajeConversacion[] = []
): MensajeConversacion[] {
    if (!actuales || actuales.length === 0) return nuevos
    if (!nuevos || nuevos.length === 0) return actuales

    const mapa = new Map<number, MensajeConversacion>()

    // 1. Cargar mensajes actuales (incluye optimistas o mensajes SSE)
    for (const m of actuales) {
        mapa.set(m.id, m)
    }

    // 2. Incorporar mensajes nuevos del servidor
    for (const n of nuevos) {
        const nEpoch = new Date(n.creadoEn).getTime() || Date.now()
        for (const [id, m] of mapa.entries()) {
            if (m.privado === n.privado && m.saliente === n.saliente) {
                if (m.contenido.trim().toLowerCase() === n.contenido.trim().toLowerCase()) {
                    const mEpoch = new Date(m.creadoEn).getTime() || Date.now()
                    if (Math.abs(nEpoch - mEpoch) < 60000 && id !== n.id) {
                        mapa.delete(id)
                    }
                }
            }
        }
        mapa.set(n.id, n)
    }

    // 3. Eliminar optimistas viejos (> 90s)
    const ahora = Date.now()
    for (const [id, m] of mapa.entries()) {
        if (m.status === "progress") {
            const mEpoch = new Date(m.creadoEn).getTime() || 0
            if (ahora - mEpoch > 90000) {
                mapa.delete(id)
            }
        }
    }

    return Array.from(mapa.values()).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
}

/**
 * Fusiona listas de conversaciones. El servidor (tabla espejo en PostgreSQL, que
 * el webhook de Chatwoot + la sincronización cada 3.5s mantienen al día) es la
 * fuente de verdad: toda conversación que el servidor devuelve gana tal cual.
 *
 * Lo único que se conserva del estado local es una conversación que el servidor
 * todavía NO conoce (chat nuevo que acaba de entrar por SSE y el espejo aún no
 * sincronizó). Antes se preservaban los campos volátiles locales
 * (no leídos, último mensaje, bot) cuando el timestamp local era más nuevo, pero
 * SSE y los envíos optimistas sellan `ultimaActividad` con el reloj del cliente
 * (más fino que el `last_activity_at` de Chatwoot, en segundos), así que una vez
 * tocada, la fila quedaba congelada con datos viejos y ni el botón Sincronizar
 * la podía corregir.
 */
function fusionarListaConversaciones(
    actuales: ConversacionVivo[] = [],
    nuevas: ConversacionVivo[] = []
): ConversacionVivo[] {
    if (!actuales || actuales.length === 0) return nuevas
    if (!nuevas || nuevas.length === 0) return actuales

    const mapa = new Map<number, ConversacionVivo>()

    for (const n of nuevas) {
        mapa.set(n.id, n)
    }

    for (const act of actuales) {
        if (!mapa.has(act.id)) {
            mapa.set(act.id, act)
        }
    }

    return Array.from(mapa.values()).sort(
        (a, b) => new Date(b.ultimaActividad).getTime() - new Date(a.ultimaActividad).getTime()
    )
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

    const [lightboxImg, setLightboxImg] = useState<{ url: string; nombre?: string | null } | null>(null)

    const [textoMensaje, setTextoMensaje] = useState("")
    const [enviandoMensaje, setEnviandoMensaje] = useState(false)
    const [mostrarEmojis, setMostrarEmojis] = useState(false)
    const mensajesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const emojiPickerRef = useRef<HTMLDivElement>(null)

    // Cerrar el selector de emojis al hacer clic afuera
    useEffect(() => {
        const handleClickAfuera = (e: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
                setMostrarEmojis(false)
            }
        }
        if (mostrarEmojis) {
            document.addEventListener("mousedown", handleClickAfuera)
        }
        return () => {
            document.removeEventListener("mousedown", handleClickAfuera)
        }
    }, [mostrarEmojis])

    const insertarEmoji = (emoji: string) => {
        if (!textareaRef.current) {
            setTextoMensaje((prev) => prev + emoji)
            return
        }
        const textarea = textareaRef.current
        const inicio = textarea.selectionStart ?? textoMensaje.length
        const fin = textarea.selectionEnd ?? textoMensaje.length
        const nuevoTexto = textoMensaje.slice(0, inicio) + emoji + textoMensaje.slice(fin)
        setTextoMensaje(nuevoTexto)

        // Reposicionar el cursor inmediatamente después del emoji
        setTimeout(() => {
            textarea.focus()
            const nuevaPos = inicio + emoji.length
            textarea.setSelectionRange(nuevaPos, nuevaPos)
        }, 0)
    }

    const conversaciones = panel?.conversaciones ?? []

    const refrescar = (dias: number) => {
        arrancarCargaLista(async () => {
            try {
                const nuevo = await obtenerChatsVivo(dias)
                setPanel((prev) => {
                    if (!prev) return nuevo
                    return {
                        ...nuevo,
                        conversaciones: fusionarListaConversaciones(prev.conversaciones, nuevo.conversaciones),
                    }
                })
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
                setPanel((prev) => {
                    if (!prev) return nuevo
                    return {
                        ...nuevo,
                        conversaciones: fusionarListaConversaciones(prev.conversaciones, nuevo.conversaciones),
                    }
                })
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
        if (seleccionadaId) {
            const timer = setTimeout(() => {
                textareaRef.current?.focus()
            }, 60)
            return () => clearTimeout(timer)
        }
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

                    // 1. Si llegó un mensaje nuevo, agregarlo o actualizar su status en el hilo sin borrar existentes
                    if (data.mensaje) {
                        setHilos((prev) => {
                            const actual = prev[convId] || []
                            const actualizados = fusionarMensajeEnHilo(actual, data.mensaje)
                            if (actualizados === actual) return prev
                            return {
                                ...prev,
                                [convId]: actualizados,
                            }
                        })

                        // Si es la conversación activa, marcar leída
                        if (convId === seleccionadaId) {
                            marcarLeido(convId)
                        }
                    }

                    // 2. Actualizar lista de conversaciones inmediatamente (mover al tope si hay nuevo mensaje)
                    setPanel((prev) => {
                        if (!prev) return prev
                        const idx = prev.conversaciones.findIndex((c) => c.id === convId)
                        const texto = data.mensaje?.contenido || data.conversacion?.ultimoMensaje || ""
                        const esPropio = Boolean(data.mensaje?.saliente)
                        const esActiva = convId === seleccionadaId

                        let lista: ConversacionVivo[]
                        if (idx >= 0) {
                            const item = prev.conversaciones[idx]
                            const actualizada: ConversacionVivo = {
                                ...item,
                                ultimoMensaje: texto || item.ultimoMensaje,
                                ultimoMensajePropio: esPropio,
                                ultimaActividad: new Date().toISOString(),
                                horaEtiqueta: "ahora",
                                noLeidos: esActiva ? 0 : (esPropio ? item.noLeidos : item.noLeidos + 1),
                                botPausado: typeof data.botPausado === "boolean" ? data.botPausado : item.botPausado,
                            }
                            lista = [actualizada, ...prev.conversaciones.slice(0, idx), ...prev.conversaciones.slice(idx + 1)]
                        } else if (data.conversacion) {
                            const nueva: ConversacionVivo = {
                                id: convId,
                                nombre: data.conversacion.nombre,
                                telefono: data.conversacion.telefono,
                                iniciales: data.conversacion.nombre.slice(0, 2).toUpperCase(),
                                colorAvatar: "bg-emerald-500",
                                categoria: "sin_etiqueta",
                                status: "open",
                                ultimoMensaje: texto || "(nuevo chat)",
                                ultimoMensajePropio: esPropio,
                                horaEtiqueta: "ahora",
                                ultimaActividad: new Date().toISOString(),
                                noLeidos: esActiva ? 0 : 1,
                                botPausado: Boolean(data.botPausado),
                            }
                            lista = [nueva, ...prev.conversaciones]
                        } else {
                            lista = prev.conversaciones
                        }

                        return {
                            ...prev,
                            conversaciones: lista,
                        }
                    })
                } catch {
                    // ignorar parse error
                }
            }

            es.onerror = () => {
                // EventSource intentará reconectar automáticamente
            }
        } catch (e) {
            console.error("Error conectando a stream SSE de chatwoot:", e)
        }

        return () => {
            if (es) es.close()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodoDias, seleccionadaId])

    // Sincronización automática silenciosa en segundo plano (cada 3.5s y al retomar el foco)
    useEffect(() => {
        let cancelado = false

        const sincronizarSilencioso = async () => {
            if (typeof document !== "undefined" && document.hidden) return
            try {
                const nuevo = await sincronizarChatsVivoLigero(periodoDias)
                if (!cancelado && nuevo) {
                    setPanel((prev) => {
                        if (!prev) return nuevo
                        return {
                            ...nuevo,
                            conversaciones: fusionarListaConversaciones(prev.conversaciones, nuevo.conversaciones),
                        }
                    })
                    setFallo(null)
                }
                if (seleccionadaId && !cancelado) {
                    const mensajesNuevos = await obtenerHiloChatVivo(seleccionadaId)
                    if (!cancelado && mensajesNuevos) {
                        setHilos((prev) => {
                            const actual = prev[seleccionadaId] || []
                            const fusionados = fusionarHilosMensajes(actual, mensajesNuevos)
                            return {
                                ...prev,
                                [seleccionadaId]: fusionados,
                            }
                        })
                    }
                }
            } catch {
                // Silencioso en segundo plano
            }
        }

        const interval = setInterval(sincronizarSilencioso, 3500)

        const onFocus = () => {
            if (typeof document !== "undefined" && !document.hidden) {
                sincronizarSilencioso()
            }
        }

        window.addEventListener("focus", onFocus)
        document.addEventListener("visibilitychange", onFocus)

        return () => {
            cancelado = true
            clearInterval(interval)
            window.removeEventListener("focus", onFocus)
            document.removeEventListener("visibilitychange", onFocus)
        }
    }, [periodoDias, seleccionadaId])

    const conversacionesFiltradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase()
        return conversaciones.filter((c) => {
            const pasaCategoria = filtro === "todas" || c.categoria === filtro
            const pasaBusqueda =
                q.length === 0 || c.nombre.toLowerCase().includes(q) || c.telefono.toLowerCase().includes(q)
            return pasaCategoria && pasaBusqueda
        })
    }, [conversaciones, filtro, busqueda])

    const marcarLeido = (id: number) => {
        // 1. Limpiar optimísticamente en el listado local
        setPanel((prev) => {
            if (!prev) return prev
            const conv = prev.conversaciones.find((c) => c.id === id)
            if (!conv || conv.noLeidos === 0) return prev
            return {
                ...prev,
                conversaciones: prev.conversaciones.map((c) =>
                    c.id === id ? { ...c, noLeidos: 0 } : c
                ),
            }
        })
        // 2. Persistir en Chatwoot y tabla espejo en segundo plano
        marcarConversacionComoLeida(id).catch((err) => {
            console.error("Error marcando conversación como leída:", err)
        })
    }

    const seleccionarConversacion = (id: number) => {
        setSeleccionadaId(id)
        marcarLeido(id)
    }

    useEffect(() => {
        if (seleccionadaId === null && conversacionesFiltradas.length > 0) {
            const primerId = conversacionesFiltradas[0].id
            setSeleccionadaId(primerId)
            marcarLeido(primerId)
        }
    }, [conversacionesFiltradas, seleccionadaId])

    const seleccionada: ConversacionVivo | undefined =
        conversaciones.find((c) => c.id === seleccionadaId) ??
        (seleccionadaId === null ? conversacionesFiltradas[0] : undefined)

    useEffect(() => {
        if (seleccionadaId) {
            const conv = conversaciones.find((c) => c.id === seleccionadaId)
            if (conv && conv.noLeidos > 0) {
                marcarLeido(seleccionadaId)
            }
        }
    }, [seleccionadaId, conversaciones])

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
            status: "progress",
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
                                    onClick={() => seleccionarConversacion(c.id)}
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
                                            <span className="text-xs text-[#667781] truncate flex items-center gap-1">
                                                {c.ultimoMensajePropio ? "Vos: " : ""}
                                                {c.ultimoMensaje.startsWith("📷") ? (
                                                    <>
                                                        <Camera className="h-3 w-3 inline text-emerald-600 shrink-0" />
                                                        <span>Foto</span>
                                                    </>
                                                ) : c.ultimoMensaje.startsWith("🎤") || c.ultimoMensaje.startsWith("🎵") ? (
                                                    <>
                                                        <Mic className="h-3 w-3 inline text-emerald-600 shrink-0" />
                                                        <span>Audio</span>
                                                    </>
                                                ) : c.ultimoMensaje.startsWith("🎥") ? (
                                                    <>
                                                        <Film className="h-3 w-3 inline text-emerald-600 shrink-0" />
                                                        <span>Video</span>
                                                    </>
                                                ) : c.ultimoMensaje.startsWith("📎") ? (
                                                    <>
                                                        <FileText className="h-3 w-3 inline text-emerald-600 shrink-0" />
                                                        <span>Archivo</span>
                                                    </>
                                                ) : (
                                                    c.ultimoMensaje
                                                )}
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
                                    <p className="text-xs text-[#667781] text-center mt-6">Sin mensajes en esta conversación</p>
                                )}
                                {hiloActual
                                    ?.filter((m) => {
                                        const txt = m.contenido.trim().toLowerCase()
                                        return !(m.privado && (txt === "/bot on" || txt === "/bot off"))
                                    })
                                    .map((m) =>
                                        m.privado ? (
                                            <div key={m.id} className="flex justify-center py-1">
                                                <div className="max-w-[85%] rounded-md px-3 py-1.5 bg-[#fff3cd] text-[#664d03] text-xs border border-amber-200/90 shadow-sm">
                                                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-800/80 mb-0.5">
                                                        <span>🔒 Nota interna{m.remitente && m.remitente !== "Nosotros" ? ` (${m.remitente})` : ""}</span>
                                                    </div>
                                                    <MensajeAdjuntos
                                                        adjuntos={m.adjuntos}
                                                        saliente={false}
                                                        onOpenLightbox={(url, nombre) => setLightboxImg({ url, nombre })}
                                                    />
                                                    {m.contenido && <p className="whitespace-pre-wrap">{m.contenido}</p>}
                                                    <span className="block text-right text-[9px] opacity-70 mt-1">
                                                        {horaMensaje(m.creadoEn)}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={m.id} className={`flex ${m.saliente ? "justify-end" : "justify-start"}`}>
                                                <div
                                                    className={`max-w-[75%] sm:max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm text-xs md:text-sm text-[#111b25] ${
                                                        m.saliente ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
                                                    }`}
                                                >
                                                    <MensajeAdjuntos
                                                        adjuntos={m.adjuntos}
                                                        saliente={m.saliente}
                                                        onOpenLightbox={(url, nombre) => setLightboxImg({ url, nombre })}
                                                    />
                                                    {m.contenido && <p className="whitespace-pre-wrap">{m.contenido}</p>}
                                                    <div className="flex items-center justify-end gap-1 mt-0.5 select-none">
                                                        <span className="text-[10px] text-[#667781] leading-none">
                                                            {horaMensaje(m.creadoEn)}
                                                        </span>
                                                        {m.saliente && (
                                                            <CheckEstadoMensaje status={m.status || "sent"} />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                <div ref={mensajesEndRef} />
                            </div>

                            {/* Barra para escribir y responder manualmente (4 renglones) */}
                            <div className="px-3.5 py-2.5 bg-[#f0f2f5] border-t shrink-0 relative">
                                {/* Popover de Emojis frecuentes */}
                                {mostrarEmojis && (
                                    <div
                                        ref={emojiPickerRef}
                                        className="absolute bottom-full right-4 mb-2 bg-white rounded-2xl shadow-xl border border-gray-200 p-2.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
                                        style={{ width: "284px" }}
                                    >
                                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b px-1">
                                            <span className="text-[11px] font-semibold text-gray-700">Emojis frecuentes</span>
                                            <span className="text-[10px] text-gray-400">Clic para insertar</span>
                                        </div>
                                        <div className="grid grid-cols-8 gap-1">
                                            {EMOJIS_FRECUENTES.map((emoji) => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => insertarEmoji(emoji)}
                                                    className="h-8 w-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 active:scale-95 transition-all select-none"
                                                    title={emoji}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={handleEnviarMensaje} className="flex items-end gap-2">
                                    <div className="flex-1 bg-white rounded-xl px-3.5 py-2 border border-gray-200 focus-within:border-[#00a884] focus-within:ring-1 focus-within:ring-[#00a884] shadow-sm transition-all">
                                        <textarea
                                            ref={textareaRef}
                                            value={textoMensaje}
                                            onChange={(e) => setTextoMensaje(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Escribe un mensaje para responder al cliente... (Enter para enviar, Shift+Enter para nueva línea)"
                                            rows={4}
                                            className="w-full resize-none bg-transparent outline-none text-xs md:text-sm text-[#111b25] placeholder:text-[#8696a0] min-h-[76px] max-h-44 block leading-relaxed"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5 shrink-0 mb-0.5">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setMostrarEmojis((v) => !v)}
                                            className={`h-9 w-9 p-0 rounded-xl border-gray-200 transition-colors shadow-sm ${
                                                mostrarEmojis ? "bg-amber-50 border-amber-300 text-amber-600" : "bg-white text-gray-500 hover:text-amber-600 hover:bg-amber-50"
                                            }`}
                                            title="Emojis frecuentes"
                                        >
                                            <Smile className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={!textoMensaje.trim() || enviandoMensaje}
                                            className="h-9 w-9 p-0 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white disabled:opacity-40 transition-colors shadow-sm"
                                            title="Enviar mensaje (Enter)"
                                        >
                                            {enviandoMensaje ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Send className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
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

            {/* Modal Lightbox para visualización de fotos en pantalla completa */}
            <ImageLightboxModal
                isOpen={Boolean(lightboxImg)}
                imageUrl={lightboxImg?.url || null}
                imageName={lightboxImg?.nombre}
                onClose={() => setLightboxImg(null)}
            />
        </div>
    )
}

