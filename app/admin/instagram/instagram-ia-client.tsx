"use client"

import React, { useState, useEffect, useRef, useTransition } from "react"
import {
  Sparkles,
  Send,
  RefreshCw,
  RotateCcw,
  Bot,
  User,
  Copy,
  Check,
  TrendingUp,
  DollarSign,
  Layers,
  MessageSquare,
  AlertCircle,
  BarChart3,
  Lightbulb,
  ArrowRight
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  consultarIAInstagramAction,
  obtenerResumenInicialIAAction,
  MensajeChatIA,
  RespuestaIAConsulta
} from "@/app/actions/instagram-ia"
import { InstagramDashboardResult } from "@/app/actions/instagram-dashboard"
import { MarketingPerformanceResult } from "@/app/actions/marketing"

interface Props {
  initialGeneralData?: InstagramDashboardResult
  initialMarketingData?: MarketingPerformanceResult
}

const PRESETS = [
  { id: "last_15d", label: "Últimos 15 días" },
  { id: "last_30d", label: "Últimos 30 días" },
  { id: "last_7d", label: "Últimos 7 días" },
  { id: "this_month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" }
]

const SUGGESTIONS = [
  "¿Cuáles son las campañas más rentables y cuál tiene mejor POAS?",
  "¿Qué campañas están en estado crítico o quemando plata sin ventas?",
  "¿Cuáles son los repuestos y kits que más se vendieron y cuánto facturaron?",
  "¿Cómo está el costo por mensaje y la tasa de conversión a venta?",
  "¿Qué 3 decisiones comerciales o ajustes me recomendás hacer hoy?"
]

/**
 * Renderizador de texto markdown simple para formatear negritas, listas y saltos de línea.
 */
function MarkdownRenderer({ text }: { text: string }) {
  const lineas = text.split("\n")

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {lineas.map((linea, idx) => {
        const trimmed = linea.trim()

        if (!trimmed) {
          return <div key={idx} className="h-1.5" />
        }

        // Encabezados estilo markdown (### o ## o #)
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-slate-900 text-sm mt-3 mb-1 border-b pb-1">
              {renderPartesTexto(trimmed.replace(/^###\s+/, ""))}
            </h4>
          )
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-bold text-slate-900 text-base mt-4 mb-1 border-b pb-1">
              {renderPartesTexto(trimmed.replace(/^##\s+/, ""))}
            </h3>
          )
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={idx} className="font-bold text-slate-900 text-lg mt-4 mb-2 border-b pb-1">
              {renderPartesTexto(trimmed.replace(/^#\s+/, ""))}
            </h2>
          )
        }

        // Viñetas estilo markdown (* o - o numeradas)
        if (/^[-*•]\s+/.test(trimmed)) {
          const contenidoViñeta = trimmed.replace(/^[-*•]\s+/, "")
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-purple-600 font-bold mt-0.5">•</span>
              <div className="flex-1">{renderPartesTexto(contenidoViñeta)}</div>
            </div>
          )
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)$/)
          if (match) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-purple-700 font-semibold text-xs min-w-4 mt-0.5">{match[1]}.</span>
                <div className="flex-1">{renderPartesTexto(match[2])}</div>
              </div>
            )
          }
        }

        return <p key={idx}>{renderPartesTexto(linea)}</p>
      })}
    </div>
  )
}

function renderPartesTexto(texto: string) {
  // Manejo de negritas con **texto**
  const regex = /(\*\*[^*]+\*\*)/g
  const partes = texto.split(regex)

  return partes.map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-950">
          {parte.slice(2, -2)}
        </strong>
      )
    }
    return <React.Fragment key={i}>{parte}</React.Fragment>
  })
}

export function InstagramIaClient({ initialGeneralData, initialMarketingData }: Props) {
  const [preset, setPreset] = useState<string>(initialGeneralData?.filtros.preset || "last_15d")
  const [mensajes, setMensajes] = useState<MensajeChatIA[]>([])
  const [inputTexto, setInputTexto] = useState("")
  const [cargando, setCargando] = useState(false)
  const [errorChat, setErrorChat] = useState<string | null>(null)
  const [copiadoIdx, setCopiadoIdx] = useState<number | null>(null)
  const [datosContexto, setDatosContexto] = useState<RespuestaIAConsulta["datosContexto"] | null>(null)
  const [isPending, startTransition] = useTransition()

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll al final al agregar mensajes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [mensajes, cargando])

  // Cargar resumen inicial al montar el componente
  useEffect(() => {
    cargarResumenInicial(preset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cargarResumenInicial = async (selectedPreset: string) => {
    setCargando(true)
    setErrorChat(null)
    setMensajes([])

    try {
      const res = await obtenerResumenInicialIAAction({ preset: selectedPreset })
      if (res.ok && res.respuesta) {
        setMensajes([
          {
            rol: "assistant",
            contenido: res.respuesta,
            timestamp: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
          }
        ])
        if (res.datosContexto) {
          setDatosContexto(res.datosContexto)
        }
      } else {
        setErrorChat(res.error || "No se pudo generar el resumen inicial.")
      }
    } catch (err: any) {
      setErrorChat(err?.message || "Error al comunicarse con DeepSeek.")
    } finally {
      setCargando(false)
    }
  }

  const handleEnviarMensaje = async (textoAEnviar?: string) => {
    const texto = (textoAEnviar || inputTexto).trim()
    if (!texto || cargando) return

    setInputTexto("")
    setErrorChat(null)

    const nuevoMsgUsuario: MensajeChatIA = {
      rol: "user",
      contenido: texto,
      timestamp: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    }

    const nuevoHistorial = [...mensajes, nuevoMsgUsuario]
    setMensajes(nuevoHistorial)
    setCargando(true)

    try {
      const res = await consultarIAInstagramAction({
        mensaje: texto,
        historial: mensajes,
        preset
      })

      if (res.ok && res.respuesta) {
        setMensajes([
          ...nuevoHistorial,
          {
            rol: "assistant",
            contenido: res.respuesta,
            timestamp: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
          }
        ])
        if (res.datosContexto) {
          setDatosContexto(res.datosContexto)
        }
      } else {
        setErrorChat(res.error || "No se pudo obtener respuesta de la IA.")
      }
    } catch (err: any) {
      setErrorChat(err?.message || "Error al enviar la consulta.")
    } finally {
      setCargando(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleEnviarMensaje()
    }
  }

  const handleCambiarPreset = (nuevoPreset: string) => {
    setPreset(nuevoPreset)
    startTransition(() => {
      cargarResumenInicial(nuevoPreset)
    })
  }

  const copiarMensaje = (texto: string, idx: number) => {
    navigator.clipboard.writeText(texto)
    setCopiadoIdx(idx)
    setTimeout(() => setCopiadoIdx(null), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Barra de Controles y Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg border border-purple-100 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-base">Consulta IA de Rendimiento</h3>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                DeepSeek Conectado
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Analiza en simultáneo los datos del <strong>Panel General</strong> y del <strong>Tablero de Salud</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Presets */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleCambiarPreset(p.id)}
                disabled={cargando || isPending}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  preset === p.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => cargarResumenInicial(preset)}
            disabled={cargando || isPending}
            className="text-xs flex items-center gap-1.5"
            title="Recargar datos y reiniciar resumen"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando || isPending ? "animate-spin" : ""}`} />
            Actualizar
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMensajes([])
              cargarResumenInicial(preset)
            }}
            disabled={cargando}
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
            title="Limpiar chat"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar
          </Button>
        </div>
      </div>

      {/* Mini Banner de Contexto de Datos (si están disponibles) */}
      {datosContexto && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              Ventas Brutas Periodo
            </div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              ${Math.round(datosContexto.ventasBrutas).toLocaleString("es-AR")}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              Gasto Publicitario Meta
            </div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              ${Math.round(datosContexto.gastoMeta).toLocaleString("es-AR")}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
              ROAS Facturación
            </div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {datosContexto.roas.toFixed(2)}x
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              Campañas Analizadas
            </div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {datosContexto.totalCampanas} activas
            </div>
          </div>
        </div>
      )}

      {/* Sugerencias Rápidas */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 whitespace-nowrap pl-1">
          <Lightbulb className="w-3 h-3 text-amber-500" />
          Preguntas sugeridas:
        </span>
        {SUGGESTIONS.map((sug, idx) => (
          <button
            key={idx}
            onClick={() => handleEnviarMensaje(sug)}
            disabled={cargando}
            className="text-xs bg-slate-100 hover:bg-purple-50 hover:text-purple-800 text-slate-700 px-3 py-1.5 rounded-full border border-slate-200 whitespace-nowrap transition-colors flex items-center gap-1 shrink-0"
          >
            {sug}
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
        ))}
      </div>

      {/* Contenedor Principal del Chat */}
      <Card className="border-slate-200 shadow-sm flex flex-col h-[600px] bg-white">
        {/* Mensajes */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensajes.length === 0 && cargando && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center animate-bounce">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-base">Analizando datos de ambas pestañas...</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Consultando métricas de ventas, gasto en Meta Ads, salud de campañas y rendimiento de productos para armar el resumen inicial.
                </p>
              </div>
            </div>
          )}

          {mensajes.map((msg, index) => {
            const esUsuario = msg.rol === "user"
            return (
              <div
                key={index}
                className={`flex gap-3 items-start group ${
                  esUsuario ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    esUsuario
                      ? "bg-slate-900 text-white"
                      : "bg-purple-600 text-white shadow-xs"
                  }`}
                >
                  {esUsuario ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>

                {/* Burbuja de Mensaje */}
                <div
                  className={`relative max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 text-sm ${
                    esUsuario
                      ? "bg-slate-900 text-white rounded-tr-none"
                      : "bg-slate-50 border border-slate-200 rounded-tl-none text-slate-900 shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span
                      className={`text-[11px] font-medium ${
                        esUsuario ? "text-slate-300" : "text-purple-800"
                      }`}
                    >
                      {esUsuario ? "Martín" : "DeepSeek IA - Analista"}
                    </span>
                    {msg.timestamp && (
                      <span
                        className={`text-[10px] ${
                          esUsuario ? "text-slate-400" : "text-slate-400"
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    )}
                  </div>

                  {esUsuario ? (
                    <div className="whitespace-pre-wrap">{msg.contenido}</div>
                  ) : (
                    <MarkdownRenderer text={msg.contenido} />
                  )}

                  {/* Botón copiar en mensajes del asistente */}
                  {!esUsuario && (
                    <button
                      onClick={() => copiarMensaje(msg.contenido, index)}
                      className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copiar respuesta"
                    >
                      {copiadoIdx === index ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Indicador de "Escribiendo..." */}
          {cargando && mensajes.length > 0 && (
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-500 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce [animation-delay:0.4s]"></span>
                </div>
                <span>Analizando datos y redactando respuesta...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorChat && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <div className="flex-1">{errorChat}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setErrorChat(null)}
                className="h-6 px-2 text-xs text-red-700 hover:bg-red-100"
              >
                Cerrar
              </Button>
            </div>
          )}
        </div>

        {/* Input y Barra Inferior */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl space-y-2">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={inputTexto}
              onChange={(e) => setInputTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preguntale a la IA sobre tus campañas, ventas, costos por mensaje o qué ajustar... (Enter para enviar)"
              disabled={cargando}
              rows={2}
              className="min-h-[50px] max-h-[120px] resize-none bg-white text-sm focus-visible:ring-purple-500"
            />
            <Button
              onClick={() => handleEnviarMensaje()}
              disabled={cargando || !inputTexto.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white h-[50px] px-4 shrink-0 flex items-center gap-1.5"
            >
              {cargando ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs font-semibold">Preguntar</span>
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Presiona <strong>Enter</strong> para enviar, <strong>Shift + Enter</strong> para salto de línea.</span>
            <span>Grounding 100% estricto con los datos de las dos pestañas.</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
