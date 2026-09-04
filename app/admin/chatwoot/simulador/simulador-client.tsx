"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Bot,
    Send,
    User,
    Wrench,
    Clock,
    AlertCircle,
    CheckCircle2,
    Sparkles,
    ShieldAlert,
    RefreshCw,
    Sliders,
    Save,
    Key
} from "lucide-react"
import { toast } from "sonner"
import {
    enviarMensajeSimulador,
    getConfiguracionAgenteAction,
    guardarConfiguracionAgenteAction,
    obtenerHistorialSimuladorAction,
    limpiarHistorialSimuladorAction
} from "@/app/actions/agente-bot"
import { CASOS_PRUEBA_REALES, CasoPrueba } from "@/bot-agente/pruebas/casos-reales"
import { MensajeChat, RespuestaAgente } from "@/bot-agente/tipos"
import { ConfiguracionAgente } from "@/bot-agente/configuracion"

interface MensajeUI {
    id: string
    rol: "user" | "assistant"
    texto: string
    latenciaMs?: number
    herramientas?: { nombre: string; argumentos: any; resultado: any }[]
    escaladoHumano?: boolean
    motivoEscalado?: string
}

export function SimuladorClient({ configInicial }: { configInicial: ConfiguracionAgente }) {
    // Configuración
    const [config, setConfig] = useState<ConfiguracionAgente>(configInicial)
    const [palabrasProhibidasStr, setPalabrasProhibidasStr] = useState(
        configInicial.palabrasProhibidas.join(", ")
    )
    const [guardandoConfig, setGuardandoConfig] = useState(false)

    // Opciones del modelo / API
    const [apiKey, setApiKey] = useState("")
    const [presetSeleccionado, setPresetSeleccionado] = useState("openai:gpt-4o-mini")
    const [modelo, setModelo] = useState("gpt-4o-mini")
    const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1")
    const [esPersonalizado, setEsPersonalizado] = useState(false)

    // Chat
    const [mensajes, setMensajes] = useState<MensajeUI[]>([
        {
            id: "m0",
            rol: "assistant",
            texto: "¡Hola! Soy el simulador del nuevo Agente de WhatsApp. Escribime cualquier consulta o probá los botones rápidos con casos reales."
        }
    ])
    const [inputTexto, setInputTexto] = useState("")
    const [cargando, setCargando] = useState(false)

    // Cargar apiKey de localStorage si existe
    useEffect(() => {
        const savedKey = localStorage.getItem("rm_simulador_openai_key")
        if (savedKey) setApiKey(savedKey)
    }, [])

    // Cargar historial previo de la base de datos si existe
    useEffect(() => {
        async function cargarHistorial() {
            try {
                const filas = await obtenerHistorialSimuladorAction("sesion-activa")
                if (filas && filas.length > 0) {
                    const uiMensajes: MensajeUI[] = [
                        {
                            id: "m0",
                            rol: "assistant",
                            texto: "¡Hola! Soy el simulador del nuevo Agente de WhatsApp. Recuperé tu conversación anterior de la sesión activa:"
                        }
                    ]
                    for (const f of filas) {
                        uiMensajes.push({
                            id: `u_${f.id}`,
                            rol: "user",
                            texto: f.mensaje_usuario
                        })
                        uiMensajes.push({
                            id: `b_${f.id}`,
                            rol: "assistant",
                            texto: f.respuesta_bot || "*(El bot guardó silencio cara al cliente)*",
                            latenciaMs: f.latencia_ms,
                            herramientas: f.herramientas,
                            escaladoHumano: f.escalado_humano
                        })
                    }
                    setMensajes(uiMensajes)
                }
            } catch (e) {
                console.error("Error al cargar historial previo del simulador:", e)
            }
        }
        cargarHistorial()
    }, [])

    const handleSaveApiKey = (key: string) => {
        setApiKey(key)
        localStorage.setItem("rm_simulador_openai_key", key)
    }

    const handlePresetChange = (preset: string) => {
        setPresetSeleccionado(preset)
        if (preset === "openai:gpt-4o-mini") {
            setModelo("gpt-4o-mini")
            setBaseUrl("https://api.openai.com/v1")
            setEsPersonalizado(false)
        } else if (preset === "openai:gpt-4o") {
            setModelo("gpt-4o")
            setBaseUrl("https://api.openai.com/v1")
            setEsPersonalizado(false)
        } else if (preset === "deepseek:deepseek-chat") {
            setModelo("deepseek-chat")
            setBaseUrl("https://api.deepseek.com/v1")
            setEsPersonalizado(false)
        } else if (preset === "openrouter:anthropic/claude-3.5-sonnet") {
            setModelo("anthropic/claude-3.5-sonnet")
            setBaseUrl("https://openrouter.ai/api/v1")
            setEsPersonalizado(false)
        } else if (preset === "openrouter:meta-llama/llama-3.3-70b-instruct") {
            setModelo("meta-llama/llama-3.3-70b-instruct")
            setBaseUrl("https://openrouter.ai/api/v1")
            setEsPersonalizado(false)
        } else if (preset === "custom") {
            setEsPersonalizado(true)
        }
    }

    // Enviar mensaje
    const handleEnviar = async (textoAEnviar?: string) => {
        const texto = (textoAEnviar || inputTexto).trim()
        if (!texto || cargando) return

        const nuevoMensajeUsuario: MensajeUI = {
            id: "u_" + Date.now(),
            rol: "user",
            texto
        }

        const nuevaLista = [...mensajes, nuevoMensajeUsuario]
        setMensajes(nuevaLista)
        setInputTexto("")
        setCargando(true)

        // Preparar historial para el agente
        const historialParaAgente: MensajeChat[] = nuevaLista
            .filter((m) => m.id !== "m0")
            .map((m) => ({
                rol: m.rol,
                contenido: m.texto
            }))

        try {
            const respuesta: RespuestaAgente = await enviarMensajeSimulador(
                texto,
                historialParaAgente.slice(0, -1),
                {
                    apiKey: apiKey.trim() || undefined,
                    modelo: modelo || undefined,
                    baseUrl: baseUrl.trim() || undefined
                }
            )

            const nuevoMensajeBot: MensajeUI = {
                id: "b_" + Date.now(),
                rol: "assistant",
                texto: respuesta.mensajeFinal || "*(El bot guardó silencio cara al cliente)*",
                latenciaMs: respuesta.latenciaMs,
                herramientas: respuesta.herramientasEjecutadas,
                escaladoHumano: respuesta.escaladoHumano,
                motivoEscalado: respuesta.motivoEscalado
            }

            setMensajes((prev) => [...prev, nuevoMensajeBot])
        } catch (error: any) {
            toast.error("Error al procesar mensaje: " + error.message)
            setMensajes((prev) => [
                ...prev,
                {
                    id: "err_" + Date.now(),
                    rol: "assistant",
                    texto: `⚠️ Error de ejecución: ${error.message}`
                }
            ])
        } finally {
            setCargando(false)
        }
    }

    const handleProbarCaso = (caso: CasoPrueba) => {
        handleEnviar(caso.mensajeCliente)
    }

    const handleReiniciarChat = async () => {
        try {
            await limpiarHistorialSimuladorAction("sesion-activa")
        } catch (e) {
            console.error("Error al limpiar historial en base:", e)
        }
        setMensajes([
            {
                id: "m0",
                rol: "assistant",
                texto: "Conversación reiniciada. ¿Qué querés consultar?"
            }
        ])
    }

    const handleGuardarConfig = async () => {
        setGuardandoConfig(true)
        try {
            const res = await guardarConfiguracionAgenteAction({
                tonoEstilo: config.tonoEstilo,
                palabrasProhibidas: palabrasProhibidasStr,
                permitirBro: config.permitirBro,
                mensajeIncompatibilidad: config.mensajeIncompatibilidad,
                openaiApiKey: config.openaiApiKey,
                deepseekApiKey: config.deepseekApiKey,
                openrouterApiKey: config.openrouterApiKey,
                proveedorActivo: presetSeleccionado
            })

            if (res.success) {
                toast.success("Ajustes y claves de API guardados en la base de datos.")
            } else {
                toast.error("Error al guardar: " + res.error)
            }
        } catch (err: any) {
            toast.error("Error: " + err.message)
        } finally {
            setGuardandoConfig(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Simulador del Nuevo Agente</h1>
                    <p className="text-muted-foreground text-sm">
                        Probá el cerebro con herramientas en tiempo real: mirá qué tablas consulta, qué responde y controlá las reglas de estilo.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleReiniciarChat}>
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                        Reiniciar Chat
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="chat" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="chat" className="gap-2">
                        <Bot className="h-4 w-4" />
                        Chatear con el Agente
                    </TabsTrigger>
                    <TabsTrigger value="ajustes" className="gap-2">
                        <Sliders className="h-4 w-4" />
                        Ajustes de Estilo y Palabras
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: CHAT CON EL AGENTE */}
                <TabsContent value="chat" className="space-y-4">
                    {/* Barra superior de configuración rápida */}
                    <Card className="bg-slate-50 border-slate-200">
                        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-4 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">Proveedor / Modelo:</span>
                                <select
                                    className="bg-white border rounded px-2 py-1 text-xs"
                                    value={presetSeleccionado}
                                    onChange={(e) => handlePresetChange(e.target.value)}
                                >
                                    <option value="openai:gpt-4o-mini">OpenAI: GPT-4o Mini (Recomendado)</option>
                                    <option value="openai:gpt-4o">OpenAI: GPT-4o (Máxima Capacidad)</option>
                                    <option value="deepseek:deepseek-chat">DeepSeek: V3 (deepseek-chat)</option>
                                    <option value="openrouter:anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (OpenRouter)</option>
                                    <option value="openrouter:meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (OpenRouter)</option>
                                    <option value="custom">Personalizado / Otra API...</option>
                                </select>
                            </div>

                            {esPersonalizado && (
                                <>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-slate-700">Modelo:</span>
                                        <Input
                                            value={modelo}
                                            onChange={(e) => setModelo(e.target.value)}
                                            placeholder="nombre-modelo"
                                            className="h-7 text-xs bg-white w-36"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-slate-700">Base URL:</span>
                                        <Input
                                            value={baseUrl}
                                            onChange={(e) => setBaseUrl(e.target.value)}
                                            placeholder="https://api..."
                                            className="h-7 text-xs bg-white w-48"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                                <span className="font-semibold text-slate-700">API Key:</span>
                                <Input
                                    type="password"
                                    placeholder={
                                        presetSeleccionado.startsWith("deepseek")
                                            ? "sk-... de DeepSeek"
                                            : presetSeleccionado.startsWith("openrouter")
                                            ? "sk-or-... de OpenRouter"
                                            : "sk-... de OpenAI (o dejar vacío para usar .env)"
                                    }
                                    className="h-7 text-xs bg-white"
                                    value={apiKey}
                                    onChange={(e) => handleSaveApiKey(e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Botones de Casos Rápidos */}
                    <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                            Casos de prueba reales de WhatsApp:
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {CASOS_PRUEBA_REALES.map((caso) => (
                                <button
                                    key={caso.id}
                                    onClick={() => handleProbarCaso(caso)}
                                    disabled={cargando}
                                    className="text-xs bg-white border border-slate-300 hover:border-cyan-500 hover:bg-cyan-50 text-slate-700 px-2.5 py-1.5 rounded-md transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <Sparkles className="h-3 w-3 text-cyan-600" />
                                    <span>{caso.titulo}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ventana de Conversación */}
                    <Card className="border-slate-300 shadow-sm flex flex-col h-[520px]">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                            {mensajes.map((m) => (
                                <div
                                    key={m.id}
                                    className={`flex flex-col ${m.rol === "user" ? "items-end" : "items-start"}`}
                                >
                                    <div className="flex items-start gap-2 max-w-[85%]">
                                        {m.rol === "assistant" && (
                                            <div className="h-8 w-8 rounded-full bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm text-xs font-bold">
                                                RM
                                            </div>
                                        )}
                                        <div
                                            className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                                m.rol === "user"
                                                    ? "bg-emerald-600 text-white rounded-br-none"
                                                    : m.escaladoHumano
                                                    ? "bg-rose-50 border border-rose-200 text-rose-900 rounded-bl-none"
                                                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                                            }`}
                                        >
                                            {m.escaladoHumano ? (
                                                <div className="bg-rose-50/90 border border-rose-200 rounded-lg p-2.5 space-y-1 text-xs">
                                                    <div className="flex items-center gap-1.5 text-rose-700 font-bold">
                                                        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                                                        <span>Derivado a Asesor Humano en SILENCIO</span>
                                                        {m.motivoEscalado && (
                                                            <Badge variant="outline" className="text-[10px] bg-white text-rose-700 border-rose-300">
                                                                {m.motivoEscalado}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-rose-700 font-semibold">
                                                        🤫 Cara al cliente de WhatsApp: Silencio total. No se envió ningún mensaje.
                                                    </p>
                                                    <p className="text-[10px] text-slate-500">
                                                        La conversación queda abierta para que un vendedor humano tome el control en Chatwoot y responda con seguridad.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="whitespace-pre-wrap">{m.texto}</div>
                                            )}

                                            {/* Detalles técnicos de herramientas usadas (colapsable para no confundir con notas) */}
                                            {m.herramientas && m.herramientas.length > 0 && (
                                                <details className="mt-2.5 pt-2 border-t border-slate-100 text-xs group">
                                                    <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-cyan-700 font-medium flex items-center gap-1.5 select-none list-none">
                                                        <Wrench className="h-3 w-3 text-cyan-600" />
                                                        <span>Auditoría de base de datos ({m.herramientas.length} {m.herramientas.length === 1 ? "herramienta" : "herramientas"})</span>
                                                        <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded font-normal ml-auto">
                                                            Inspector técnico (no es nota de Chatwoot)
                                                        </span>
                                                    </summary>
                                                    <div className="mt-2 space-y-1.5 pt-1">
                                                        {m.herramientas.map((h, idx) => (
                                                            <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px]">
                                                                <div className="font-mono text-cyan-700 font-bold">{h.nombre}()</div>
                                                                <div className="text-slate-500 text-[10px] mt-0.5">
                                                                    Args: {JSON.stringify(h.argumentos)}
                                                                </div>
                                                                {h.resultado?.mensaje_para_agente && (
                                                                    <div className="text-emerald-700 text-[10px] mt-0.5 whitespace-pre-wrap">
                                                                        Respuesta DB: {h.resultado.mensaje_para_agente.slice(0, 140)}...
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}

                                            {m.latenciaMs !== undefined && (
                                                <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-end gap-1">
                                                    <Clock className="h-2.5 w-2.5" />
                                                    {(m.latenciaMs / 1000).toFixed(2)}s
                                                </div>
                                            )}
                                        </div>
                                        {m.rol === "user" && (
                                            <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 text-xs">
                                                <User className="h-4 w-4" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {cargando && (
                                <div className="flex items-center gap-2 text-xs text-slate-500 italic p-2">
                                    <div className="h-2 w-2 rounded-full bg-cyan-600 animate-pulse" />
                                    El agente está analizando y consultando la base de datos...
                                </div>
                            )}
                        </div>

                        {/* Input bar */}
                        <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
                            <Input
                                placeholder="Escribí un mensaje como cliente de WhatsApp..."
                                value={inputTexto}
                                onChange={(e) => setInputTexto(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleEnviar()}
                                disabled={cargando}
                                className="flex-1"
                            />
                            <Button
                                onClick={() => handleEnviar()}
                                disabled={cargando || !inputTexto.trim()}
                                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </Card>
                </TabsContent>

                {/* TAB 2: AJUSTES DE ESTILO Y PALABRAS */}
                <TabsContent value="ajustes" className="space-y-4">
                    {/* Claves de API de Inteligencia Artificial */}
                    <Card className="border-cyan-200 bg-cyan-50/40">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Key className="h-5 w-5 text-cyan-700" />
                                <div>
                                    <CardTitle className="text-base text-cyan-950">Claves de API de Inteligencia Artificial</CardTitle>
                                    <CardDescription className="text-xs text-cyan-700">
                                        Cargá acá tus claves una sola vez y quedan guardadas en la base de datos de tu tienda.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                                        <span>OpenAI API Key (GPT-4o / GPT-4o-mini):</span>
                                        <span className="text-[10px] text-cyan-700 font-normal">Recomendado</span>
                                    </label>
                                    <Input
                                        type="password"
                                        value={config.openaiApiKey || ""}
                                        onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value })}
                                        placeholder="sk-proj-..."
                                        className="bg-white text-xs"
                                    />
                                    <p className="text-[10px] text-slate-500">
                                        Para usar los modelos oficiales de OpenAI (gpt-4o-mini, gpt-4o).
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                                        <span>DeepSeek API Key (Opcional):</span>
                                        <span className="text-[10px] text-slate-500 font-normal">Económico</span>
                                    </label>
                                    <Input
                                        type="password"
                                        value={config.deepseekApiKey || ""}
                                        onChange={(e) => setConfig({ ...config, deepseekApiKey: e.target.value })}
                                        placeholder="sk-..."
                                        className="bg-white text-xs"
                                    />
                                    <p className="text-[10px] text-slate-500">
                                        Para usar el modelo deepseek-chat directo de DeepSeek.
                                    </p>
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                                        <span>OpenRouter API Key (Opcional - Para Claude 3.5 Sonnet o Llama 3):</span>
                                        <span className="text-[10px] text-indigo-600 font-normal">Multimodelo</span>
                                    </label>
                                    <Input
                                        type="password"
                                        value={config.openrouterApiKey || ""}
                                        onChange={(e) => setConfig({ ...config, openrouterApiKey: e.target.value })}
                                        placeholder="sk-or-v1-..."
                                        className="bg-white text-xs"
                                    />
                                    <p className="text-[10px] text-slate-500">
                                        Con una sola clave de openrouter.ai podés probar Claude 3.5 Sonnet, Gemini o Llama 3.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Configuración de Voz y Reglas de Estilo</CardTitle>
                            <CardDescription>
                                Todo lo que configures acá se guarda en la tabla <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">chat_config</code> y el agente lo aplica en vivo en cada respuesta.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Pautas de estilo */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-800">
                                    Pauta de Tono del Vendedor:
                                </label>
                                <Textarea
                                    rows={3}
                                    value={config.tonoEstilo}
                                    onChange={(e) => setConfig({ ...config, tonoEstilo: e.target.value })}
                                    placeholder="Ej: Vendedor de mostrador cordial, conciso, buena onda..."
                                />
                                <p className="text-xs text-slate-500">
                                    Define la actitud general. Recomendación: no poner prohibiciones largas acá, sino pautas positivas de cómo hablar.
                                </p>
                            </div>

                            {/* Tratamiento de 'bro' */}
                            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                                <div>
                                    <span className="text-sm font-semibold text-slate-800 block">
                                        Permitir la palabra &quot;bro&quot;
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        Si lo desactivás, el filtro reemplazará automáticamente &quot;bro&quot; por &quot;amigo&quot; o lo quitará.
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={config.permitirBro}
                                    onChange={(e) => setConfig({ ...config, permitirBro: e.target.checked })}
                                    className="h-5 w-5 text-cyan-600 rounded"
                                />
                            </div>

                            {/* Palabras prohibidas */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-800">
                                    Palabras y modismos prohibidos (separadas por coma):
                                </label>
                                <Input
                                    value={palabrasProhibidasStr}
                                    onChange={(e) => setPalabrasProhibidasStr(e.target.value)}
                                    placeholder="culiau, che, chabón, amigazo..."
                                />
                                <p className="text-xs text-slate-500">
                                    Cualquier palabra que pongas acá será limpiada o reemplazada por el filtro de seguridad en 1 milisegundo antes de que salga al cliente.
                                </p>
                            </div>

                            {/* Mensaje de incompatibilidad */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-800">
                                    Mensaje fijo de incompatibilidad:
                                </label>
                                <Input
                                    value={config.mensajeIncompatibilidad}
                                    onChange={(e) => setConfig({ ...config, mensajeIncompatibilidad: e.target.value })}
                                    placeholder="Lamentablemente este kit no es compatible."
                                />
                            </div>

                            <div className="pt-2">
                                <Button
                                    onClick={handleGuardarConfig}
                                    disabled={guardandoConfig}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Save className="h-4 w-4 mr-2" />
                                    {guardandoConfig ? "Guardando..." : "Guardar Ajustes"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
