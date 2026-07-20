"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bot, Send, Loader2, RefreshCw, Check, AlertCircle, Settings2, Smile, Paperclip } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"

type MensajeLog = {
    id: number
    hora: string
    mensaje: string
    ok: boolean
    detalle?: string
}

export default function PruebaMensajesPage() {
    // ESTADOS PARA "PRUEBA MENSAJES" (simular un mensaje entrante de WhatsApp hacia n8n)
    const generarConversationId = () => Math.floor(900000 + Math.random() * 99999)
    const [conversationId, setConversationId] = useState(generarConversationId())
    const [nombreContacto, setNombreContacto] = useState("Cliente Prueba")
    const [telefonoContacto, setTelefonoContacto] = useState("5493511234567")
    const [mensajePrueba, setMensajePrueba] = useState("")
    const [enviandoPrueba, setEnviandoPrueba] = useState(false)
    const [logPrueba, setLogPrueba] = useState<MensajeLog[]>([])

    const chatRef = useRef<HTMLDivElement>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const settingsRef = useRef<HTMLDivElement>(null)

    // Cada vez que se agrega un mensaje, bajamos el scroll al final (como un chat real)
    useEffect(() => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" })
    }, [logPrueba])

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
        const id = Date.now()
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

            setLogPrueba((prev) => [
                ...prev,
                { id, hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), mensaje: mensajeEnviado, ok: respuesta.ok, detalle: !respuesta.ok ? data?.error : undefined },
            ])
        } catch (error) {
            setLogPrueba((prev) => [
                ...prev,
                { id, hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), mensaje: mensajeEnviado, ok: false, detalle: "Error de conexión con el servidor" },
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

    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Bot className="h-8 w-8 text-violet-600" />
                    Prueba de Mensajes
                </h1>
                <p className="text-gray-500">
                    Simulá un mensaje entrante de WhatsApp y envialo al workflow real de n8n, tal como lo haría Chatwoot.
                    Si el ID de conversación corresponde a una conversación real, la respuesta del asistente se publicará ahí.
                </p>
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
                                            <Button type="button" variant="outline" size="icon" title="Generar nueva conversación" onClick={() => setConversationId(generarConversationId())} disabled={enviandoPrueba}>
                                                <RefreshCw size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            )}
                        </Popover>
                        <Button type="button" variant="ghost" size="icon" title="Nueva conversación de prueba" className="text-white hover:bg-white/15 hover:text-white" onClick={() => { setConversationId(generarConversationId()); setLogPrueba([]) }} disabled={enviandoPrueba}>
                            <RefreshCw size={18} />
                        </Button>
                    </div>
                </div>

                {/* Cuerpo del chat */}
                <div ref={chatRef} className="h-[440px] overflow-y-auto bg-[#e5ddd5] px-4 py-4 space-y-1.5">
                    {logPrueba.length === 0 ? (
                        <div className="flex h-full items-center justify-center px-8">
                            <p className="rounded-lg bg-white/80 px-4 py-3 text-center text-sm text-gray-500 shadow-sm">
                                Los mensajes que envíes acá simulan lo que el cliente escribe por WhatsApp.
                                Escribí uno abajo y tocá enviar.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-center pb-2">
                                <span className="rounded-md bg-white/70 px-3 py-1 text-xs text-gray-500 shadow-sm">Hoy</span>
                            </div>
                            {logPrueba.map((item) => (
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
                            ))}
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
        </div>
    )
}
