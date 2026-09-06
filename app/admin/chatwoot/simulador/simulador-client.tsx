"use client"

import React, { useState, useEffect, useRef } from "react"
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
    Key,
    Cpu,
    Eye,
    EyeOff,
    Check,
    Loader2,
    ExternalLink,
    Zap
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
    enviarMensajeSimulador,
    getConfiguracionAgenteAction,
    guardarConfiguracionAgenteAction,
    obtenerHistorialSimuladorAction,
    limpiarHistorialSimuladorAction,
    correrBancoPruebasAction,
    probarConexionModeloAction
} from "@/app/actions/agente-bot"
import type { ReporteBanco } from "@/bot-agente/pruebas/correr-banco"
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
    fotoUrl?: string | null
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
    const [presetSeleccionado, setPresetSeleccionado] = useState(
        configInicial.proveedorActivo || "openai:gpt-4o-mini"
    )
    const [modelo, setModelo] = useState("gpt-4o-mini")
    const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1")
    const [esPersonalizado, setEsPersonalizado] = useState(false)

    // Modal de selección de modelo IA y carga de API Key
    const [modalModeloAbierto, setModalModeloAbierto] = useState(false)
    const [tempProveedor, setTempProveedor] = useState<"deepseek" | "openai" | "openrouter" | "custom">("deepseek")
    const [tempModelo, setTempModelo] = useState("deepseek-v4-flash")
    const [tempBaseUrl, setTempBaseUrl] = useState("https://api.deepseek.com")
    const [tempApiKey, setTempApiKey] = useState("")
    const [tempMostrarKey, setTempMostrarKey] = useState(false)
    const [probandoConexion, setProbandoConexion] = useState(false)
    const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; mensaje: string; latenciaMs?: number } | null>(null)
    const [guardandoModelo, setGuardandoModelo] = useState(false)

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

    // Banco de pruebas
    const [reporteBanco, setReporteBanco] = useState<ReporteBanco | null>(null)
    const [corriendoBanco, setCorriendoBanco] = useState(false)

    // Debounce de ráfagas (Espera de silencio para juntar mensajes y simular tipeo humano)
    const [debounceActivo, setDebounceActivo] = useState(false)
    const [debounceSegundos, setDebounceSegundos] = useState(configInicial.debounceSegundos || 60)
    const [segundosRestantes, setSegundosRestantes] = useState(0)
    const colaRafagaRef = useRef<string[]>([])
    const historialPrevioRef = useRef<MensajeChat[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const intervaloRef = useRef<NodeJS.Timeout | null>(null)

    // Limpiar temporizadores de debounce al desmontar
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            if (intervaloRef.current) clearInterval(intervaloRef.current)
        }
    }, [])

    // Cargar preset y apiKey de localStorage o de la configuración del servidor
    useEffect(() => {
        const savedPreset = localStorage.getItem("rm_simulador_preset") || configInicial.proveedorActivo || "openai:gpt-4o-mini"
        setPresetSeleccionado(savedPreset)

        let initialModel = "gpt-4o-mini"
        let initialBaseUrl = "https://api.openai.com/v1"
        let initialKey = ""

        const modeloDelPreset = savedPreset.includes(":") ? savedPreset.slice(savedPreset.indexOf(":") + 1) : ""

        if (savedPreset.startsWith("deepseek")) {
            initialModel = modeloDelPreset || "deepseek-v4-flash"
            initialBaseUrl = "https://api.deepseek.com"
            initialKey = localStorage.getItem("rm_simulador_deepseek_key") || configInicial.deepseekApiKey || ""
        } else if (savedPreset.startsWith("openrouter")) {
            initialModel = modeloDelPreset
            initialBaseUrl = "https://openrouter.ai/api/v1"
            initialKey = localStorage.getItem("rm_simulador_openrouter_key") || configInicial.openrouterApiKey || ""
        } else {
            initialModel = modeloDelPreset || localStorage.getItem("rm_simulador_modelo") || "gpt-5-mini"
            initialBaseUrl = "https://api.openai.com/v1"
            initialKey = localStorage.getItem("rm_simulador_openai_key") || configInicial.openaiApiKey || ""
        }

        setModelo(initialModel)
        setBaseUrl(initialBaseUrl)
        setApiKey(initialKey)
    }, [configInicial])

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
                            escaladoHumano: f.escalado_humano,
                            fotoUrl: f.foto_url
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
        if (presetSeleccionado.startsWith("deepseek")) {
            localStorage.setItem("rm_simulador_deepseek_key", key)
        } else if (presetSeleccionado.startsWith("openrouter")) {
            localStorage.setItem("rm_simulador_openrouter_key", key)
        } else {
            localStorage.setItem("rm_simulador_openai_key", key)
        }
    }

    const abrirModalModelo = () => {
        setResultadoPrueba(null)
        setTempMostrarKey(false)
        if (presetSeleccionado.startsWith("deepseek")) {
            setTempProveedor("deepseek")
            setTempModelo(modelo || "deepseek-v4-flash")
            setTempBaseUrl(baseUrl || "https://api.deepseek.com")
            setTempApiKey(localStorage.getItem("rm_simulador_deepseek_key") || config.deepseekApiKey || apiKey || "")
        } else if (presetSeleccionado.startsWith("openrouter")) {
            setTempProveedor("openrouter")
            setTempModelo(modelo || "anthropic/claude-3.5-sonnet")
            setTempBaseUrl(baseUrl || "https://openrouter.ai/api/v1")
            setTempApiKey(localStorage.getItem("rm_simulador_openrouter_key") || config.openrouterApiKey || apiKey || "")
        } else if (presetSeleccionado === "custom") {
            setTempProveedor("custom")
            setTempModelo(modelo)
            setTempBaseUrl(baseUrl)
            setTempApiKey(apiKey)
        } else {
            setTempProveedor("openai")
            setTempModelo(modelo || "gpt-4o-mini")
            setTempBaseUrl(baseUrl || "https://api.openai.com/v1")
            setTempApiKey(localStorage.getItem("rm_simulador_openai_key") || config.openaiApiKey || apiKey || "")
        }
        setModalModeloAbierto(true)
    }

    const handleCambiarProveedorModal = (prov: "deepseek" | "openai" | "openrouter" | "custom") => {
        setTempProveedor(prov)
        setResultadoPrueba(null)
        if (prov === "deepseek") {
            setTempModelo("deepseek-v4-flash")
            setTempBaseUrl("https://api.deepseek.com")
            setTempApiKey(localStorage.getItem("rm_simulador_deepseek_key") || config.deepseekApiKey || "")
        } else if (prov === "openai") {
            setTempModelo("gpt-5-mini")
            setTempBaseUrl("https://api.openai.com/v1")
            setTempApiKey(localStorage.getItem("rm_simulador_openai_key") || config.openaiApiKey || "")
        } else if (prov === "openrouter") {
            setTempModelo("anthropic/claude-3.5-sonnet")
            setTempBaseUrl("https://openrouter.ai/api/v1")
            setTempApiKey(localStorage.getItem("rm_simulador_openrouter_key") || config.openrouterApiKey || "")
        }
    }

    const handleProbarConexion = async () => {
        if (!tempApiKey.trim()) {
            toast.error("Por favor ingresá la API Key para probar la conexión.")
            return
        }
        setProbandoConexion(true)
        setResultadoPrueba(null)
        try {
            const res = await probarConexionModeloAction({
                apiKey: tempApiKey.trim(),
                modelo: tempModelo.trim(),
                baseUrl: tempBaseUrl.trim()
            })
            setResultadoPrueba(res)
            if (res.ok) {
                toast.success(res.mensaje)
            } else {
                toast.error(res.mensaje)
            }
        } catch (e: any) {
            setResultadoPrueba({ ok: false, mensaje: e.message || String(e) })
            toast.error(e.message || "Error al probar conexión")
        } finally {
            setProbandoConexion(false)
        }
    }

    const handleGuardarModeloModal = async () => {
        if (!tempApiKey.trim()) {
            toast.error("Por favor ingresá la API Key antes de activar el modelo.")
            return
        }
        setGuardandoModelo(true)
        try {
            let nuevoPreset = "openai:gpt-4o-mini"
            if (tempProveedor === "deepseek") {
                nuevoPreset = `deepseek:${tempModelo}`
                localStorage.setItem("rm_simulador_deepseek_key", tempApiKey.trim())
            } else if (tempProveedor === "openai") {
                nuevoPreset = `openai:${tempModelo}`
                localStorage.setItem("rm_simulador_openai_key", tempApiKey.trim())
            } else if (tempProveedor === "openrouter") {
                nuevoPreset = `openrouter:${tempModelo}`
                localStorage.setItem("rm_simulador_openrouter_key", tempApiKey.trim())
            } else {
                nuevoPreset = "custom"
            }

            localStorage.setItem("rm_simulador_preset", nuevoPreset)
            localStorage.setItem("rm_simulador_modelo", tempModelo)
            localStorage.setItem("rm_simulador_base_url", tempBaseUrl)

            // Persistir en chat_config en la base de datos
            const payload: any = {
                tonoEstilo: config.tonoEstilo,
                palabrasProhibidas: palabrasProhibidasStr,
                permitirBro: config.permitirBro,
                mensajeIncompatibilidad: config.mensajeIncompatibilidad,
                proveedorActivo: nuevoPreset,
                debounceSegundos,
                debounceActivo
            }
            if (tempProveedor === "deepseek") {
                payload.deepseekApiKey = tempApiKey.trim()
            } else if (tempProveedor === "openai") {
                payload.openaiApiKey = tempApiKey.trim()
            } else if (tempProveedor === "openrouter") {
                payload.openrouterApiKey = tempApiKey.trim()
            }

            const res = await guardarConfiguracionAgenteAction(payload)
            if (!res.success) {
                throw new Error(res.error || "No se pudo guardar la configuración en la base de datos")
            }

            // Actualizar estado del simulador
            setPresetSeleccionado(nuevoPreset)
            setModelo(tempModelo)
            setBaseUrl(tempBaseUrl)
            setApiKey(tempApiKey.trim())
            setConfig((prev) => ({
                ...prev,
                proveedorActivo: nuevoPreset,
                ...(tempProveedor === "deepseek" ? { deepseekApiKey: tempApiKey.trim() } : {}),
                ...(tempProveedor === "openai" ? { openaiApiKey: tempApiKey.trim() } : {}),
                ...(tempProveedor === "openrouter" ? { openrouterApiKey: tempApiKey.trim() } : {})
            }))

            setModalModeloAbierto(false)
            toast.success(`¡Modelo activado con éxito! Usando ${tempModelo}`)
        } catch (e: any) {
            toast.error("Error al guardar: " + e.message)
        } finally {
            setGuardandoModelo(false)
        }
    }

    const handlePresetChange = (preset: string) => {
        setPresetSeleccionado(preset)
        if (preset === "openai:gpt-4o-mini") {
            setModelo("gpt-4o-mini")
            setBaseUrl("https://api.openai.com/v1")
            setEsPersonalizado(false)
            const k = localStorage.getItem("rm_simulador_openai_key") || config.openaiApiKey || ""
            setApiKey(k)
        } else if (preset === "openai:gpt-4o") {
            setModelo("gpt-4o")
            setBaseUrl("https://api.openai.com/v1")
            setEsPersonalizado(false)
            const k = localStorage.getItem("rm_simulador_openai_key") || config.openaiApiKey || ""
            setApiKey(k)
        } else if (preset === "deepseek:deepseek-v4-flash") {
            setModelo("deepseek-v4-flash")
            setBaseUrl("https://api.deepseek.com")
            setEsPersonalizado(false)
            const k = localStorage.getItem("rm_simulador_deepseek_key") || config.deepseekApiKey || ""
            setApiKey(k)
        } else if (preset === "deepseek:deepseek-chat") {
            setModelo("deepseek-chat")
            setBaseUrl("https://api.deepseek.com")
            setEsPersonalizado(false)
            const k = localStorage.getItem("rm_simulador_deepseek_key") || config.deepseekApiKey || ""
            setApiKey(k)
        } else if (preset === "openrouter:anthropic/claude-3.5-sonnet") {
            setModelo("anthropic/claude-3.5-sonnet")
            setBaseUrl("https://openrouter.ai/api/v1")
            setEsPersonalizado(false)
            const k = localStorage.getItem("rm_simulador_openrouter_key") || config.openrouterApiKey || ""
            setApiKey(k)
        } else if (preset === "openrouter:meta-llama/llama-3.3-70b-instruct") {
            setModelo("meta-llama/llama-3.3-70b-instruct")
            setBaseUrl("https://openrouter.ai/api/v1")
            setEsPersonalizado(false)
            const k = localStorage.getItem("rm_simulador_openrouter_key") || config.openrouterApiKey || ""
            setApiKey(k)
        } else if (preset === "custom") {
            setEsPersonalizado(true)
        }
    }

    // Despachar ráfaga acumulada hacia el agente
    const despacharRafaga = async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        if (intervaloRef.current) {
            clearInterval(intervaloRef.current)
            intervaloRef.current = null
        }
        setSegundosRestantes(0)

        const rafaga = [...colaRafagaRef.current]
        if (rafaga.length === 0) return
        colaRafagaRef.current = []

        const textoConsolidado = rafaga.join("\n")
        const historialParaAgente = [...historialPrevioRef.current]
        historialPrevioRef.current = []

        setCargando(true)
        try {
            const respuesta: RespuestaAgente = await enviarMensajeSimulador(
                textoConsolidado,
                historialParaAgente,
                {
                    apiKey: apiKey.trim() || undefined,
                    modelo: modelo || undefined,
                    baseUrl: baseUrl.trim() || undefined
                }
            )

            const nuevosMensajesBot: MensajeUI[] = []
            if (respuesta.mensajesFinales && respuesta.mensajesFinales.length > 1) {
                respuesta.mensajesFinales.forEach((texto, idx) => {
                    const esUltimo = idx === respuesta.mensajesFinales!.length - 1
                    nuevosMensajesBot.push({
                        id: `b_${Date.now()}_${idx}`,
                        rol: "assistant",
                        texto,
                        latenciaMs: esUltimo ? respuesta.latenciaMs : undefined,
                        herramientas: esUltimo ? respuesta.herramientasEjecutadas : undefined,
                        escaladoHumano: respuesta.escaladoHumano,
                        motivoEscalado: respuesta.motivoEscalado,
                        fotoUrl: esUltimo ? respuesta.fotoUrl : undefined
                    })
                })
            } else {
                nuevosMensajesBot.push({
                    id: "b_" + Date.now(),
                    rol: "assistant",
                    texto: respuesta.mensajeFinal || "*(El bot guardó silencio cara al cliente)*",
                    latenciaMs: respuesta.latenciaMs,
                    herramientas: respuesta.herramientasEjecutadas,
                    escaladoHumano: respuesta.escaladoHumano,
                    motivoEscalado: respuesta.motivoEscalado,
                    fotoUrl: respuesta.fotoUrl
                })
            }

            setMensajes((prev) => [...prev, ...nuevosMensajesBot])
        } catch (error: any) {
            toast.error("Error al procesar ráfaga: " + error.message)
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

    const cancelarRafaga = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        if (intervaloRef.current) {
            clearInterval(intervaloRef.current)
            intervaloRef.current = null
        }
        setSegundosRestantes(0)
        colaRafagaRef.current = []
        historialPrevioRef.current = []
        toast.info("Ráfaga cancelada.")
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

        setInputTexto("")

        // MODO CON DEBOUNCE ACTIVO:
        // Acumula los mensajes en la ráfaga, muestra el globo de inmediato en la UI
        // y espera que pase el tiempo configurado sin nuevos mensajes antes de responder.
        if (debounceActivo) {
            if (colaRafagaRef.current.length === 0) {
                historialPrevioRef.current = mensajes
                    .filter((m) => m.id !== "m0")
                    .map((m) => ({
                        rol: m.rol,
                        contenido: m.texto
                    }))
            }

            colaRafagaRef.current.push(texto)
            setMensajes((prev) => [...prev, nuevoMensajeUsuario])

            if (timerRef.current) clearTimeout(timerRef.current)
            if (intervaloRef.current) clearInterval(intervaloRef.current)

            setSegundosRestantes(debounceSegundos)

            intervaloRef.current = setInterval(() => {
                setSegundosRestantes((prev) => {
                    if (prev <= 1) {
                        if (intervaloRef.current) clearInterval(intervaloRef.current)
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)

            timerRef.current = setTimeout(() => {
                despacharRafaga()
            }, debounceSegundos * 1000)

            return
        }

        // MODO DIRECTO (sin debounce / para pruebas rápidas)
        const nuevaLista = [...mensajes, nuevoMensajeUsuario]
        setMensajes(nuevaLista)
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

            const nuevosMensajesBot: MensajeUI[] = []
            if (respuesta.mensajesFinales && respuesta.mensajesFinales.length > 1) {
                respuesta.mensajesFinales.forEach((texto, idx) => {
                    const esUltimo = idx === respuesta.mensajesFinales!.length - 1
                    nuevosMensajesBot.push({
                        id: `b_${Date.now()}_${idx}`,
                        rol: "assistant",
                        texto,
                        latenciaMs: esUltimo ? respuesta.latenciaMs : undefined,
                        herramientas: esUltimo ? respuesta.herramientasEjecutadas : undefined,
                        escaladoHumano: respuesta.escaladoHumano,
                        motivoEscalado: respuesta.motivoEscalado,
                        fotoUrl: esUltimo ? respuesta.fotoUrl : undefined
                    })
                })
            } else {
                nuevosMensajesBot.push({
                    id: "b_" + Date.now(),
                    rol: "assistant",
                    texto: respuesta.mensajeFinal || "*(El bot guardó silencio cara al cliente)*",
                    latenciaMs: respuesta.latenciaMs,
                    herramientas: respuesta.herramientasEjecutadas,
                    escaladoHumano: respuesta.escaladoHumano,
                    motivoEscalado: respuesta.motivoEscalado,
                    fotoUrl: respuesta.fotoUrl
                })
            }

            setMensajes((prev) => [...prev, ...nuevosMensajesBot])
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

    const handleCorrerBanco = async () => {
        setCorriendoBanco(true)
        setReporteBanco(null)
        try {
            const reporte = await correrBancoPruebasAction({
                apiKey: apiKey.trim() || undefined,
                modelo: modelo || undefined,
                baseUrl: baseUrl.trim() || undefined
            })
            setReporteBanco(reporte)
            if (reporte.fallados === 0) {
                toast.success(`Banco OK: ${reporte.pasados}/${reporte.total} casos pasaron.`)
            } else {
                toast.warning(`${reporte.fallados} de ${reporte.total} casos fallaron.`)
            }
        } catch (e: any) {
            toast.error("Error al correr el banco: " + e.message)
        } finally {
            setCorriendoBanco(false)
        }
    }

    const handleReiniciarChat = async () => {
        cancelarRafaga()
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
                proveedorActivo: presetSeleccionado,
                debounceSegundos: config.debounceSegundos,
                debounceActivo: config.debounceActivo
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
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={abrirModalModelo}
                        className="gap-2 border-slate-300 hover:border-slate-400 bg-white shadow-xs text-xs"
                    >
                        <span className="relative flex h-2 w-2">
                            <span
                                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                                    apiKey ? "bg-emerald-400" : "bg-amber-400"
                                } opacity-75`}
                            ></span>
                            <span
                                className={`relative inline-flex rounded-full h-2 w-2 ${
                                    apiKey ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                            ></span>
                        </span>
                        <Cpu className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-slate-800">
                            {presetSeleccionado.startsWith("deepseek")
                                ? "DeepSeek"
                                : presetSeleccionado.startsWith("openrouter")
                                ? "OpenRouter"
                                : "OpenAI"}
                            :
                        </span>
                        <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {modelo}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-700">
                            Configurar
                        </Badge>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleReiniciarChat}>
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                        Reiniciar Chat
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="chat" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 max-w-2xl">
                    <TabsTrigger value="chat" className="gap-2">
                        <Bot className="h-4 w-4" />
                        Chatear con el Agente
                    </TabsTrigger>
                    <TabsTrigger value="banco" className="gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Banco de pruebas
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
                        <CardContent className="py-2.5 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <span className="font-semibold text-slate-700">Proveedor / Modelo:</span>
                                <Badge
                                    variant="outline"
                                    className={`gap-1.5 font-mono text-xs px-2.5 py-1 ${
                                        presetSeleccionado.startsWith("deepseek")
                                            ? "bg-blue-50/80 border-blue-200 text-blue-900"
                                            : "bg-white border-slate-300 text-slate-800"
                                    }`}
                                >
                                    <span
                                        className={`h-2 w-2 rounded-full ${
                                            apiKey ? "bg-emerald-500" : "bg-amber-500"
                                        }`}
                                    />
                                    {presetSeleccionado.startsWith("deepseek")
                                        ? "DeepSeek"
                                        : presetSeleccionado.startsWith("openrouter")
                                        ? "OpenRouter"
                                        : "OpenAI"}
                                    : <span className="font-bold">{modelo}</span>
                                </Badge>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={abrirModalModelo}
                                    className="h-7 text-xs bg-white hover:bg-slate-100 border-slate-300 gap-1.5 px-2.5"
                                >
                                    <Cpu className="h-3.5 w-3.5 text-blue-600" />
                                    Cambiar a DeepSeek / Configurar API Key
                                </Button>

                                {!apiKey ? (
                                    <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                        <AlertCircle className="h-3 w-3 text-amber-600" />
                                        Falta API Key (hacé clic en cambiar)
                                    </span>
                                ) : (
                                    <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        API Key activa
                                    </span>
                                )}
                            </div>

                            {/* Control de Debounce de ráfagas para pruebas */}
                            <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-300 pt-2 sm:pt-0 sm:pl-3">
                                <label
                                    className={`flex items-center gap-2 cursor-pointer select-none font-medium px-2.5 py-1 rounded border transition-all ${
                                        debounceActivo
                                            ? "bg-cyan-50 border-cyan-300 text-cyan-900 shadow-sm"
                                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={debounceActivo}
                                        onChange={(e) => {
                                            const nuevoValor = e.target.checked
                                            setDebounceActivo(nuevoValor)
                                            if (!nuevoValor && timerRef.current) {
                                                despacharRafaga()
                                            }
                                        }}
                                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 h-3.5 w-3.5"
                                    />
                                    <Clock className={`h-3.5 w-3.5 ${debounceActivo ? "text-cyan-600" : "text-slate-400"}`} />
                                    <span className="text-xs font-semibold">
                                        Debounce de ráfaga ({debounceSegundos}s)
                                    </span>
                                    {debounceActivo && (
                                        <Badge variant="secondary" className="text-[10px] bg-cyan-100 text-cyan-800 py-0 px-1.5 h-4">
                                            Activo
                                        </Badge>
                                    )}
                                </label>
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
                                                <div className="whitespace-pre-wrap">
                                                    {m.texto}
                                                    {m.fotoUrl && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={m.fotoUrl}
                                                            alt="Foto del kit"
                                                            className="mt-2 rounded-lg border border-slate-200 max-w-[220px]"
                                                        />
                                                    )}
                                                </div>
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

                        {/* Banner de Debounce de ráfaga activo */}
                        {segundosRestantes > 0 && (
                            <div className="mx-3 my-2 p-2.5 bg-amber-50/95 border border-amber-300 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs animate-in fade-in slide-in-from-bottom-1">
                                <div className="flex items-center gap-2.5 text-amber-900">
                                    <div className="h-6 w-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0 animate-pulse">
                                        {segundosRestantes}s
                                    </div>
                                    <div>
                                        <span className="font-bold text-amber-950">
                                            Debounce de ráfaga ({segundosRestantes}s restantes):
                                        </span>{" "}
                                        <span className="text-amber-800">
                                            Podés enviar más mensajes; cada uno reinicia el reloj de 1 min para responder todo junto.
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <Button
                                        size="sm"
                                        onClick={() => despacharRafaga()}
                                        className="h-6 px-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-none"
                                    >
                                        ⚡ Responder ya
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => cancelarRafaga()}
                                        className="h-6 px-2 text-xs text-amber-800 bg-white border-amber-300 hover:bg-amber-100 shadow-none"
                                    >
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        )}

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

                {/* TAB: BANCO DE PRUEBAS */}
                <TabsContent value="banco" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Banco de pruebas anti-regresión</CardTitle>
                            <CardDescription className="text-xs">
                                Corre los {CASOS_PRUEBA_REALES.length} casos reales de <code>casos-reales.ts</code> contra el motor
                                y verifica escalado, silencio, herramientas llamadas y patrón de respuesta. Corré esto antes de
                                dar por terminado cualquier cambio del bot. Usa el proveedor/modelo y la API key de la pestaña Chat.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button onClick={handleCorrerBanco} disabled={corriendoBanco} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                                    {corriendoBanco ? "Corriendo banco..." : "▶ Correr banco completo"}
                                </Button>
                                <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                    <span>Evaluando con:</span>
                                    <Badge variant="outline" className="font-mono text-xs bg-white text-slate-800">
                                        {presetSeleccionado.startsWith("deepseek") ? "DeepSeek" : "OpenAI"}: {modelo}
                                    </Badge>
                                    <button
                                        type="button"
                                        onClick={abrirModalModelo}
                                        className="text-blue-600 hover:underline font-medium ml-1"
                                    >
                                        Cambiar
                                    </button>
                                </div>
                            </div>

                            {reporteBanco && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3 text-sm">
                                        <Badge className={reporteBanco.fallados === 0 ? "bg-emerald-600" : "bg-amber-600"}>
                                            {reporteBanco.pasados}/{reporteBanco.total} OK
                                        </Badge>
                                        <span className="text-slate-500 text-xs">
                                            {new Date(reporteBanco.corridoEn).toLocaleString("es-AR")}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {reporteBanco.resultados.map((r) => (
                                            <div
                                                key={r.id}
                                                className={`rounded border p-2 text-xs ${
                                                    r.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"
                                                }`}
                                            >
                                                <div className="font-semibold flex items-center gap-1.5">
                                                    {r.ok ? (
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                                    ) : (
                                                        <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                                                    )}
                                                    {r.titulo}
                                                </div>
                                                {!r.ok && (
                                                    <ul className="mt-1 ml-5 list-disc text-rose-800">
                                                        {r.fallos.map((f, i) => (
                                                            <li key={i}>{f}</li>
                                                        ))}
                                                        {r.error && <li>error: {r.error}</li>}
                                                    </ul>
                                                )}
                                                <div className="mt-1 text-slate-500">
                                                    herramientas: {r.observado.herramientas.join(", ") || "ninguna"} · escalado:{" "}
                                                    {String(r.observado.escaladoHumano)} · {(r.observado.latenciaMs / 1000).toFixed(1)}s
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 2: AJUSTES DE ESTILO Y PALABRAS */}
                <TabsContent value="ajustes" className="space-y-4">
                    {/* Claves de API de Inteligencia Artificial */}
                    <Card className="border-cyan-200 bg-cyan-50/40">
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Key className="h-5 w-5 text-cyan-700" />
                                    <div>
                                        <CardTitle className="text-base text-cyan-950">Claves de API de Inteligencia Artificial</CardTitle>
                                        <CardDescription className="text-xs text-cyan-700">
                                            Cargá acá tus claves una sola vez y quedan guardadas en la base de datos de tu tienda.
                                        </CardDescription>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={abrirModalModelo}
                                    className="text-xs bg-white text-cyan-950 border-cyan-300 hover:bg-cyan-100 gap-1.5 shadow-2xs"
                                >
                                    <Cpu className="h-3.5 w-3.5 text-blue-600" />
                                    ⚡ Asistente de Cambio de Modelo
                                </Button>
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
                                        <span>DeepSeek API Key (deepseek-v4-flash / deepseek-chat):</span>
                                        <span className="text-[10px] text-blue-700 font-medium">Chatwoot 2.0</span>
                                    </label>
                                    <Input
                                        type="password"
                                        value={config.deepseekApiKey || ""}
                                        onChange={(e) => setConfig({ ...config, deepseekApiKey: e.target.value })}
                                        placeholder="sk-..."
                                        className="bg-white text-xs"
                                    />
                                    <p className="text-[10px] text-slate-500">
                                        Para usar DeepSeek (el modelo ultrarrápido y de bajo costo de Chatwoot 2.0).
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

                            {/* Cadencia y Debounce de Ráfagas */}
                            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                                            <Clock className="h-4 w-4 text-cyan-700" />
                                            Debounce de ráfagas y simulación de cadencia humana
                                        </span>
                                        <span className="text-xs text-slate-500 block mt-0.5">
                                            Espera un tiempo mínimo de silencio antes de procesar los mensajes del cliente, permitiendo capturar múltiples mensajes seguidos en una sola respuesta humana y evitando respuestas automáticas sospechosas.
                                        </span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={config.debounceActivo}
                                        onChange={(e) => setConfig({ ...config, debounceActivo: e.target.checked })}
                                        className="h-5 w-5 text-cyan-600 rounded ml-4"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 text-xs">
                                    <label className="font-semibold text-slate-700 whitespace-nowrap">
                                        Tiempo de espera / debounce (segundos):
                                    </label>
                                    <Input
                                        type="number"
                                        min={10}
                                        max={300}
                                        value={config.debounceSegundos || 60}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10) || 60
                                            setConfig({ ...config, debounceSegundos: val })
                                            setDebounceSegundos(val)
                                        }}
                                        className="w-24 bg-white text-xs h-8"
                                    />
                                    <span className="text-slate-500">
                                        (Recomendado: 60 segundos mínimo para WhatsApp)
                                    </span>
                                </div>
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

            {/* MODAL: CONFIGURACIÓN DE MODELO IA / DEEPSEEK */}
            <Dialog open={modalModeloAbierto} onOpenChange={setModalModeloAbierto}>
                <DialogContent className="max-w-xl sm:max-w-2xl bg-white p-0 overflow-hidden border border-slate-200 shadow-2xl">
                    <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-400/30 shrink-0">
                                <Cpu className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-white">
                                    Configurar Proveedor y Modelo de IA
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                    Elegí qué modelo y proveedor usar para el bot de WhatsApp (DeepSeek, ChatGPT u otros) y cargá tu API Key.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                        {/* Selector de Proveedor Principal */}
                        <div>
                            <label className="text-xs font-semibold text-slate-700 block mb-2">
                                Elegí el proveedor de IA:
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* Tarjeta DeepSeek */}
                                <button
                                    type="button"
                                    onClick={() => handleCambiarProveedorModal("deepseek")}
                                    className={`text-left p-3.5 rounded-lg border-2 transition-all relative ${
                                        tempProveedor === "deepseek"
                                            ? "border-blue-600 bg-blue-50/60 shadow-xs"
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                            <Zap className="h-4 w-4 text-blue-600" />
                                            DeepSeek
                                        </span>
                                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-[10px] px-1.5 py-0 border-0 font-medium">
                                            Chatwoot 2.0
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-tight">
                                        Ultra rápido y económico. Soporta deepseek-v4-flash y deepseek-chat.
                                    </p>
                                </button>

                                {/* Tarjeta OpenAI */}
                                <button
                                    type="button"
                                    onClick={() => handleCambiarProveedorModal("openai")}
                                    className={`text-left p-3.5 rounded-lg border-2 transition-all ${
                                        tempProveedor === "openai"
                                            ? "border-emerald-600 bg-emerald-50/60 shadow-xs"
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                            <Bot className="h-4 w-4 text-emerald-600" />
                                            OpenAI
                                        </span>
                                        <Badge variant="outline" className="text-[10px] text-slate-600 px-1.5 py-0">
                                            ChatGPT
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-tight">
                                        Modelos oficiales de OpenAI: GPT-4o Mini y GPT-4o.
                                    </p>
                                </button>

                                {/* Tarjeta OpenRouter / Otro */}
                                <button
                                    type="button"
                                    onClick={() => handleCambiarProveedorModal("openrouter")}
                                    className={`text-left p-3.5 rounded-lg border-2 transition-all ${
                                        tempProveedor === "openrouter" || tempProveedor === "custom"
                                            ? "border-indigo-600 bg-indigo-50/60 shadow-xs"
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                            <Sliders className="h-4 w-4 text-indigo-600" />
                                            OpenRouter
                                        </span>
                                        <Badge variant="outline" className="text-[10px] text-indigo-700 px-1.5 py-0 border-indigo-200">
                                            Multi
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-tight">
                                        Claude 3.5 Sonnet, Llama 3 o cualquier endpoint personalizado.
                                    </p>
                                </button>
                            </div>
                        </div>

                        {/* Opciones específicas según proveedor */}
                        {tempProveedor === "deepseek" && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-800 block mb-1.5">
                                        Modelo DeepSeek:
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label
                                            className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-all ${
                                                tempModelo === "deepseek-v4-flash"
                                                    ? "border-blue-500 bg-blue-50/70 text-blue-950 font-medium"
                                                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="deepseek_model"
                                                className="mt-0.5 text-blue-600"
                                                checked={tempModelo === "deepseek-v4-flash"}
                                                onChange={() => setTempModelo("deepseek-v4-flash")}
                                            />
                                            <div className="text-xs">
                                                <div className="font-semibold text-slate-900 flex items-center gap-1">
                                                    deepseek-v4-flash
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-normal">Recomendado</span>
                                                </div>
                                                <div className="text-[11px] text-slate-500">Configurado en Chatwoot 2.0</div>
                                            </div>
                                        </label>

                                        <label
                                            className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-all ${
                                                tempModelo === "deepseek-chat"
                                                    ? "border-blue-500 bg-blue-50/70 text-blue-950 font-medium"
                                                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="deepseek_model"
                                                className="mt-0.5 text-blue-600"
                                                checked={tempModelo === "deepseek-chat"}
                                                onChange={() => setTempModelo("deepseek-chat")}
                                            />
                                            <div className="text-xs">
                                                <div className="font-semibold text-slate-900">deepseek-chat (V3)</div>
                                                <div className="text-[11px] text-slate-500">Modelo estándar de la API oficial</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-700">
                                            Nombre del modelo (editable):
                                        </label>
                                        <Input
                                            value={tempModelo}
                                            onChange={(e) => setTempModelo(e.target.value)}
                                            placeholder="deepseek-v4-flash"
                                            className="h-8 text-xs bg-white font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-700">
                                            Base URL de la API:
                                        </label>
                                        <Input
                                            value={tempBaseUrl}
                                            onChange={(e) => setTempBaseUrl(e.target.value)}
                                            placeholder="https://api.deepseek.com"
                                            className="h-8 text-xs bg-white font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {tempProveedor === "openai" && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-800 block mb-1.5">
                                        Modelo OpenAI:
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {[
                                            { id: "gpt-5-mini", desc: "Equilibrado: rápido, barato y buen tool calling (recomendado)" },
                                            { id: "gpt-5", desc: "Máxima capacidad de razonamiento" },
                                            { id: "gpt-4o-mini", desc: "Generación anterior, económico" },
                                            { id: "gpt-4o", desc: "Generación anterior, más capaz" },
                                        ].map((m) => (
                                            <label
                                                key={m.id}
                                                className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-all ${
                                                    tempModelo === m.id
                                                        ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium"
                                                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="openai_model"
                                                    className="mt-0.5 text-emerald-600"
                                                    checked={tempModelo === m.id}
                                                    onChange={() => setTempModelo(m.id)}
                                                />
                                                <div className="text-xs">
                                                    <div className="font-semibold text-slate-900">{m.id}</div>
                                                    <div className="text-[11px] text-slate-500">{m.desc}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-800 block mb-1">
                                        O escribí el nombre exacto de otro modelo de OpenAI:
                                    </label>
                                    <Input
                                        value={tempModelo}
                                        onChange={(e) => setTempModelo(e.target.value)}
                                        placeholder="gpt-5-mini"
                                        className="bg-white text-xs h-8"
                                    />
                                </div>
                            </div>
                        )}

                        {tempProveedor === "openrouter" && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-700">Modelo OpenRouter:</label>
                                        <Input
                                            value={tempModelo}
                                            onChange={(e) => setTempModelo(e.target.value)}
                                            placeholder="anthropic/claude-3.5-sonnet"
                                            className="h-8 text-xs bg-white font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-700">Base URL:</label>
                                        <Input
                                            value={tempBaseUrl}
                                            onChange={(e) => setTempBaseUrl(e.target.value)}
                                            placeholder="https://openrouter.ai/api/v1"
                                            className="h-8 text-xs bg-white font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Input de API Key */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Key className="h-3.5 w-3.5 text-slate-600" />
                                    <span>
                                        API Key de {tempProveedor === "deepseek" ? "DeepSeek" : tempProveedor === "openai" ? "OpenAI" : "OpenRouter"}:
                                    </span>
                                </label>
                                {tempProveedor === "deepseek" && (
                                    <a
                                        href="https://platform.deepseek.com/api_keys"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                                    >
                                        Obtener clave en platform.deepseek.com
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                            </div>

                            <div className="relative">
                                <Input
                                    type={tempMostrarKey ? "text" : "password"}
                                    value={tempApiKey}
                                    onChange={(e) => {
                                        setTempApiKey(e.target.value)
                                        setResultadoPrueba(null)
                                    }}
                                    placeholder={
                                        tempProveedor === "deepseek"
                                            ? "sk-..."
                                            : tempProveedor === "openai"
                                            ? "sk-proj-..."
                                            : "sk-or-..."
                                    }
                                    className="h-9 text-xs bg-white pr-10 font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setTempMostrarKey(!tempMostrarKey)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {tempMostrarKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">
                                Al guardar, la clave se almacenará de forma segura en <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">chat_config</code> para el bot de WhatsApp y en el navegador para este simulador.
                            </p>
                        </div>

                        {/* Resultado de la prueba de conexión */}
                        {resultadoPrueba && (
                            <div
                                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                                    resultadoPrueba.ok
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                                        : "bg-rose-50 border-rose-300 text-rose-900"
                                }`}
                            >
                                {resultadoPrueba.ok ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <div className="font-semibold">
                                        {resultadoPrueba.ok ? "Conexión exitosa" : "Error al conectar con la API"}
                                    </div>
                                    <div className="text-[11px] mt-0.5 opacity-90">{resultadoPrueba.mensaje}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleProbarConexion}
                            disabled={probandoConexion || !tempApiKey.trim()}
                            className="gap-1.5 text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
                        >
                            {probandoConexion ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                    Probando handshake...
                                </>
                            ) : (
                                <>
                                    <Zap className="h-3.5 w-3.5 text-blue-600" />
                                    Probar Conexión
                                </>
                            )}
                        </Button>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setModalModeloAbierto(false)}
                                className="text-xs text-slate-600"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleGuardarModeloModal}
                                disabled={guardandoModelo}
                                className="gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-xs font-semibold px-4"
                            >
                                {guardandoModelo ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-3.5 w-3.5" />
                                        Guardar y Activar Modelo
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
