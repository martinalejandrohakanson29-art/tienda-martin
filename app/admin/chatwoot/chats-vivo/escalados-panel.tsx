"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react"
import {
    descartarEscaladoChatVivo,
    opcionesAprendizajeChatVivo,
    responderEscaladoTecnicoChatVivo,
    type EscaladoChatVivo,
    type OpcionesAprendizaje,
    type TipoEscalado,
} from "@/app/actions/chats-vivo"
import { textoIncompatibleSugerido, unirMensajeYDetalle, type DestinoCompat } from "@/lib/compat-mensaje"

/**
 * Escalados del bot dentro del chat, en dos formatos según cuánto pidan del equipo:
 *
 * - Compatibilidad (bandeja técnica): la tarjeta grande con el formulario, porque
 *   ahí la respuesta además se aprende y el bot la usa de acá en más.
 * - Todo lo demás (precio, negocio, sin resolver): un cartel de una línea en el
 *   hilo (`AvisoDerivacion`) que dice por qué se derivó y nada más. Antes también
 *   abrían tarjeta: con dos escalados abiertos el panel tapaba la conversación
 *   y no aportaba nada que no se resolviera contestando abajo como siempre.
 */

const ETIQUETA: Record<TipoEscalado, { texto: string; clase: string }> = {
    tecnica: { texto: "Técnica", clase: "bg-blue-100 text-blue-800 border-blue-200" },
    precio: { texto: "Precio / Stock", clase: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    negocio: { texto: "Negocio", clase: "bg-sky-100 text-sky-800 border-sky-200" },
    sin_match: { texto: "Sin resolver", clase: "bg-orange-100 text-orange-800 border-orange-200" },
}

const hora = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })

/** Mismo texto que arma el servidor, para previsualizarlo sin ida y vuelta. */
function mensajeSugerido(params: {
    compatible: boolean | null
    modeloMoto: string
    kitNombre: string
    detalle: string
    mensajeIncompatibilidad: string
}): string {
    if (params.compatible === null) return ""
    if (!params.compatible) {
        return textoIncompatibleSugerido(params.mensajeIncompatibilidad, params.modeloMoto, params.detalle)
    }
    return unirMensajeYDetalle(`Sí, el ${params.kitNombre} le va bien a tu ${params.modeloMoto.trim()}.`, params.detalle)
}

type FormTecnica = {
    modeloMoto: string
    destinoClave: string
    compatible: boolean | null
    detalle: string
    mensaje: string
    /** El equipo tocó el textarea: dejamos de regenerar el mensaje solo. */
    mensajeEditado: boolean
    enviarMensaje: boolean
    aplicarAPiezas: boolean
    reanudarBot: boolean
}

const claveDestino = (d: DestinoCompat) => `${d.tipo}:${d.id}`

export function EscaladosPanel({
    conversationId,
    escalados,
    onResuelto,
}: {
    conversationId: number
    /** Solo escalados de compatibilidad: el resto se dibuja en el hilo. */
    escalados: EscaladoChatVivo[]
    /** Avisa al panel padre que se cerró un escalado (para refrescar badges/lista). */
    onResuelto?: () => void
}) {
    const [cerrados, setCerrados] = useState<number[]>([])
    const [opciones, setOpciones] = useState<OpcionesAprendizaje | null>(null)
    const [fallo, setFallo] = useState<string | null>(null)
    const [exito, setExito] = useState<string | null>(null)
    const [formularios, setFormularios] = useState<Record<number, FormTecnica>>({})
    const [guardando, arrancarGuardado] = useTransition()

    const visibles = useMemo(() => escalados.filter((e) => !cerrados.includes(e.id)), [escalados, cerrados])

    // Las opciones (kits + texto de incompatibilidad) se piden una sola vez.
    const hayTecnica = visibles.length > 0
    useEffect(() => {
        if (!hayTecnica || opciones) return
        opcionesAprendizajeChatVivo()
            .then(setOpciones)
            .catch(() => setFallo("No se pudo leer el catálogo de kits"))
    }, [hayTecnica, opciones])

    const destinosPorClave = useMemo(() => {
        const mapa = new Map<string, DestinoCompat>()
        for (const d of opciones?.destinos ?? []) mapa.set(claveDestino(d), d)
        return mapa
    }, [opciones])

    const formDe = (item: EscaladoChatVivo): FormTecnica =>
        formularios[item.id] ?? {
            modeloMoto: item.modeloMoto || "",
            destinoClave: item.destinoSugerido ? claveDestino(item.destinoSugerido) : "",
            compatible: null,
            detalle: "",
            mensaje: "",
            mensajeEditado: false,
            enviarMensaje: true,
            aplicarAPiezas: false,
            reanudarBot: false,
        }

    const actualizarForm = (item: EscaladoChatVivo, patch: Partial<FormTecnica>) => {
        setFormularios((prev) => {
            const actual = prev[item.id] ?? formDe(item)
            const siguiente = { ...actual, ...patch }
            // El mensaje se regenera con cada cambio del veredicto/detalle hasta
            // que el equipo lo toque a mano: a partir de ahí manda lo que escribió.
            if (!siguiente.mensajeEditado && !("mensaje" in patch)) {
                const destino = destinosPorClave.get(siguiente.destinoClave)
                siguiente.mensaje = mensajeSugerido({
                    compatible: siguiente.compatible,
                    modeloMoto: siguiente.modeloMoto,
                    kitNombre: destino?.nombre || item.kit || "kit",
                    detalle: siguiente.detalle,
                    mensajeIncompatibilidad: opciones?.mensajeIncompatibilidad || "",
                })
            }
            return { ...prev, [item.id]: siguiente }
        })
    }

    const quitarDeLaLista = (id: number) => {
        setCerrados((prev) => [...prev, id])
        onResuelto?.()
    }

    const guardarTecnica = (item: EscaladoChatVivo) => {
        const form = formDe(item)
        const destino = destinosPorClave.get(form.destinoClave)
        if (!destino) {
            setFallo("Elegí a qué kit corresponde la compatibilidad.")
            return
        }
        if (!form.modeloMoto.trim()) {
            setFallo("Falta el modelo de moto.")
            return
        }
        if (form.compatible === null) {
            setFallo("Marcá si le va o no le va.")
            return
        }
        setFallo(null)
        setExito(null)
        arrancarGuardado(async () => {
            try {
                const res = await responderEscaladoTecnicoChatVivo({
                    pendienteId: item.id,
                    conversationId,
                    destino,
                    modeloMoto: form.modeloMoto.trim(),
                    compatible: form.compatible as boolean,
                    detalle: form.detalle,
                    aplicarAPiezas: form.aplicarAPiezas,
                    mensajeCliente: form.enviarMensaje ? form.mensaje : "",
                    reanudarBot: form.reanudarBot,
                })
                if (!res.success) {
                    setFallo(res.error)
                    return
                }
                const piezas = res.aprendido.filas.articulos
                setExito(
                    `Guardado: ${destino.nombre} ${form.compatible ? "le va" : "no le va"} a ${form.modeloMoto.trim()}` +
                        (piezas > 0 ? ` (+${piezas} piezas sueltas)` : "") +
                        (res.mensajeEnviado ? " · respuesta enviada" : " · sin mensaje al cliente")
                )
                quitarDeLaLista(item.id)
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo guardar la compatibilidad")
            }
        })
    }

    const descartar = (item: EscaladoChatVivo) => {
        setFallo(null)
        arrancarGuardado(async () => {
            try {
                await descartarEscaladoChatVivo(item.tipo, item.id)
                quitarDeLaLista(item.id)
            } catch (e) {
                setFallo(e instanceof Error ? e.message : "No se pudo descartar el escalado")
            }
        })
    }

    if (visibles.length === 0 && !exito) return null

    return (
        <div className="border-t border-amber-200 bg-amber-50/70 px-4 py-2.5 space-y-2 max-h-[44%] overflow-y-auto">
            {exito && (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> {exito}
                </p>
            )}
            {fallo && <p className="text-[11px] text-red-600">{fallo}</p>}

            {visibles.length > 0 && (
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {visibles.length === 1
                        ? "Compatibilidad sin resolver: cargala acá y el bot la aprende"
                        : `${visibles.length} compatibilidades sin resolver: cargalas acá y el bot las aprende`}
                </p>
            )}

            {visibles.map((item) => {
                const form = formDe(item)
                const destino = destinosPorClave.get(form.destinoClave)
                return (
                    <div key={`${item.tipo}-${item.id}`} className="rounded-lg border border-amber-200 bg-white p-2.5 shadow-sm">
                        <div className="flex items-start gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${ETIQUETA[item.tipo].clase}`}>
                                {ETIQUETA[item.tipo].texto}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-[#111b25] whitespace-pre-wrap break-words">{item.resumen}</p>
                                <p className="text-[10px] text-[#667781] mt-0.5">
                                    {hora(item.creadoEn)}
                                    {item.motivo ? ` · ${item.motivo}` : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => descartar(item)}
                                disabled={guardando}
                                title="Descartar sin cargar nada"
                                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 shrink-0"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    value={form.modeloMoto}
                                    onChange={(e) => actualizarForm(item, { modeloMoto: e.target.value })}
                                    placeholder="Moto (ej: Gilera Smash 110)"
                                    className="flex-1 min-w-[160px] rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                                <select
                                    value={form.destinoClave}
                                    onChange={(e) => actualizarForm(item, { destinoClave: e.target.value })}
                                    className="flex-1 min-w-[180px] rounded-md border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                                >
                                    <option value="">
                                        {opciones ? "Elegí el kit…" : "Cargando kits…"}
                                    </option>
                                    {(opciones?.destinos ?? []).map((d) => (
                                        <option key={claveDestino(d)} value={claveDestino(d)}>
                                            {d.nombre}
                                            {d.tipo === "grupo" ? " (combo con variantes)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => actualizarForm(item, { compatible: true })}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                        form.compatible === true
                                            ? "bg-emerald-600 text-white border-emerald-600"
                                            : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                    }`}
                                >
                                    Le va
                                </button>
                                <button
                                    type="button"
                                    onClick={() => actualizarForm(item, { compatible: false })}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                        form.compatible === false
                                            ? "bg-rose-600 text-white border-rose-600"
                                            : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                                    }`}
                                >
                                    No le va
                                </button>
                                <input
                                    value={form.detalle}
                                    onChange={(e) => actualizarForm(item, { detalle: e.target.value })}
                                    placeholder="Aclaración (opcional): qué hay que modificar, con qué entra…"
                                    className="flex-1 min-w-[200px] rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                            </div>

                            {form.compatible !== null && (
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[10px] text-[#667781]">
                                        <input
                                            type="checkbox"
                                            checked={form.enviarMensaje}
                                            onChange={(e) => actualizarForm(item, { enviarMensaje: e.target.checked })}
                                            className="h-3 w-3"
                                        />
                                        Mandarle esta respuesta al cliente
                                    </label>
                                    {form.enviarMensaje && (
                                        <textarea
                                            value={form.mensaje}
                                            onChange={(e) => actualizarForm(item, { mensaje: e.target.value, mensajeEditado: true })}
                                            rows={2}
                                            className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                        />
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                <label
                                    className="flex items-center gap-1.5 text-[10px] text-[#667781]"
                                    title="Cargar la misma regla para cada pieza suelta del kit. Ojo: una pieza periférica puede terminar hablando por el cilindro."
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.aplicarAPiezas}
                                        onChange={(e) => actualizarForm(item, { aplicarAPiezas: e.target.checked })}
                                        className="h-3 w-3"
                                    />
                                    Aplicar también a las piezas sueltas
                                </label>
                                <label
                                    className="flex items-center gap-1.5 text-[10px] text-[#667781]"
                                    title="Por defecto responder pausa el bot en esta charla, como cualquier respuesta manual."
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.reanudarBot}
                                        onChange={(e) => actualizarForm(item, { reanudarBot: e.target.checked })}
                                        className="h-3 w-3"
                                    />
                                    Que siga el bot
                                </label>
                                <button
                                    type="button"
                                    onClick={() => guardarTecnica(item)}
                                    disabled={guardando || !destino || form.compatible === null}
                                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                                >
                                    {guardando ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    Aprender y responder
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

/**
 * Cartel de una línea dentro del hilo: "el bot derivó esto y por qué".
 * No pide nada al equipo — se contesta abajo como cualquier mensaje — así que
 * no ocupa más que un renglón entre los globos. La ✕ solo lo saca de la vista
 * (cierra la pendiente como "descartada", igual que antes la tarjeta).
 */
export function AvisoDerivacion({
    escalado,
    onDescartado,
}: {
    escalado: EscaladoChatVivo
    onDescartado?: () => void
}) {
    const [cerrando, arrancarCierre] = useTransition()
    const [cerrado, setCerrado] = useState(false)
    if (cerrado) return null
    const etiqueta = ETIQUETA[escalado.tipo]
    return (
        <div className="flex justify-center py-0.5">
            <div className="group flex max-w-[85%] items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/95 px-2.5 py-1 text-[10px] text-amber-900 shadow-sm">
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                <span className="font-semibold shrink-0">Derivado al equipo</span>
                <span className={`shrink-0 rounded-full border px-1.5 leading-4 ${etiqueta.clase}`}>{etiqueta.texto}</span>
                <span className="truncate text-amber-800/90">
                    {escalado.motivo || escalado.resumen}
                </span>
                <span className="shrink-0 text-amber-700/60">{hora(escalado.creadoEn)}</span>
                <button
                    type="button"
                    title="Sacar el aviso"
                    disabled={cerrando}
                    onClick={() =>
                        arrancarCierre(async () => {
                            try {
                                await descartarEscaladoChatVivo(escalado.tipo, escalado.id)
                                setCerrado(true)
                                onDescartado?.()
                            } catch {
                                /* si falla queda el aviso, que es lo correcto */
                            }
                        })
                    }
                    className="shrink-0 rounded-full p-0.5 text-amber-700/50 opacity-0 transition-opacity hover:bg-amber-100 hover:text-amber-900 group-hover:opacity-100 disabled:opacity-50"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}
