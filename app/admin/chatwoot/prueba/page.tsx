"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bot, Send, Loader2, RefreshCw, Check, AlertCircle, Settings2, Smile, Paperclip, Copy, CheckCheck, Tag, StickyNote, Users, Power, Trash2 } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type ItemCliente = { id: string; kind: "cliente"; hora: string; mensaje: string; ok: boolean; detalle?: string }
type ItemBot = { id: string; kind: "bot"; hora: string; mensaje: string }
type ItemNota = { id: string; kind: "nota"; hora: string; mensaje: string }
type ItemLabel = { id: string; kind: "label"; hora: string; labels: string[] }
type ItemEquipo = { id: string; kind: "equipo"; hora: string; mensaje: string; ok: boolean; detalle?: string }
type TimelineItem = ItemCliente | ItemBot | ItemNota | ItemLabel | ItemEquipo

const ACCOUNT_ID = "1" // coincide con el "account.id" fijo que manda /api/chatwoot/prueba-mensaje

const horaActual = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export default function PruebaMensajesPage() {
    // ESTADOS PARA "PRUEBA MENSAJES" (simular un mensaje entrante de WhatsApp hacia n8n)
    const generarConversationId = () => Math.floor(900000 + Math.random() * 99999)
    const [conversationId, setConversationId] = useState(generarConversationId())
    const [nombreContacto, setNombreContacto] = useState("Cliente Prueba")
    const [telefonoContacto, setTelefonoContacto] = useState("5493511234567")
    const [mensajePrueba, setMensajePrueba] = useState("")
    const [enviandoPrueba, setEnviandoPrueba] = useState(false)
    const [timeline, setTimeline] = useState<TimelineItem[]>([])
    const [mockUrlCopiada, setMockUrlCopiada] = useState(false)

    // ESTADOS PARA "RESPONDER COMO EQUIPO" (simular que un agente le contesta
    // la nota privada de escalado a la conversación)
    const [respuestaEquipo, setRespuestaEquipo] = useState("")
    const [enviandoRespuesta, setEnviandoRespuesta] = useState(false)
    const [reactivandoBot, setReactivandoBot] = useState(false)

    // ESTADOS PARA "BORRAR TODO EL HISTORIAL" (limpia todas las conversaciones
    // de prueba guardadas en el mock, no solo la actual)
    const [confirmBorrarTodoOpen, setConfirmBorrarTodoOpen] = useState(false)
    const [borrandoTodo, setBorrandoTodo] = useState(false)

    const chatRef = useRef<HTMLDivElement>(null)
    const settingsRef = useRef<HTMLDivElement>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const ultimoEventoIdRef = useRef(0)
    const mockBaseUrl = typeof window !== "undefined" ? `${window.location.origin}/api/chatwoot/mock` : "/api/chatwoot/mock"

    // Cada vez que se agrega un item, bajamos el scroll al final (como un chat real)
    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" })
    }, [timeline])

    // Cerrar el popover de configuración al hacer click afuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setSettingsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // POLLING: cada 2s consultamos qué fue posteando el workflow (respuesta al
    // cliente, nota privada de escalado, labels) para esta conversación, tal
    // como hacía la respuesta real de Chatwoot en el entorno local de pruebas.
    useEffect(() => {
        ultimoEventoIdRef.current = 0
        let cancelado = false

        const poll = async () => {
            try {
                const res = await fetch(
                    `/api/chatwoot/mock/accounts/${ACCOUNT_ID}/conversations/${conversationId}/events?after=${ultimoEventoIdRef.current}`
                )
                if (!res.ok || cancelado) return
                const data = await res.json()
                const eventos: Array<{ id: number; kind: string; content?: string; private?: boolean; labels?: string[] }> = data.events || []
                if (eventos.length === 0) return

                setTimeline((prev) => {
                    const nuevos: TimelineItem[] = eventos.map((e) => {
                        if (e.kind === "label") {
                            return { id: `evt-${e.id}`, kind: "label", hora: horaActual(), labels: e.labels || [] }
                        }
                        if (e.private) {
                            return { id: `evt-${e.id}`, kind: "nota", hora: horaActual(), mensaje: e.content || "" }
                        }
                        return { id: `evt-${e.id}`, kind: "bot", hora: horaActual(), mensaje: e.content || "" }
                    })
                    return [...prev, ...nuevos]
                })
                ultimoEventoIdRef.current = Math.max(ultimoEventoIdRef.current, ...eventos.map((e) => e.id))
            } catch {
                // errores de red en el polling no rompen la UI, se reintenta en el próximo tick
            }
        }

        poll()
        const interval = setInterval(poll, 2000)
        return () => {
            cancelado = true
            clearInterval(interval)
        }
    }, [conversationId])

    const iniciales = (nombreContacto || "?")
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()

    // ENVIAR MENSAJE DE PRUEBA AL WORKFLOW DE n8n (simula el webhook de Chatwoot)
    const handleEnviarPrueba = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!mensajePrueba || !telefonoContacto || enviandoPrueba) return

        setEnviandoPrueba(true)
        const mensajeEnviado = mensajePrueba
        const id = `cli-${Date.now()}`
        setMensajePrueba("")

        try {
            const respuesta = await fetch("/api/chatwoot/prueba-mensaje", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId,
                    telefono: telefonoContacto,
                    nombre: nombreContacto,
                    mensaje: mensajeEnviado,
                }),
            })

            const data = await respuesta.json().catch(() => ({}))

            setTimeline((prev) => [
                ...prev,
                { id, kind: "cliente", hora: horaActual(), mensaje: mensajeEnviado, ok: respuesta.ok, detalle: !respuesta.ok ? data?.error : undefined },
            ])
        } catch (error) {
            setTimeline((prev) => [
                ...prev,
                { id, kind: "cliente", hora: horaActual(), mensaje: mensajeEnviado, ok: false, detalle: "Error de conexión con el servidor" },
            ])
        } finally {
            setEnviandoPrueba(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleEnviarPrueba(e as unknown as React.FormEvent)
        }
    }

    // NUEVA CONVERSACIÓN: limpia el chat de la UI y borra lo que el mock de
    // Chatwoot tenía guardado para la conversación anterior.
    const handleNuevaConversacion = () => {
        const idAnterior = conversationId
        const nuevoId = generarConversationId()
        setConversationId(nuevoId)
        setTimeline([])
        fetch(`/api/chatwoot/mock/accounts/${ACCOUNT_ID}/conversations/${idAnterior}/events`, { method: "DELETE" }).catch(() => {})
    }

    // ENVIAR LA RESPUESTA DEL EQUIPO (simula que un agente escribe en la conversación:
    // sender_type "User" en vez de "Contact"). El workflow, al recibirlo, busca la
    // pregunta pendiente de esta conversación, extrae la respuesta, la guarda para
    // el futuro y le contesta al cliente — ese mensaje va a aparecer solo en el chat.
    const enviarComoEquipo = async (texto: string) => {
        const id = `equipo-${Date.now()}`
        try {
            const res = await fetch("/api/chatwoot/prueba-responder-equipo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId, respuesta: texto }),
            })
            const data = await res.json().catch(() => ({}))
            setTimeline((prev) => [
                ...prev,
                { id, kind: "equipo", hora: horaActual(), mensaje: texto, ok: res.ok, detalle: !res.ok ? data?.error : undefined },
            ])
        } catch {
            setTimeline((prev) => [
                ...prev,
                { id, kind: "equipo", hora: horaActual(), mensaje: texto, ok: false, detalle: "Error de conexión con el servidor" },
            ])
        }
    }

    const handleResponderEquipo = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!respuestaEquipo || enviandoRespuesta) return
        setEnviandoRespuesta(true)
        const texto = respuestaEquipo
        setRespuestaEquipo("")
        await enviarComoEquipo(texto)
        setEnviandoRespuesta(false)
    }

    const handleReactivarBot = async () => {
        if (reactivandoBot) return
        setReactivandoBot(true)
        await enviarComoEquipo("/bot on")
        setReactivandoBot(false)
    }

    // BORRAR TODO EL HISTORIAL: vacía el store del mock completo (todas las
    // conversaciones de prueba, no solo la actual) y arranca de cero acá.
    const handleBorrarTodoHistorial = async () => {
        setBorrandoTodo(true)
        try {
            await fetch("/api/chatwoot/mock/reset", { method: "DELETE" })
        } catch {
            // si falla la llamada igual limpiamos la UI; es solo un mock de pruebas
        } finally {
            setConversationId(generarConversationId())
            setTimeline([])
            setBorrandoTodo(false)
            setConfirmBorrarTodoOpen(false)
        }
    }

    const copiarMockUrl = () => {
        navigator.clipboard.writeText(mockBaseUrl).then(() => {
            setMockUrlCopiada(true)
            setTimeout(() => setMockUrlCopiada(false), 2000)
        })
    }

    const ultimoEsDelCliente = timeline.length > 0 && timeline[timeline.length - 1].kind === "cliente" && (timeline[timeline.length - 1] as ItemCliente).ok

    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Bot className="h-8 w-8 text-violet-600" />
                    Prueba de Mensajes
                </h1>
                <p className="text-gray-500">
                    Simulá un mensaje entrante de WhatsApp y envialo al workflow real de n8n, tal como lo haría Chatwoot.
                    Esta página también actúa como un Chatwoot de mentira: recibe acá mismo la respuesta del bot, las notas
                    privadas de escalado y las labels, para poder probar el workflow completo sin depender de Chatwoot real.
                </p>
            </div>

            {/* ---------------- URL DE CHATWOOT (MOCK) PARA CONFIGURAR EN n8n ---------------- */}
            <div className="mx-auto w-full max-w-xl rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
                <p className="font-semibold text-violet-900">Configuración necesaria en n8n (mientras probamos)</p>
                <p className="mt-1 text-violet-800">
                    En los nodos HTTP del workflow que hoy dicen <code className="rounded bg-white px-1 py-0.5">TU_INSTANCIA_CHATWOOT.com</code>,
                    reemplazá el dominio por esta URL base (el <code className="rounded bg-white px-1 py-0.5">api_access_token</code> puede ser cualquier texto, no se valida):
                </p>
                <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-violet-900 border border-violet-200">{mockBaseUrl}</code>
                    <Button type="button" size="icon" variant="outline" onClick={copiarMockUrl} title="Copiar URL">
                        {mockUrlCopiada ? <CheckCheck size={16} className="text-green-600" /> : <Copy size={16} />}
                    </Button>
                </div>
            </div>

            {/* ---------------- MOCKUP ESTILO WHATSAPP ---------------- */}
            <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border shadow-xl">

                {/* Encabezado tipo WhatsApp */}
                <div className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 font-semibold">
                            {iniciales}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate font-semibold leading-tight">{nombreContacto || "Cliente Prueba"}</p>
                            <p className="truncate text-xs text-white/75">+{telefonoContacto.replace("+", "")} · conv. #{conversationId}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <Popover ref={settingsRef}>
                            <PopoverTrigger
                                type="button"
                                onClick={() => setSettingsOpen((v) => !v)}
                                className="!h-9 !w-9 !p-0 !bg-transparent !shadow-none rounded-full text-white hover:!bg-white/15 hover:!text-white"
                            >
                                <Settings2 size={18} className="mx-auto" />
                            </PopoverTrigger>
                            {settingsOpen && (
                                <PopoverContent align="end" className="w-72 space-y-3 text-left">
                                    <div className="space-y-1">
                                        <Label htmlFor="nombreContacto" className="text-xs font-bold text-slate-500 uppercase">Nombre del contacto</Label>
                                        <Input id="nombreContacto" value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} disabled={enviandoPrueba} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="telefonoContacto" className="text-xs font-bold text-slate-500 uppercase">Teléfono (WhatsApp)</Label>
                                        <Input id="telefonoContacto" value={telefonoContacto} onChange={(e) => setTelefonoContacto(e.target.value)} disabled={enviandoPrueba} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="conversationId" className="text-xs font-bold text-slate-500 uppercase">ID de conversación</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="conversationId"
                                                type="number"
                                                value={conversationId}
                                                onChange={(e) => setConversationId(Number(e.target.value))}
                                                disabled={enviandoPrueba}
                                            />
                                            <Button type="button" variant="outline" size="icon" title="Nueva conversación" onClick={handleNuevaConversacion} disabled={enviandoPrueba}>
                                                <RefreshCw size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            )}
                        </Popover>
                        <Button type="button" variant="ghost" size="icon" title="Nueva conversación de prueba" className="text-white hover:bg-white/15 hover:text-white" onClick={handleNuevaConversacion} disabled={enviandoPrueba}>
                            <RefreshCw size={18} />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Borrar todo el historial de conversaciones de prueba"
                            className="text-white hover:bg-white/15 hover:text-white"
                            onClick={() => setConfirmBorrarTodoOpen(true)}
                            disabled={enviandoPrueba}
                        >
                            <Trash2 size={18} />
                        </Button>
                    </div>
                </div>

                {/* Cuerpo del chat */}
                <div ref={chatRef} className="h-[440px] overflow-y-auto bg-[#e5ddd5] px-4 py-4 space-y-1.5">
                    {timeline.length === 0 ? (
                        <div className="flex h-full items-center justify-center px-8">
                            <p className="rounded-lg bg-white/80 px-4 py-3 text-center text-sm text-gray-500 shadow-sm">
                                Los mensajes que envíes acá simulan lo que el cliente escribe por WhatsApp.
                                Escribí uno abajo y tocá enviar; la respuesta del bot va a aparecer sola.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-center pb-2">
                                <span className="rounded-md bg-white/70 px-3 py-1 text-xs text-gray-500 shadow-sm">Hoy</span>
                            </div>
                            {timeline.map((item) => {
                                if (item.kind === "cliente") {
                                    return (
                                        <div key={item.id} className="flex justify-end">
                                            <div className={`max-w-[75%] rounded-lg rounded-tr-sm px-3 py-2 shadow-sm ${item.ok ? "bg-[#dcf8c6]" : "bg-red-50 border border-red-200"}`}>
                                                <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{item.mensaje}</p>
                                                <div className="mt-1 flex items-center justify-end gap-1">
                                                    {!item.ok && <span className="text-[11px] text-red-600 mr-1">{item.detalle || "No se pudo enviar"}</span>}
                                                    <span className="text-[11px] text-gray-500">{item.hora}</span>
                                                    {item.ok ? (
                                                        <Check size={14} className="text-sky-500" />
                                                    ) : (
                                                        <AlertCircle size={13} className="text-red-500" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                                if (item.kind === "bot") {
                                    return (
                                        <div key={item.id} className="flex justify-start">
                                            <div className="max-w-[75%] rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                                                <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{item.mensaje}</p>
                                                <div className="mt-1 flex items-center justify-end">
                                                    <span className="text-[11px] text-gray-500">{item.hora}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                                if (item.kind === "nota") {
                                    return (
                                        <div key={item.id} className="flex justify-center">
                                            <div className="flex max-w-[85%] items-start gap-1.5 rounded-md bg-amber-100 border border-amber-200 px-3 py-1.5 text-xs text-amber-800 shadow-sm">
                                                <StickyNote size={13} className="mt-0.5 shrink-0" />
                                                <span><span className="font-semibold">Nota interna (no la ve el cliente):</span> {item.mensaje}</span>
                                            </div>
                                        </div>
                                    )
                                }
                                if (item.kind === "label") {
                                    return (
                                        <div key={item.id} className="flex justify-center">
                                            <div className="flex items-center gap-1.5 rounded-md bg-slate-200 px-3 py-1 text-xs text-slate-700 shadow-sm">
                                                <Tag size={12} className="shrink-0" />
                                                <span>{item.labels.join(", ") || "(sin labels)"}</span>
                                            </div>
                                        </div>
                                    )
                                }
                                // equipo
                                return (
                                    <div key={item.id} className="flex justify-center">
                                        <div className={`flex max-w-[85%] items-start gap-1.5 rounded-md border px-3 py-1.5 text-xs shadow-sm ${item.ok ? "bg-violet-100 border-violet-200 text-violet-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                                            <Users size={13} className="mt-0.5 shrink-0" />
                                            <span>
                                                <span className="font-semibold">Vos (equipo):</span> {item.mensaje}
                                                {!item.ok && <span className="block text-red-600">{item.detalle || "No se pudo enviar"}</span>}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                            {ultimoEsDelCliente && (
                                <div className="flex justify-start">
                                    <div className="rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                                        <Loader2 size={14} className="animate-spin text-gray-400" />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Barra de composición */}
                <form onSubmit={handleEnviarPrueba} className="flex items-end gap-2 bg-[#f0f0f0] px-3 py-2">
                    <Paperclip size={20} className="mb-2.5 shrink-0 text-gray-400" />
                    <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
                        <Smile size={20} className="shrink-0 text-gray-400" />
                        <textarea
                            value={mensajePrueba}
                            onChange={(e) => setMensajePrueba(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribí un mensaje"
                            rows={1}
                            disabled={enviandoPrueba}
                            className="max-h-24 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-gray-400"
                        />
                    </div>
                    <Button
                        type="submit"
                        size="icon"
                        disabled={enviandoPrueba || !mensajePrueba || !telefonoContacto}
                        className="mb-0 shrink-0 rounded-full bg-[#00a884] hover:bg-[#029672] text-white"
                    >
                        {enviandoPrueba ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </Button>
                </form>
            </div>

            {/* ---------------- RESPONDER COMO EQUIPO (cierra el ciclo: nota -> respuesta -> aprendizaje) ---------------- */}
            <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border shadow-xl">
                <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
                    <div className="flex items-center gap-2 min-w-0">
                        <Users size={20} className="shrink-0" />
                        <div className="min-w-0">
                            <p className="truncate font-semibold leading-tight">Responder como equipo</p>
                            <p className="truncate text-xs text-white/70">Simula que un agente le contesta la nota interna de arriba</p>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title='Reactiva el bot en esta conversación (equivale a mandar "/bot on")'
                        className="shrink-0 gap-1.5 text-white hover:bg-white/15 hover:text-white"
                        onClick={handleReactivarBot}
                        disabled={reactivandoBot}
                    >
                        {reactivandoBot ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                        /bot on
                    </Button>
                </div>

                <form onSubmit={handleResponderEquipo} className="flex items-end gap-2 bg-[#f0f0f0] px-3 py-2">
                    <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
                        <textarea
                            value={respuestaEquipo}
                            onChange={(e) => setRespuestaEquipo(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    handleResponderEquipo(e as unknown as React.FormEvent)
                                }
                            }}
                            placeholder="Ej: Sí, el kit XYZ es compatible con esa moto…"
                            rows={1}
                            disabled={enviandoRespuesta}
                            className="max-h-24 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-gray-400"
                        />
                    </div>
                    <Button
                        type="submit"
                        size="icon"
                        disabled={enviandoRespuesta || !respuestaEquipo}
                        className="mb-0 shrink-0 rounded-full bg-slate-800 hover:bg-slate-700 text-white"
                    >
                        {enviandoRespuesta ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </Button>
                </form>
                <p className="border-t bg-white px-4 py-2 text-[11px] leading-snug text-gray-400">
                    El workflow espera 5 min de calma entre escalados de una misma conversación (cooldown), y pausa
                    el bot en esa conversación apenas el equipo escribe algo. Usá "/bot on" o iniciá una conversación
                    nueva para seguir probando mensajes del cliente después de responder.
                </p>
            </div>

            <ConfirmDialog
                open={confirmBorrarTodoOpen}
                onOpenChange={setConfirmBorrarTodoOpen}
                title="¿Borrar todo el historial de prueba?"
                description="Se va a limpiar el historial guardado de todas las conversaciones de prueba (no solo la actual) y se arranca una conversación nueva. Es solo el mock de pruebas, no afecta datos reales."
                confirmLabel="Borrar todo"
                variant="danger"
                isLoading={borrandoTodo}
                onConfirm={handleBorrarTodoHistorial}
            />
        </div>
    )
}
