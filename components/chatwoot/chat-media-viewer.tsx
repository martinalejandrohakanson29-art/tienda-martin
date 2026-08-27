"use client"

import { useEffect, useRef, useState, useId } from "react"
import {
    Play,
    Pause,
    Loader2,
    Download,
    ExternalLink,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    X,
    Mic,
    FileText,
    AlertCircle,
    Maximize2,
    Check,
    CheckCheck,
    Clock,
} from "lucide-react"
import type { AdjuntoConversacion, EstadoMensaje } from "@/lib/chatwoot-bot"

function formatearSegundos(segundos: number): string {
    if (!Number.isFinite(segundos) || segundos < 0) return "0:00"
    const mins = Math.floor(segundos / 60)
    const segs = Math.floor(segundos % 60)
    return `${mins}:${segs < 10 ? "0" : ""}${segs}`
}

function formatearTamano(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Reproductor de notas de voz / audios estilo WhatsApp
 */
export function AudioPlayerMensaje({
    url,
    saliente = false,
    transcripcion,
    nombre,
}: {
    url: string
    saliente?: boolean
    transcripcion?: string | null
    nombre?: string | null
}) {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const audioId = useId()

    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [playbackRate, setPlaybackRate] = useState<number>(1)
    const [isLoading, setIsLoading] = useState(false)
    const [hasError, setHasError] = useState(false)
    const [verTranscripcion, setVerTranscripcion] = useState(false)

    // Pausar si otro audio en la página comienza a reproducirse
    useEffect(() => {
        const handlePausarOtros = (e: Event) => {
            const custom = e as CustomEvent<{ id: string }>
            if (custom.detail?.id !== audioId && audioRef.current && !audioRef.current.paused) {
                audioRef.current.pause()
                setIsPlaying(false)
            }
        }
        window.addEventListener("chatwoot-pausar-otros-audios", handlePausarOtros)
        return () => {
            window.removeEventListener("chatwoot-pausar-otros-audios", handlePausarOtros)
        }
    }, [audioId])

    const togglePlay = () => {
        if (!audioRef.current || hasError) return
        if (isPlaying) {
            audioRef.current.pause()
            setIsPlaying(false)
        } else {
            // Notificar a otros reproductores para que se pausen
            window.dispatchEvent(
                new CustomEvent("chatwoot-pausar-otros-audios", { detail: { id: audioId } })
            )
            setIsLoading(true)
            audioRef.current
                .play()
                .then(() => {
                    setIsPlaying(true)
                    setIsLoading(false)
                })
                .catch((err) => {
                    console.error("Error reproduciendo audio:", err)
                    setIsLoading(false)
                    setHasError(true)
                })
        }
    }

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nuevoTiempo = Number(e.target.value)
        setCurrentTime(nuevoTiempo)
        if (audioRef.current) {
            audioRef.current.currentTime = nuevoTiempo
        }
    }

    const cambiarVelocidad = () => {
        const velocidades = [1, 1.5, 2]
        const idxActual = velocidades.indexOf(playbackRate)
        const siguiente = velocidades[(idxActual + 1) % velocidades.length]
        setPlaybackRate(siguiente)
        if (audioRef.current) {
            audioRef.current.playbackRate = siguiente
        }
    }

    const progreso = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
        <div className="w-full min-w-[220px] max-w-[310px] sm:max-w-[330px] my-1 select-none">
            <audio
                ref={audioRef}
                src={url}
                preload="metadata"
                onLoadedMetadata={(e) => {
                    const dur = e.currentTarget.duration
                    if (Number.isFinite(dur) && dur > 0) {
                        setDuration(dur)
                    }
                }}
                onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime)
                    const dur = e.currentTarget.duration
                    if (Number.isFinite(dur) && dur > 0 && duration === 0) {
                        setDuration(dur)
                    }
                }}
                onEnded={() => {
                    setIsPlaying(false)
                    setCurrentTime(0)
                }}
                onError={() => {
                    setIsLoading(false)
                    setHasError(true)
                }}
                onWaiting={() => setIsLoading(true)}
                onPlaying={() => {
                    setIsLoading(false)
                    setIsPlaying(true)
                }}
            />

            <div
                className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
                    saliente ? "bg-[#c6f8be]/80" : "bg-gray-100/90"
                }`}
            >
                {/* Botón de Play / Pause */}
                <button
                    type="button"
                    onClick={togglePlay}
                    disabled={hasError}
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-95 ${
                        hasError
                            ? "bg-red-100 text-red-500 cursor-not-allowed"
                            : saliente
                              ? "bg-[#00a884] text-white hover:bg-[#008f6f]"
                              : "bg-[#00a884] text-white hover:bg-[#008f6f]"
                    }`}
                    title={isPlaying ? "Pausar" : "Reproducir audio"}
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : hasError ? (
                        <AlertCircle className="h-4 w-4" />
                    ) : isPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                    ) : (
                        <Play className="h-4 w-4 fill-current ml-0.5" />
                    )}
                </button>

                {/* Barra de progreso y tiempos */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="relative flex items-center h-4 w-full group">
                        <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            value={currentTime}
                            onChange={handleSeek}
                            disabled={hasError || duration === 0}
                            className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#00a884] focus:outline-none"
                            style={{
                                background: `linear-gradient(to right, #00a884 ${progreso}%, ${saliente ? "#a3e69f" : "#d1d5db"} ${progreso}%)`,
                            }}
                        />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium px-0.5 -mt-0.5">
                        <span>{formatearSegundos(currentTime)}</span>
                        <span>{duration > 0 ? formatearSegundos(duration) : <Mic className="h-2.5 w-2.5 inline" />}</span>
                    </div>
                </div>

                {/* Botón de velocidad */}
                <button
                    type="button"
                    onClick={cambiarVelocidad}
                    className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-black/10 hover:bg-black/15 text-gray-700 transition-colors shrink-0"
                    title="Cambiar velocidad de reproducción"
                >
                    {playbackRate}x
                </button>

                {/* Descarga / enlace directo */}
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={nombre || "audio.aac"}
                    className="text-gray-400 hover:text-gray-700 p-1 shrink-0 transition-colors"
                    title="Descargar o abrir audio"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Download className="h-3.5 w-3.5" />
                </a>
            </div>

            {hasError && (
                <p className="text-[10px] text-red-500 mt-1 px-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 inline shrink-0" />
                    No se pudo cargar el audio.{" "}
                    <a href={url} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                        Abrir directo
                    </a>
                </p>
            )}

            {transcripcion && (
                <div className="mt-1 px-1">
                    <button
                        type="button"
                        onClick={() => setVerTranscripcion((v) => !v)}
                        className="text-[10px] text-emerald-700 font-medium hover:underline flex items-center gap-1"
                    >
                        <span>📝 {verTranscripcion ? "Ocultar transcripción" : "Ver transcripción"}</span>
                    </button>
                    {verTranscripcion && (
                        <p className="text-xs text-gray-700 bg-white/70 rounded-md p-1.5 mt-1 border border-gray-200/60 whitespace-pre-wrap">
                            {transcripcion}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * Preview de imagen con efecto hover y click para abrir modal
 */
export function ImagePreviewMensaje({
    url,
    thumbUrl,
    nombre,
    onOpenLightbox,
}: {
    url: string
    thumbUrl?: string | null
    nombre?: string | null
    onOpenLightbox: (url: string, nombre?: string | null) => void
}) {
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState(false)

    const fuente = thumbUrl || url

    return (
        <div
            onClick={() => onOpenLightbox(url, nombre)}
            className="relative group cursor-pointer overflow-hidden rounded-lg border border-black/5 bg-gray-100 max-w-[280px] sm:max-w-[340px] my-1 shadow-sm transition-all hover:shadow-md"
            title="Hacé clic para ver la imagen en tamaño completo"
        >
            {cargando && !error && (
                <div className="h-48 w-full flex items-center justify-center bg-gray-100 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
            )}

            {error ? (
                <div className="p-4 flex flex-col items-center justify-center gap-1 bg-red-50 text-red-600 text-xs">
                    <AlertCircle className="h-5 w-5" />
                    <span>No se pudo cargar la imagen</span>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] underline font-semibold mt-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        Abrir original
                    </a>
                </div>
            ) : (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={fuente}
                        alt={nombre || "Imagen adjunta"}
                        onLoad={() => setCargando(false)}
                        onError={() => {
                            setCargando(false)
                            setError(true)
                        }}
                        className={`w-full max-h-[320px] object-cover rounded-lg transition-transform duration-200 group-hover:scale-[1.02] ${
                            cargando ? "hidden" : "block"
                        }`}
                    />

                    {/* Overlay al pasar el mouse */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-medium backdrop-blur-[1px]">
                        <Maximize2 className="h-4 w-4" />
                        <span>Ver foto</span>
                    </div>
                </>
            )}
        </div>
    )
}

/**
 * Reproductor de video integrado
 */
export function VideoPlayerMensaje({ url, nombre }: { url: string; nombre?: string | null }) {
    return (
        <div className="max-w-[280px] sm:max-w-[340px] my-1 rounded-lg overflow-hidden border border-black/5 bg-black shadow-sm">
            <video
                src={url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[320px] object-contain rounded-lg"
            >
                Tu navegador no soporta reproducción de video.
            </video>
            {nombre && <p className="text-[10px] text-gray-300 px-2 py-0.5 truncate bg-black/60">{nombre}</p>}
        </div>
    )
}

/**
 * Tarjeta de archivo / documento genérico
 */
export function FileAttachmentMensaje({
    url,
    nombre,
    tamano,
    saliente = false,
}: {
    url: string
    nombre?: string | null
    tamano?: number | null
    saliente?: boolean
}) {
    const nombreFinal = nombre || url.split("/").pop()?.split("?")[0] || "documento"

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={nombreFinal}
            className={`flex items-center gap-3 p-2.5 my-1 rounded-xl border transition-all max-w-[280px] sm:max-w-[320px] hover:shadow-sm ${
                saliente
                    ? "bg-[#c6f8be]/80 border-[#a3e69f] hover:bg-[#bbf0b3]"
                    : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
        >
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{nombreFinal}</p>
                {tamano && tamano > 0 && (
                    <p className="text-[10px] text-gray-500">{formatearTamano(tamano)}</p>
                )}
            </div>
            <Download className="h-4 w-4 text-gray-500 hover:text-gray-800 shrink-0" />
        </a>
    )
}

/**
 * Componente agrupador que itera sobre la lista de adjuntos de un mensaje
 */
export function MensajeAdjuntos({
    adjuntos,
    saliente = false,
    onOpenLightbox,
}: {
    adjuntos?: AdjuntoConversacion[]
    saliente?: boolean
    onOpenLightbox: (url: string, nombre?: string | null) => void
}) {
    if (!adjuntos || adjuntos.length === 0) return null

    return (
        <div className="space-y-1.5 my-1">
            {adjuntos.map((att, idx) => {
                const tipo = (att.tipo || "").toLowerCase()
                const clave = att.id ? `${att.id}-${idx}` : `${att.url}-${idx}`

                if (tipo === "image") {
                    return (
                        <ImagePreviewMensaje
                            key={clave}
                            url={att.url}
                            thumbUrl={att.thumbUrl}
                            nombre={att.nombre}
                            onOpenLightbox={onOpenLightbox}
                        />
                    )
                }

                if (tipo === "audio") {
                    return (
                        <AudioPlayerMensaje
                            key={clave}
                            url={att.url}
                            saliente={saliente}
                            transcripcion={att.transcripcion}
                            nombre={att.nombre}
                        />
                    )
                }

                if (tipo === "video") {
                    return <VideoPlayerMensaje key={clave} url={att.url} nombre={att.nombre} />
                }

                return (
                    <FileAttachmentMensaje
                        key={clave}
                        url={att.url}
                        nombre={att.nombre}
                        tamano={att.tamano}
                        saliente={saliente}
                    />
                )
            })}
        </div>
    )
}

/**
 * Modal Lightbox a pantalla completa para visualizar imágenes con zoom y descarga
 */
export function ImageLightboxModal({
    isOpen,
    imageUrl,
    imageName,
    onClose,
}: {
    isOpen: boolean
    imageUrl: string | null
    imageName?: string | null
    onClose: () => void
}) {
    const [zoom, setZoom] = useState(1)

    useEffect(() => {
        if (!isOpen) {
            setZoom(1)
            return
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
            else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 3))
            else if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 0.5))
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen || !imageUrl) return null

    const zoomIn = () => setZoom((z) => Math.min(z + 0.5, 3))
    const zoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5))
    const resetZoom = () => setZoom(1)

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onClose}
        >
            {/* Barra superior de herramientas */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-black/60 border-b border-white/10 text-white z-10 select-none shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs md:text-sm font-medium truncate">
                        {imageName || "Foto adjunta"}
                    </span>
                    <span className="text-[11px] text-gray-400 font-mono bg-white/10 px-1.5 py-0.5 rounded">
                        {Math.round(zoom * 100)}%
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={zoomOut}
                        disabled={zoom <= 0.5}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
                        title="Reducir zoom (-)"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={zoomIn}
                        disabled={zoom >= 3}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
                        title="Aumentar zoom (+)"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={resetZoom}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        title="Restablecer tamaño normal"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>

                    <div className="h-4 w-px bg-white/20 mx-1" />

                    <a
                        href={imageUrl}
                        download={imageName || "foto.jpg"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        title="Descargar imagen"
                    >
                        <Download className="h-4 w-4" />
                    </a>
                    <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        title="Abrir en pestaña nueva"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>

                    <div className="h-4 w-px bg-white/20 mx-1" />

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/80 text-white transition-colors"
                        title="Cerrar (Esc)"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Contenedor central con la imagen escalada */}
            <div
                className="flex-1 flex items-center justify-center p-4 overflow-auto min-h-0"
                onClick={onClose}
            >
                <div
                    className="relative transition-transform duration-150 ease-out flex items-center justify-center max-w-full max-h-full"
                    style={{ transform: `scale(${zoom})` }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={imageName || "Foto adjunta"}
                        className="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-2xl select-none"
                    />
                </div>
            </div>
        </div>
    )
}

/**
 * Indicador de estado de entrega y lectura del mensaje enviado (estilo WhatsApp)
 */
export function CheckEstadoMensaje({ status }: { status?: EstadoMensaje }) {
    if (!status) return null

    switch (status.toLowerCase()) {
        case "read":
            return (
                <span title="Visto / Leído" className="inline-flex items-center ml-1 select-none">
                    <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                </span>
            )
        case "delivered":
            return (
                <span title="Entregado al destinatario" className="inline-flex items-center ml-1 select-none">
                    <CheckCheck className="h-3.5 w-3.5 text-[#8696a0]" />
                </span>
            )
        case "sent":
            return (
                <span title="Enviado" className="inline-flex items-center ml-1 select-none">
                    <Check className="h-3.5 w-3.5 text-[#8696a0]" />
                </span>
            )
        case "progress":
            return (
                <span title="Enviando..." className="inline-flex items-center ml-1 select-none">
                    <Clock className="h-3 w-3 text-[#8696a0] animate-pulse" />
                </span>
            )
        case "failed":
            return (
                <span title="No entregado" className="inline-flex items-center ml-1 select-none text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                </span>
            )
        default:
            return (
                <span title={status} className="inline-flex items-center ml-1 select-none">
                    <Check className="h-3.5 w-3.5 text-[#8696a0]" />
                </span>
            )
    }
}
