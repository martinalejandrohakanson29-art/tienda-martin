"use client"

import { useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Save, Loader2, Check, AlertTriangle, Trash2, Link2, Plus } from "lucide-react"

import { guardarMensajeIncompatibilidad, guardarCostoEnvioSueltas } from "@/app/actions/chat-config"
import {
    guardarInfoNegocio,
    eliminarInfoNegocio,
    type InfoNegocio,
} from "@/app/actions/info-negocio"
import {
    MENSAJE_INCOMPATIBILIDAD_DEFAULT,
    type ChatConfig,
} from "@/lib/chat-config-constants"
import { FICHAS_TEMAS_NEGOCIO, SINONIMOS_CONFIANZA, type FichaTemaNegocio } from "@/lib/temas-negocio"
import { textoIncompatibleSugerido } from "@/lib/compat-mensaje"

/** Motivo de ejemplo para la vista previa: sale de una fila real de compatibilidad. */
const DETALLE_EJEMPLO = "Para que entre hay que hacerle modificaciones al motor (alesar los cárteres)."

/** Mismo criterio que la herramienta: un renglón en blanco separa un hecho del otro. */
function partirEnHechos(texto: string): string[] {
    return (texto || "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
}

const RX_URL = /https?:\/\/[^\s<>"')]+|(?:www\.|[a-z0-9-]+\.)[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s<>"')]*)?/gi

function extraerLinks(texto: string): string[] {
    return Array.from(new Set((texto || "").match(RX_URL) ?? []))
}

export function MensajesTab({
    configInicial,
    errorInicial,
    infoNegocioInicial,
    infoNegocioError,
}: {
    configInicial: ChatConfig
    errorInicial: string | null
    infoNegocioInicial: InfoNegocio[]
    infoNegocioError: string | null
}) {
    return (
        <div className="space-y-8 max-w-3xl pb-6">
            <InfoNegocioBloque itemsIniciales={infoNegocioInicial} errorInicial={infoNegocioError} />
            <RespuestasFijasBloque configInicial={configInicial} errorInicial={errorInicial} />
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Lo que el bot sabe del negocio (tabla info_negocio)                  */
/* ------------------------------------------------------------------ */

function InfoNegocioBloque({
    itemsIniciales,
    errorInicial,
}: {
    itemsIniciales: InfoNegocio[]
    errorInicial: string | null
}) {
    const [items, setItems] = useState<InfoNegocio[]>(itemsIniciales)
    const [error, setError] = useState<string | null>(errorInicial)
    const [temaNuevo, setTemaNuevo] = useState("")
    const [creando, setCreando] = useState(false)

    /** Una fila por tema: la más reciente gana, igual criterio que el bot. */
    const porTema = useMemo(() => {
        const mapa = new Map<string, InfoNegocio>()
        for (const item of items) {
            const clave = item.tema.toLowerCase().trim()
            if (!mapa.has(clave)) mapa.set(clave, item)
        }
        return mapa
    }, [items])

    /** Temas cargados que no tienen ficha propia (los que agregó alguien a mano). */
    const fichasExtra: FichaTemaNegocio[] = useMemo(() => {
        const conocidos = new Set(FICHAS_TEMAS_NEGOCIO.map((f) => f.value))
        return Array.from(porTema.keys())
            .filter((tema) => !conocidos.has(tema))
            .map((tema) => ({
                value: tema,
                label: tema,
                descripcion: "Tema agregado a mano. El bot lo encuentra si pide un tema parecido a este nombre.",
                disparadores: [],
                placeholder: "",
            }))
    }, [porTema])

    function reemplazar(tema: string, item: InfoNegocio | null) {
        setItems((prev) => {
            const resto = prev.filter((i) => i.tema.toLowerCase().trim() !== tema.toLowerCase().trim())
            return item ? [item, ...resto] : resto
        })
    }

    function agregarTema(e: React.FormEvent) {
        e.preventDefault()
        const tema = temaNuevo.trim().toLowerCase()
        if (!tema || porTema.has(tema)) return
        setCreando(true)
        // Fila "fantasma" (id 0) hasta que se guarde el texto: la tarjeta aparece
        // vacía y recién al guardar existe en la base.
        setItems((prev) => [{ id: 0, tema, respuesta: "", fuente: "admin", creado_en: new Date() }, ...prev])
        setTemaNuevo("")
        setCreando(false)
    }

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Lo que el bot sabe del negocio</h2>
                <p className="text-sm text-gray-500">
                    Los datos oficiales que el bot consulta cuando el cliente pregunta algo que no es un repuesto:
                    envíos, horarios, pagos, ubicación, confianza y redes. <strong>No son un libreto</strong>: el bot
                    elige el dato que responde la pregunta y lo cuenta con sus palabras. Separá con un{" "}
                    <strong>renglón en blanco</strong> cada dato independiente — cada bloque es un hecho suelto que
                    puede dar por separado, así no vuelca todo junto. Es la misma info de{" "}
                    <em>Base de Conocimiento → Info del Negocio</em> y de las notas rápidas de chats en vivo.
                </p>
            </div>

            {error && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{error}</p>
                    </CardContent>
                </Card>
            )}

            {[...FICHAS_TEMAS_NEGOCIO, ...fichasExtra].map((ficha) => (
                <TemaCard
                    key={ficha.value}
                    ficha={ficha}
                    item={porTema.get(ficha.value) ?? null}
                    onGuardado={(item) => reemplazar(ficha.value, item)}
                    onError={setError}
                />
            ))}

            <form onSubmit={agregarTema} className="flex items-center gap-2">
                <Input
                    value={temaNuevo}
                    onChange={(e) => setTemaNuevo(e.target.value)}
                    placeholder="Agregar otro tema (ej: facturacion)"
                    className="max-w-xs"
                />
                <Button type="submit" variant="outline" size="sm" className="gap-1" disabled={creando || !temaNuevo.trim()}>
                    <Plus className="h-4 w-4" /> Agregar tema
                </Button>
            </form>
        </section>
    )
}

function TemaCard({
    ficha,
    item,
    onGuardado,
    onError,
}: {
    ficha: FichaTemaNegocio
    item: InfoNegocio | null
    onGuardado: (item: InfoNegocio | null) => void
    onError: (mensaje: string | null) => void
}) {
    const [texto, setTexto] = useState(item?.respuesta ?? "")
    const [guardado, setGuardado] = useState(item?.respuesta ?? "")
    const [guardando, setGuardando] = useState(false)
    const [borrando, setBorrando] = useState(false)
    const [ok, setOk] = useState(false)

    const sinCambios = texto.trim() === guardado.trim()
    const cargado = guardado.trim().length > 0
    const hechos = partirEnHechos(texto)
    const links = extraerLinks(texto)
    const esConfianza = ficha.value === "garantia"

    async function guardar() {
        setGuardando(true)
        onError(null)
        setOk(false)
        try {
            await guardarInfoNegocio({ id: item?.id || undefined, tema: ficha.value, respuesta: texto })
            const limpio = texto.trim()
            setGuardado(limpio)
            setTexto(limpio)
            onGuardado({
                id: item?.id || Date.now(),
                tema: ficha.value,
                respuesta: limpio,
                fuente: "admin",
                creado_en: new Date(),
            })
            setOk(true)
            setTimeout(() => setOk(false), 2500)
        } catch (e) {
            onError(e instanceof Error ? e.message : "No se pudo guardar")
        } finally {
            setGuardando(false)
        }
    }

    async function borrar() {
        if (!item?.id) return
        if (!confirm(`¿Borrar el dato de "${ficha.label}"? El bot deja de poder contestar ese tema y lo escala.`)) return
        setBorrando(true)
        onError(null)
        try {
            await eliminarInfoNegocio(item.id)
            setTexto("")
            setGuardado("")
            onGuardado(null)
        } catch (e) {
            onError(e instanceof Error ? e.message : "No se pudo borrar")
        } finally {
            setBorrando(false)
        }
    }

    return (
        <Card className={cargado ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-gray-300"}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {ficha.label}
                    {!cargado && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 font-normal">
                            sin cargar — el bot escala este tema
                        </Badge>
                    )}
                    {cargado && hechos.length > 1 && (
                        <Badge variant="secondary" className="font-normal">{hechos.length} datos sueltos</Badge>
                    )}
                    {links.length > 0 && (
                        <Badge variant="secondary" className="font-normal gap-1">
                            <Link2 className="h-3 w-3" /> {links.length} link{links.length > 1 ? "s" : ""}
                        </Badge>
                    )}
                </CardTitle>
                <CardDescription>{ficha.descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {ficha.disparadores.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {ficha.disparadores.map((d) => (
                            <span key={d} className="text-[11px] rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">
                                “{d}”
                            </span>
                        ))}
                    </div>
                )}

                <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={esConfianza ? 8 : 5}
                    placeholder={ficha.placeholder}
                    className="font-normal"
                />

                {hechos.length > 0 && (
                    <div className="rounded-lg bg-slate-50 border px-3 py-2 space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">
                            Así lo ve el bot ({hechos.length} {hechos.length === 1 ? "hecho" : "hechos"})
                        </p>
                        {hechos.map((h, i) => (
                            <p key={i} className="text-xs text-gray-700 whitespace-pre-wrap">
                                <span className="text-gray-400">[{i + 1}]</span> {h}
                            </p>
                        ))}
                    </div>
                )}

                {links.length > 0 && (
                    <p className="text-xs text-gray-500">
                        Los links salen copiados carácter por carácter y el bot manda{" "}
                        <strong>solo el que le piden</strong>. Revisá que estén completos (con{" "}
                        <code className="px-1 rounded bg-gray-100 text-[11px]">https://</code>): un link mal escrito
                        llega roto al cliente.
                    </p>
                )}

                {esConfianza && (
                    <details className="text-xs text-gray-500">
                        <summary className="cursor-pointer hover:text-gray-700">
                            Con qué palabras del cliente sale este bloque
                        </summary>
                        <p className="mt-2 leading-relaxed">
                            Además de “garantía”, este es el dato que el bot busca cuando el mensaje habla de:{" "}
                            {SINONIMOS_CONFIANZA.join(", ")}. Por eso acá van también las redes: el que pregunta
                            “tienen instagram?” en el fondo está preguntando si somos reales.
                        </p>
                    </details>
                )}

                <div className="flex items-center gap-3">
                    <Button
                        onClick={guardar}
                        disabled={guardando || sinCambios || !texto.trim()}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Guardar
                    </Button>
                    {ok && (
                        <span className="text-sm text-emerald-600 flex items-center gap-1">
                            <Check className="h-4 w-4" /> Guardado
                        </span>
                    )}
                    {!sinCambios && !ok && (
                        <button
                            type="button"
                            onClick={() => setTexto(guardado)}
                            className="text-sm text-gray-400 hover:text-gray-600 underline"
                        >
                            deshacer cambios
                        </button>
                    )}
                    {cargado && !!item?.id && (
                        <button
                            type="button"
                            onClick={borrar}
                            disabled={borrando}
                            className="ml-auto text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"
                        >
                            {borrando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            borrar
                        </button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

/* ------------------------------------------------------------------ */
/* Respuestas fijas (tabla chat_config)                                 */
/* ------------------------------------------------------------------ */

function RespuestasFijasBloque({
    configInicial,
    errorInicial,
}: {
    configInicial: ChatConfig
    errorInicial: string | null
}) {
    const [texto, setTexto] = useState(configInicial.mensajeIncompatibilidad)
    const [guardado, setGuardado] = useState(configInicial.mensajeIncompatibilidad)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)
    const [ok, setOk] = useState(false)

    const sinCambios = texto.trim() === guardado.trim()

    async function guardar() {
        setGuardando(true)
        setError(null)
        setOk(false)
        try {
            const res = await guardarMensajeIncompatibilidad(texto)
            setGuardado(res.valor)
            setTexto(res.valor)
            setOk(true)
            setTimeout(() => setOk(false), 2500)
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo guardar")
        } finally {
            setGuardando(false)
        }
    }

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Respuestas fijas</h2>
                <p className="text-sm text-gray-500">
                    Acá el bot no redacta: copia la letra de la casa tal cual. Son los casos donde una palabra de más
                    cambia el sentido.
                </p>
            </div>

            {error && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{error}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t-4 border-t-emerald-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Mensaje de incompatibilidad</CardTitle>
                    <CardDescription>
                        Lo que le responde el bot cuando el kit, pack o grupo no le sirve a la moto del cliente.
                        Es la letra fija de la casa: el bot la copia tal cual, sin improvisar. Podés escribir{" "}
                        <code className="px-1 rounded bg-gray-100 text-[11px]">{"{moto}"}</code> y se reemplaza por
                        la moto que dijo el cliente. Atrás se le pega el motivo cargado en la compatibilidad, si
                        tiene uno. Aplica a todos los casos (kit simple, grupo y cuando el bot no encuentra
                        ningún kit para esa moto).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="msg-incompat">Texto</Label>
                        <Textarea
                            id="msg-incompat"
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder={MENSAJE_INCOMPATIBILIDAD_DEFAULT}
                        />
                        <p className="text-xs text-gray-400">{texto.trim().length}/500</p>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Vista previa (ejemplo con moto y motivo)</Label>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">
                            {textoIncompatibleSugerido(texto, "Honda Wave NF", DETALLE_EJEMPLO) || (
                                <span className="text-gray-400">…</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={guardar}
                            disabled={guardando || sinCambios || !texto.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar
                        </Button>
                        {ok && (
                            <span className="text-sm text-emerald-600 flex items-center gap-1">
                                <Check className="h-4 w-4" /> Guardado
                            </span>
                        )}
                        {!sinCambios && !ok && (
                            <button
                                type="button"
                                onClick={() => setTexto(guardado)}
                                className="text-sm text-gray-400 hover:text-gray-600 underline"
                            >
                                deshacer cambios
                            </button>
                        )}
                    </div>

                    {guardado.trim() !== MENSAJE_INCOMPATIBILIDAD_DEFAULT.trim() && (
                        <button
                            type="button"
                            onClick={() => setTexto(MENSAJE_INCOMPATIBILIDAD_DEFAULT)}
                            className="text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                            volver al texto original
                        </button>
                    )}
                </CardContent>
            </Card>

            <CostoEnvioCard valorInicial={configInicial.costoEnvioSueltas} onError={setError} />

            <p className="text-xs text-gray-400">
                El cambio impacta en el bot en el próximo mensaje que procese. Si el equipo responde
                &quot;no compatible&quot; a mano en una nota privada, ese texto lo sigue redactando la IA a partir
                de lo que escribió la persona — no usa este mensaje.
            </p>
        </section>
    )
}

function CostoEnvioCard({
    valorInicial,
    onError,
}: {
    valorInicial: number | null
    onError: (mensaje: string | null) => void
}) {
    const [monto, setMonto] = useState(valorInicial != null ? String(valorInicial) : "")
    const [guardado, setGuardado] = useState(valorInicial != null ? String(valorInicial) : "")
    const [guardando, setGuardando] = useState(false)
    const [ok, setOk] = useState(false)

    const sinCambios = monto.trim() === guardado.trim()
    const numero = Number(monto.replace(/[^\d.-]/g, ""))
    const valido = monto.trim() === "" || (Number.isFinite(numero) && numero > 0)

    async function guardar() {
        setGuardando(true)
        onError(null)
        setOk(false)
        try {
            const res = await guardarCostoEnvioSueltas(monto)
            const nuevo = res.valor != null ? String(res.valor) : ""
            setGuardado(nuevo)
            setMonto(nuevo)
            setOk(true)
            setTimeout(() => setOk(false), 2500)
        } catch (e) {
            onError(e instanceof Error ? e.message : "No se pudo guardar")
        } finally {
            setGuardando(false)
        }
    }

    return (
        <Card className="border-t-4 border-t-sky-500 shadow-md">
            <CardHeader>
                <CardTitle className="text-xl">Costo de envío de piezas sueltas</CardTitle>
                <CardDescription>
                    Un solo monto para todo el catálogo: es lo que se cobra por el paquete, no por pieza. Solo se
                    usa en los artículos que <strong>no</strong> están marcados con envío gratis. Si lo dejás vacío,
                    el bot dice que el envío corre por cuenta del cliente pero no inventa ningún número. Es el mismo
                    dato que aparece arriba del listado de <em>Artículos</em>.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-gray-500">$</span>
                    <Input
                        value={monto}
                        onChange={(e) => setMonto(e.target.value)}
                        placeholder="sin cargar"
                        inputMode="numeric"
                        className="max-w-[160px]"
                    />
                    <Button
                        onClick={guardar}
                        disabled={guardando || sinCambios || !valido}
                        size="sm"
                        className="bg-sky-600 hover:bg-sky-700 text-white gap-2"
                    >
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Guardar
                    </Button>
                    {ok && (
                        <span className="text-sm text-emerald-600 flex items-center gap-1">
                            <Check className="h-4 w-4" /> Guardado
                        </span>
                    )}
                </div>
                {!valido && <p className="text-xs text-red-600">Tiene que ser un número mayor a cero (o vacío).</p>}
            </CardContent>
        </Card>
    )
}
