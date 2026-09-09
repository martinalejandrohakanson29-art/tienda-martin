import { MensajeChat, RespuestaAgente, HerramientaEjecutadaInfo, LlamadaHerramientaLLM } from "./tipos"
import { definicionesHerramientas, ejecutarHerramienta } from "./herramientas"
import { escalarAHumano } from "./herramientas/escalar-humano"
import { PROMPT_SISTEMA_AGENTE } from "./prompts/sistema"
import { sanitizarMensajeSalida, pareceRespuestaNoConfiable, quitarOracionesYaDichas, quitarHechosYaDichos, extraerHechos } from "./guardrails/sanitizador"
import { obtenerConfiguracionAgente, ConfiguracionAgente } from "./configuracion"
import { detectarSituaciones, formatearBloqueSituaciones } from "./situaciones"
import { quitarPreguntaDeMotoFinal, restoFueraDePlantilla } from "./nucleo/texto"
import { resolverMoto } from "./nucleo/motos"
import {
    cargarEstadoConversacion,
    guardarEstadoConversacion,
    formatearMemoriaEstado,
    unirTemas,
    esInsistenciaSinContenido,
    EstadoConversacion
} from "./nucleo/estado-persistente"

export interface OpcionesEjecucion {
    apiKey?: string
    modelo?: string
    temperatura?: number
    baseUrl?: string
    /** ID de la conversacion de Chatwoot (para linkear los escalados al chat real). */
    conversationId?: number
    /** Clave para la memoria persistente del embudo (session_id en el simulador). */
    estadoKey?: string
    /**
     * Pisa el `reasoning_effort` de chat_config para ESTA llamada. Existe para
     * poder comparar niveles de razonamiento contra el banco de pruebas sin
     * escribir la config global, que la lee producción en vivo.
     */
    reasoningEffort?: string
    /**
     * Anuncio de Meta por el que entró el cliente (`content_attributes.referral`
     * del mensaje de Chatwoot). El texto del cliente no dice de qué kit viene;
     * el anuncio sí.
     */
    referralAnuncio?: { titulo?: string | null; cuerpo?: string | null }
}

const DEFAULT_MODEL = "gpt-5" // Modelo de producción (chat_config.proveedor_activo lo puede pisar)
const DEFAULT_BASE_URL = "https://api.openai.com/v1"
const MAX_PASOS_REACT = 6
const TIMEOUT_LLM_MS = 60_000 // gpt-5 (razonamiento) es más lento que gpt-5-mini; margen para no abortar turnos válidos

/**
 * Turno que se resolvió sin llamar al modelo (saludo, plantilla de anuncio,
 * silencio por escalado pendiente). Se registra igual con 0 tokens: son los
 * turnos gratis, y saber cuántos son es la mitad del análisis de costo.
 */
function sinCostoLLM(modelo: string): RespuestaAgente["tokensUsados"] {
    return { prompt: 0, completion: 0, total: 0, cacheados: 0, razonamiento: 0, pasos: 0, modelo }
}

/** Intentos por proveedor antes de darlo por caído y pasar al siguiente. */
const MAX_INTENTOS_LLM = 3
/** Espera base del backoff entre reintentos (se duplica en cada vuelta). */
const BACKOFF_LLM_MS = 800

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * ¿Vale la pena reintentar este HTTP, o es un error nuestro que va a fallar igual?
 *
 * 429 (rate limit) y 5xx (el proveedor se cayó) son transitorios: se reintentan.
 * Un 400/401/404 es un pedido mal armado o una key vencida — reintentarlo solo
 * agrega latencia. El 402 (saldo agotado) tampoco se reintenta: no se arregla
 * solo, y hay que ir al fallback lo antes posible.
 */
function esErrorTransitorio(status: number): boolean {
    return status === 429 || status === 408 || status >= 500
}

/**
 * Un proveedor concreto al que se le puede pedir un turno.
 */
interface Proveedor {
    modelo: string
    baseUrl: string
    apiKey: string
}

/**
 * Llama a la API del LLM con timeout, reintentos y backoff.
 *
 * Antes esto solo reintentaba errores de RED: el `if (!res.ok) throw` del loop
 * quedaba afuera, así que un 429 o un 503 —justo los errores que tira un
 * proveedor sobrecargado— mataban el turno en el primer intento. El turno caído
 * se recuperaba recién con el barrido de entrantes pendientes, 4 minutos después.
 */
async function llamarLLM(prov: Proveedor, cuerpo: Record<string, any>): Promise<any> {
    let ultimoError: any = null

    for (let intento = 1; intento <= MAX_INTENTOS_LLM; intento++) {
        if (intento > 1) await dormir(BACKOFF_LLM_MS * Math.pow(2, intento - 2))

        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_LLM_MS)
        try {
            const res = await fetch(`${prov.baseUrl}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${prov.apiKey}` },
                body: JSON.stringify({ ...cuerpo, model: prov.modelo }),
                signal: ctrl.signal
            })

            if (res.ok) return await res.json()

            const detalle = (await res.text().catch(() => "")).slice(0, 300)
            ultimoError = new Error(`${prov.modelo} respondió ${res.status}: ${detalle}`)
            if (!esErrorTransitorio(res.status)) break // no se arregla reintentando
            console.warn(`[motor] ${prov.modelo} HTTP ${res.status} (intento ${intento}/${MAX_INTENTOS_LLM})`)
        } catch (err: any) {
            // Timeout (AbortError) o caída de red: siempre vale reintentar.
            ultimoError = err
            console.warn(`[motor] ${prov.modelo} ${err?.name || "error de red"} (intento ${intento}/${MAX_INTENTOS_LLM})`)
        } finally {
            clearTimeout(timer)
        }
    }

    throw new Error(`No se pudo contactar la API de IA (${prov.modelo}): ${ultimoError?.message || ultimoError}`)
}

/**
 * Traduce un `proveedor_activo` de chat_config ("deepseek:deepseek-v4-flash",
 * "openai:gpt-5", "openrouter:...") al modelo, la baseUrl y la clave que le
 * corresponden.
 */
function proveedorDesdeSpec(spec: string, config: ConfiguracionAgente): Proveedor | null {
    const [prefijo, ...resto] = spec.split(":")
    const nombre = resto.join(":").trim()

    let modelo = nombre
    let baseUrl: string
    let apiKey: string | undefined

    if (prefijo === "deepseek") {
        modelo = modelo || "deepseek-v4-flash"
        baseUrl = "https://api.deepseek.com"
        apiKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY
    } else if (prefijo === "openrouter") {
        baseUrl = "https://openrouter.ai/api/v1"
        apiKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY
    } else {
        modelo = modelo || DEFAULT_MODEL
        baseUrl = DEFAULT_BASE_URL
        apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY
    }

    // Sin clave no es un proveedor utilizable. Se descarta en silencio: si es el
    // principal, el turno falla más abajo con un mensaje claro; si es el
    // suplente, simplemente no hay red y no tiene sentido romper por eso.
    if (!modelo || !apiKey) return null
    return { modelo, baseUrl, apiKey }
}

/**
 * Arma la lista de proveedores a usar en el turno: [principal, suplente].
 *
 * El suplente existe para que una caída del proveedor barato no se transforme
 * en una conversación sin responder. Con DeepSeek en producción esto es lo que
 * hace que el ahorro no cueste atención al cliente: el 99% del tráfico va por
 * el principal, y el turno que falla lo cubre el suplente sin que nadie note nada.
 *
 * `opciones.modelo` (banco de pruebas, simulador) fuerza UN proveedor y sin
 * suplente: si se está midiendo un modelo, otro contestando por él arruinaría
 * la medición.
 */
function resolverProveedores(config: ConfiguracionAgente, opciones: OpcionesEjecucion): Proveedor[] {
    if (opciones.modelo) {
        const baseUrl = (opciones.baseUrl || DEFAULT_BASE_URL).replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "")
        const apiKey =
            opciones.apiKey?.trim() ||
            (baseUrl.includes("deepseek.com") || opciones.modelo.toLowerCase().includes("deepseek")
                ? config.deepseekApiKey || process.env.DEEPSEEK_API_KEY
                : baseUrl.includes("openrouter.ai")
                  ? config.openrouterApiKey || process.env.OPENROUTER_API_KEY
                  : config.openaiApiKey || process.env.OPENAI_API_KEY)
        if (!apiKey) {
            throw new Error(
                `Falta la clave de API para el modelo "${opciones.modelo}". Podés cargarla y activarla en el modal "Configurar Modelo / API Key" o en la pestaña "Ajustes de Estilo y Palabras".`
            )
        }
        return [{ modelo: opciones.modelo, baseUrl, apiKey }]
    }

    const principal = proveedorDesdeSpec(config.proveedorActivo || "openai:gpt-5", config)
    if (!principal) {
        throw new Error(
            `Falta la clave de API para el proveedor "${config.proveedorActivo}". Podés cargarla y activarla en el modal "Configurar Modelo / API Key" o en la pestaña "Ajustes de Estilo y Palabras".`
        )
    }

    const suplente = config.proveedorFallback ? proveedorDesdeSpec(config.proveedorFallback, config) : null
    // Un suplente del mismo modelo no es una red: si se cayó, se cayó para los dos.
    if (!suplente || suplente.modelo === principal.modelo) return [principal]
    return [principal, suplente]
}

/**
 * Ejecuta un turno conversacional del agente con soporte de Tool Calling
 */
function esSaludoSinIntencion(msg: string): boolean {
    const texto = (msg || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z\s]/g, "")
        .trim()

    const saludosComunes = new Set([
        "hola",
        "hola buenas",
        "hola buen dia",
        "hola buenas tardes",
        "hola buenas noches",
        "buenas",
        "buen dia",
        "buenas tardes",
        "buenas noches",
        "hola que tal",
        "que tal",
        "hola como andas",
        "hola como va",
        "hola amigo",
        "hola bro",
        "buenas bro",
        "buenas amigo"
    ])

    return saludosComunes.has(texto)
}

/**
 * Si en este turno `consultar_catalogo_y_precios` resolvió a una única opción (pack o
 * combo) que el cliente todavía no tenía pineada, ese es el mensaje de bienvenida del
 * kit: devuelve su `foto_url` para adjuntarla junto al texto (mismo criterio que
 * chatwoot 2.0 vía `lib/chatwoot-bot.ts` -> `enviarImagenChatwoot`).
 */
function extraerFotoDeBienvenida(
    herramientasEjecutadas: HerramientaEjecutadaInfo[],
    estadoConv: EstadoConversacion,
    descartados: { packsDescartados: Set<number>; gruposDescartados: Set<number> }
): string | undefined {
    for (const ej of herramientasEjecutadas) {
        if (ej.nombre !== "consultar_catalogo_y_precios") continue
        const r = ej.resultado || {}
        if (!r.encontrado) continue

        const grupos = r.grupos || []
        const packs = r.packs || []
        if (grupos.length + packs.length !== 1) continue // paso 1 (varias opciones): todavía no hay bienvenida

        const grupo = grupos[0]
        const pack = packs[0]
        const yaPineadoAntes =
            (grupo && estadoConv.grupoPineado?.id === grupo.id) ||
            (pack && estadoConv.packPresentado?.id === pack.id)

        // Si en este turno hubo varias búsquedas y `confirmarPresentadoSegunMensaje`
        // ya decidió cuál kit salió de verdad, la foto sale por ese mismo criterio:
        // no mandamos la foto de un kit que el mensaje no presenta.
        if (pack && descartados.packsDescartados.has(pack.id)) continue
        if (grupo && descartados.gruposDescartados.has(grupo.id)) continue

        if (!yaPineadoAntes) {
            const foto = grupo?.foto_url || pack?.foto_url
            if (foto) return foto
        }
    }
    return undefined
}

/**
 * ¿El precio de este kit aparece en el texto que se le manda al cliente?
 * La ficha oficial siempre lo lleva, así que es la evidencia más barata de que
 * el mensaje que sale es el de ESE kit y no el de otro que se buscó al pasar.
 */
function precioApareceEnTexto(texto: string, precio: number): boolean {
    if (!precio || !texto) return false
    const plano = texto.replace(/[.\s ]/g, "")
    return plano.includes(`$${Math.round(precio)}`)
}

/**
 * Corrige el kit que queda marcado como "presentado" cuando en el mismo turno
 * hubo VARIAS búsquedas de catálogo que resolvieron a kits distintos.
 *
 * Por qué existe: el modelo suele buscar dos o tres veces en un mismo turno
 * ("varillero", "150 a 200", "200cc"). Cada búsqueda que resolvía a un único
 * pack pisaba `patchEstado.packPresentado`, así que la memoria terminaba
 * anotando un kit que el cliente NUNCA vio. En la conv 3583 (08/09) se le
 * presentó el "kit dakar 200 economico" pero quedó guardado "Kit 170 varillero
 * + leva": al turno siguiente el cliente preguntó "con la leva no viene no?" y
 * el bot, leyendo esa memoria, le afirmó que sí venía con leva. El kit no la
 * incluye.
 *
 * Criterio: si hubo un solo candidato en el turno no se toca nada (comportamiento
 * de siempre). Si hubo varios, gana el que tenga su precio en el mensaje que
 * realmente sale. Si ninguno lo tiene, no se marca nada: mejor sin memoria que
 * con memoria falsa.
 *
 * Devuelve los ids que quedaron DESCARTADOS (se buscaron pero el mensaje no los
 * presenta) para que la foto de bienvenida salga por el mismo criterio.
 */
function confirmarPresentadoSegunMensaje(
    patchEstado: EstadoConversacion,
    herramientasEjecutadas: HerramientaEjecutadaInfo[],
    mensajeFinal: string
): { packsDescartados: Set<number>; gruposDescartados: Set<number> } {
    const candidatosPack: { id: number; nombre: string; precio: number }[] = []
    const candidatosGrupo: { id: number; nombre: string; precios: number[] }[] = []

    for (const ej of herramientasEjecutadas) {
        if (ej.nombre !== "consultar_catalogo_y_precios") continue
        const r = ej.resultado || {}
        if (!r.encontrado) continue
        const packs = r.packs || []
        const grupos = r.grupos || []
        if (packs.length === 1 && grupos.length === 0 && !packs[0].grupo_id) {
            if (!candidatosPack.some((c) => c.id === packs[0].id)) {
                candidatosPack.push({ id: packs[0].id, nombre: packs[0].nombre, precio: Number(packs[0].precio) || 0 })
            }
        }
        if (grupos.length === 1 && packs.length === 0) {
            if (!candidatosGrupo.some((c) => c.id === grupos[0].id)) {
                candidatosGrupo.push({
                    id: grupos[0].id,
                    nombre: grupos[0].nombre,
                    precios: (grupos[0].variantes || []).map((v: any) => Number(v.precio) || 0)
                })
            }
        }
    }

    const packsDescartados = new Set<number>()
    const gruposDescartados = new Set<number>()

    if (candidatosPack.length > 1) {
        const confirmado = candidatosPack.find((c) => precioApareceEnTexto(mensajeFinal, c.precio))
        for (const c of candidatosPack) {
            if (c.id !== confirmado?.id) packsDescartados.add(c.id)
        }
        if (patchEstado.packPresentado) {
            if (confirmado) {
                patchEstado.packPresentado = { id: confirmado.id, nombre: confirmado.nombre, precio: confirmado.precio }
            } else {
                delete patchEstado.packPresentado
            }
        }
    }

    if (candidatosGrupo.length > 1) {
        const confirmado = candidatosGrupo.find((c) => c.precios.some((p) => precioApareceEnTexto(mensajeFinal, p)))
        for (const c of candidatosGrupo) {
            if (c.id !== confirmado?.id) gruposDescartados.add(c.id)
        }
        if (patchEstado.grupoPineado) {
            if (confirmado) {
                patchEstado.grupoPineado = { id: confirmado.id, nombre: confirmado.nombre }
            } else {
                delete patchEstado.grupoPineado
            }
        }
    }

    return { packsDescartados, gruposDescartados }
}

/**
 * Detecta situaciones deterministas que requieren escalado inmediato en silencio absoluto (costo $0)
 */
function detectarEscaladoDeterminista(msg: string): { motivo: string; resumen: string } | null {
    const texto = (msg || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()

    if (!texto) return null

    // 1. Pedido explícito e inequívoco de hablar con un humano
    const rxHumano = /\b(pasame|comunicame|quiero hablar|atendeme|derivar(me)?|hablar)\s+(con\s+)?(un\s+|una\s+)?(humano|persona|asesor|alguien\s+real)\b/i
    if (rxHumano.test(texto) || texto === "humano" || texto === "persona real" || texto === "pasame con alguien") {
        return {
            motivo: "cliente_pide_humano",
            resumen: "El cliente solicitó expresamente ser atendido por un asesor o persona humana."
        }
    }

    // 2. Insultos o agresiones graves explícitas
    const rxAgresion = /\b(estafadores?|ladrones?|garcas?|hijos? de puta|concha de tu madre|hdp|sinverguenzas?|chorros?)\b/i
    if (rxAgresion.test(texto)) {
        return {
            motivo: "cliente_agresivo",
            resumen: `Mensaje con agresión o insultos directos: "${msg}"`
        }
    }

    // 3. Reclamo postventa explícito y crítico
    const rxReclamo = /\b(vino rot[ao]|lleg[oó] rot[ao]|vino fallad[ao]|paquete rot[ao]|hacer un reclamo|reclamo por (el |mi )?(envio|pedido|paquete|compra)|no me lleg[oó] (el |mi )?(pedido|paquete|compra))\b/i
    if (rxReclamo.test(texto)) {
        return {
            motivo: "reclamo_postventa",
            resumen: `Reclamo explícito del cliente: "${msg}"`
        }
    }

    // 4. Pedido explícito de link (Mercado Libre, publicación, link de pago)
    const rxLinkML = /\b(link|enlace|publicacion)\s+(de\s+)?(mercadolibre|mercado\s+libre|ml|pago|mercadopago|mercado\s+pago)\b/i
    const rxLinkGenerico = /\b(pasame|mandame|pasa|manda|tenes|comparti(me)?|dame)\s+(el\s+|un\s+)?(link|enlace|publicacion)\b/i
    if (rxLinkML.test(texto) || rxLinkGenerico.test(texto)) {
        return {
            motivo: "pedido_link_externo",
            resumen: `Cliente solicita link externo o de pago: "${msg}"`
        }
    }

    // 5. Pedido explícito de datos bancarios para transferir (CBU, Alias)
    const rxDatosPago = /\b(pasame|mandame|pasa|manda|dame)\s+.*(cbu|alias|cuenta\s+(para|bancaria)|datos\s+para\s+(transferir|el\s+pago|pagar))\b/i
    const rxAliasCbuSolo = /^(pasame\s+)?(el\s+)?(cbu|alias|datos\s+de\s+la\s+cuenta)$/i
    if (rxDatosPago.test(texto) || rxAliasCbuSolo.test(texto)) {
        return {
            motivo: "pedido_datos_pago",
            resumen: `Cliente solicita CBU/Alias o datos bancarios para transferir: "${msg}"`
        }
    }

    // 6. Envío explícito de comprobante de pago
    const rxComprobante = /\b(ya\s+te\s+transferi|ya\s+transferi|te\s+(pase|mande|adjunto)\s+(el\s+)?comprobante|aca\s+(esta\s+)?el\s+comprobante|comprobante\s+de\s+pago)\b/i
    if (rxComprobante.test(texto)) {
        return {
            motivo: "comprobante_pago",
            resumen: `Cliente indica envío de comprobante de transferencia: "${msg}"`
        }
    }

    // 7. Pedido explícito de fotos o videos reales
    const rxFotosVideos = /\b(pasame|mandame|tenes|pasa|manda|comparti(me)?|mostrame)\s+.*(fotos?|videos?)\b/i
    if (rxFotosVideos.test(texto)) {
        return {
            motivo: "pedido_fotos_videos",
            resumen: `Cliente solicita fotos o videos reales del producto: "${msg}"`
        }
    }

    return null
}

/**
 * Ejecuta un turno conversacional del agente con soporte de Tool Calling
 */
export async function ejecutarTurnoAgente(
    mensajeUsuario: string,
    historialPrevio: MensajeChat[] = [],
    opciones: OpcionesEjecucion = {}
): Promise<RespuestaAgente> {
    const inicio = Date.now()

    // Clave de la memoria persistente del embudo (session_id en el simulador,
    // conversationId en producción). Se resuelve acá arriba para que las ramas
    // que devuelven temprano (match de plantilla) también puedan escribir estado.
    const estadoKey = opciones.estadoKey || (opciones.conversationId != null ? String(opciones.conversationId) : undefined)

    // Cargar configuración editable desde base de datos + lo que ya quedó
    // resuelto en esta conversación. El estado se necesita ANTES del match de
    // plantilla de anuncio: sin él, esa rama volvía a volcar la ficha de un kit
    // ya presentado y preguntaba la moto que el cliente ya había dicho.
    const [config, estadoConv] = await Promise.all([
        obtenerConfiguracionAgente(),
        cargarEstadoConversacion(estadoKey)
    ])

    // Proveedor principal + suplente. El suplente solo entra si el principal se
    // cae del todo (ver `llamarLLM` y el loop ReAct más abajo).
    const proveedores = resolverProveedores(config, opciones)
    const modelo = proveedores[0].modelo

    // 0.a Ya hay una consulta derivada al equipo esperando respuesta humana y el
    //     cliente solo insiste ("??", "hola?", "ahi?"): NO hay nada nuevo que
    //     contestar y el bot no puede responder lo que escaló. Silencio, sin
    //     gastar un turno de modelo. Antes el turno arrancaba en blanco y el
    //     modelo improvisaba sobre el kit anterior (conv 3637, 08/09).
    if (estadoConv.escaladoPendiente && esInsistenciaSinContenido(mensajeUsuario)) {
        return {
            mensajeFinal: null,
            herramientasEjecutadas: [
                {
                    nombre: "escalado_pendiente",
                    argumentos: {
                        motivo: estadoConv.escaladoPendiente.motivo,
                        desde: estadoConv.escaladoPendiente.en
                    },
                    resultado: {
                        mensaje_para_agente:
                            "El cliente insiste por una consulta que ya está en la bandeja del equipo. Silencio: la contesta un humano."
                    }
                }
            ],
            escaladoHumano: false,
            latenciaMs: Date.now() - inicio,
            tokensUsados: sinCostoLLM(modelo)
        }
    }

    // 0. Detección determinista de escalado (humano, insulto, reclamo): costo $0, latencia 0ms, silencio total
    const escaladoInmediato = detectarEscaladoDeterminista(mensajeUsuario)
    if (escaladoInmediato) {
        // Persistir el escalado en el panel de pendientes (linkeado a la conversación real).
        const resultado = await escalarAHumano({
            motivo: escaladoInmediato.motivo,
            resumen_consulta: escaladoInmediato.resumen,
            conversation_id: opciones.conversationId
        }).catch((err) => {
            console.error("[motor] fallo al persistir escalado determinista:", err)
            return {
                escalado: true,
                motivo: escaladoInmediato.motivo,
                resumen: escaladoInmediato.resumen,
                mensaje_para_agente: "ESCALADO DETERMINISTA (no se pudo persistir)."
            }
        })

        await guardarEstadoConversacion(estadoKey, {
            escaladoPendiente: {
                motivo: escaladoInmediato.motivo,
                resumen: escaladoInmediato.resumen,
                en: new Date().toISOString()
            }
        }).catch(() => {})

        return {
            mensajeFinal: null, // Silencio total cara al cliente
            herramientasEjecutadas: [
                {
                    nombre: "escalar_a_humano",
                    argumentos: {
                        motivo: escaladoInmediato.motivo,
                        resumen_consulta: escaladoInmediato.resumen
                    },
                    resultado
                }
            ],
            escaladoHumano: true,
            motivoEscalado: escaladoInmediato.motivo,
            escaladoPersistido: true,
            latenciaMs: Date.now() - inicio,
            tokensUsados: sinCostoLLM(modelo)
        }
    }

    // 1. Saludo simple o sin intención ("Hola!", "Buenas"): orientar al cliente directo sin costo de IA
    // Con referral (vino de un anuncio) NO se contesta el genérico: el kit del
    // anuncio lo resuelve el bloque de abajo aunque el cliente solo diga "Hola".
    if (historialPrevio.length === 0 && esSaludoSinIntencion(mensajeUsuario) && !opciones.referralAnuncio) {
        const saludo = `Hola ${config.permitirBro ? "bro" : "amigo"}! En qué te podemos ayudar?`
        return {
            mensajeFinal: saludo,
            mensajesFinales: [saludo],
            herramientasEjecutadas: [],
            escaladoHumano: false,
            latenciaMs: Date.now() - inicio,
            tokensUsados: sinCostoLLM(modelo)
        }
    }

    // Match con una plantilla de anuncio de Instagram: el mensaje publicitario
    // llega tal cual del anuncio y se responde con la bienvenida oficial en
    // automático (costo $0), no solo en el primer mensaje: un cliente que
    // clickea OTRO anuncio en medio de la charla también dispara su bienvenida.
    //
    // Dos excepciones, ambas por no mirar el estado (07/09):
    //  a) Si el kit del anuncio es el que YA se le presentó, re-clickear el
    //     MISMO anuncio le volvía a volcar la ficha entera y a reenviarle la
    //     foto. Ahora cae al turno normal, donde el modelo ve la memoria y la
    //     charla y contesta lo que corresponda.
    //  b) Si la moto ya está confirmada, la bienvenida seguía cerrando con
    //     "A qué moto se lo querés poner?" — una pregunta ya respondida.
    {
        const { detectarPlantillaAnuncio, detectarPlantillaPorReferral } = await import("./herramientas/catalogo-precios")

        // Primero por texto (la plantilla exacta que manda el cliente). Si no,
        // por el referral del anuncio: en WhatsApp el cliente muchas veces
        // escribe directo lo suyo ("Tengo una skua 150") y el único dato del kit
        // está en el anuncio (convs 3357 y 3664, 08/09).
        const matchTexto = await detectarPlantillaAnuncio(mensajeUsuario)
        const matchRef = matchTexto ? null : await detectarPlantillaPorReferral(opciones.referralAnuncio)
        if (matchRef && matchRef.ambiguo) {
            console.warn(
                `[motor] el anuncio pega con varios kits del catálogo (${matchRef.candidatos.join(", ")}): no se entrega bienvenida, solo contexto`
            )
        }
        const matchPlantilla = matchTexto || (matchRef && !matchRef.ambiguo ? matchRef : null)

        const esElMismoKitYaPresentado =
            !!matchPlantilla &&
            ((matchPlantilla.tipo === "pack" && estadoConv.packPresentado?.id === matchPlantilla.id) ||
                (matchPlantilla.tipo === "grupo" && estadoConv.grupoPineado?.id === matchPlantilla.id))

        if (
            matchPlantilla &&
            matchPlantilla.mensajeBienvenida &&
            !(esElMismoKitYaPresentado && historialPrevio.length > 0)
        ) {
            const sanitizado = sanitizarMensajeSalida(matchPlantilla.mensajeBienvenida, {
                palabrasProhibidas: config.palabrasProhibidas,
                permitirBro: config.permitirBro,
                // Mid-charla: sacar el saludo inicial de la plantilla, pero el
                // cuerpo (kit, precio, pregunta) sale igual.
                esConversacionEnCurso: historialPrevio.length > 0
            })

            // El cliente casi nunca manda SOLO la plantilla: uno o dos segundos
            // después llega su pregunta real ("cuánto vale", "hacen envíos a
            // Santiago del Estero?") y el debounce las junta en una sola ráfaga.
            // Como el matcher usa `includes`, esa ráfaga entera daba match y el
            // turno terminaba acá: la pregunta quedaba sin responder (convs 2977
            // y 3657, 08/09). Ahora la bienvenida sale igual (letra exacta, foto,
            // costo $0) y el resto se resuelve en un turno normal, que ya ve el
            // kit como presentado y no repite la ficha.
            const resto = restoFueraDePlantilla(
                mensajeUsuario,
                matchTexto ? matchTexto.plantillaNormalizada : ""
            )

            // La moto ya la sabemos: la plantilla no puede volver a pedirla.
            // Puede saberse de antes (memoria) o venir en la MISMA ráfaga:
            // "quiero info del combo X" + "le anda a la wawe nf" cerraba igual
            // con "A qué moto se lo querés poner?" (conv 3660, 08/09).
            const motoEnLaRafaga = resto ? (await resolverMoto(resto)).confianza !== "ninguna" : false
            const textoFinal =
                estadoConv.motoConfirmada || motoEnLaRafaga
                    ? quitarPreguntaDeMotoFinal(sanitizado.textoLimpio)
                    : sanitizado.textoLimpio

            // Recordar que este kit/combo ya se presentó (ficha + foto): en los
            // turnos siguientes el modelo no repite la ficha ni se reenvía la
            // foto (extraerFotoDeBienvenida lo chequea contra este estado).
            if (matchPlantilla.tipo === "pack") {
                await guardarEstadoConversacion(estadoKey, {
                    packPresentado: {
                        id: matchPlantilla.id,
                        nombre: matchPlantilla.nombre,
                        precio: matchPlantilla.precio || 0
                    }
                }).catch(() => {})
            } else if (matchPlantilla.tipo === "grupo") {
                await guardarEstadoConversacion(estadoKey, {
                    grupoPineado: { id: matchPlantilla.id, nombre: matchPlantilla.nombre }
                }).catch(() => {})
            }

            const infoMatch: HerramientaEjecutadaInfo = {
                nombre: "match_plantilla_publicidad",
                argumentos: {
                    tipo: matchPlantilla.tipo,
                    id: matchPlantilla.id,
                    nombre: matchPlantilla.nombre
                },
                resultado: {
                    match_directo: true,
                    origen: "anuncio_instagram",
                    mensaje_para_agente: `Match directo con la plantilla de anuncio de '${matchPlantilla.nombre}'. Se entrega la bienvenida oficial del catálogo instantáneamente (costo \$0).`
                }
            }

            if (resto) {
                const turnoResto = await ejecutarTurnoAgente(
                    resto,
                    [
                        ...historialPrevio,
                        // El sub-turno tiene que saber DE QUÉ combo se trata, venga
                        // el kit del referral o de la plantilla escrita: si el
                        // cliente nombró su moto ahí, la consulta de compatibilidad
                        // hay que hacerla contra ESTE kit y no contra el que el
                        // modelo suponga. Antes el contexto se pasaba solo en el
                        // camino del referral (conv 3736, 09/09: le mandó el precio
                        // del combo y en vez de decirle que a la Wave NF no le entra,
                        // le repreguntó el modelo).
                        {
                            rol: "system" as const,
                            contenido:
                                `[El cliente entro por el anuncio de "${matchPlantilla.nombre}" y ya se le mando la ficha oficial de ese combo con la foto. ` +
                                `Contesta lo que escribio sin volver a presentarlo. ` +
                                `Si nombro su moto, verifica la compatibilidad contra ESE combo ("${matchPlantilla.nombre}") y, si no le entra, decíselo ` +
                                `— acaba de recibir el precio, no lo dejes creyendo que le sirve. ` +
                                (textoFinal.includes("?") && /moto/i.test(textoFinal)
                                    ? `La ficha que ya salió cierra preguntandole la moto, asi que NO se la vuelvas a preguntar: quedaria preguntada dos veces seguidas.]`
                                    : `]`)
                        },
                        { rol: "user", contenido: mensajeUsuario },
                        { rol: "assistant", contenido: textoFinal }
                    ],
                    // Sin el referral: el kit del anuncio ya se entrego y volver a
                    // pasarlo re-dispararia la bienvenida en el sub-turno.
                    { ...opciones, referralAnuncio: undefined }
                )

                // El resto escaló (dato que no tenemos): el pendiente ya está en la
                // bandeja del equipo, pero el cliente igual tiene que recibir la
                // bienvenida del anuncio que clickeó. Los escalados "duros"
                // (pide humano, reclamo, insulto) ni llegan acá: los corta el
                // detector determinista sobre la ráfaga completa, más arriba.
                if (turnoResto.escaladoHumano) {
                    if (!turnoResto.escaladoPersistido) {
                        await escalarAHumano({
                            motivo: turnoResto.motivoEscalado || "otro",
                            resumen_consulta: `Consulta que vino junto con la plantilla del anuncio: ${resto.slice(0, 300)}`,
                            conversation_id: opciones.conversationId
                        }).catch((err) => console.error("[motor] fallo al persistir escalado del resto de la ráfaga:", err))
                    }
                    return {
                        mensajeFinal: textoFinal,
                        mensajesFinales: [textoFinal],
                        fotoUrl: matchPlantilla.fotoUrl || undefined,
                        herramientasEjecutadas: [infoMatch, ...(turnoResto.herramientasEjecutadas || [])],
                        escaladoHumano: false,
                        latenciaMs: Date.now() - inicio,
                        tokensUsados: turnoResto.tokensUsados
                    }
                }

                return {
                    ...turnoResto,
                    mensajeFinal: [textoFinal, turnoResto.mensajeFinal]
                        .filter(Boolean)
                        .join("\n\n---\n\n"),
                    mensajesFinales: [textoFinal, ...(turnoResto.mensajesFinales || [])],
                    fotoUrl: matchPlantilla.fotoUrl || turnoResto.fotoUrl || undefined,
                    herramientasEjecutadas: [infoMatch, ...(turnoResto.herramientasEjecutadas || [])],
                    latenciaMs: Date.now() - inicio
                }
            }

            return {
                mensajeFinal: textoFinal,
                mensajesFinales: [textoFinal],
                fotoUrl: matchPlantilla.fotoUrl || undefined,
                herramientasEjecutadas: [infoMatch],
                escaladoHumano: false,
                latenciaMs: Date.now() - inicio,
                tokensUsados: sinCostoLLM(modelo)
            }
        }
    }

    const herramientasEjecutadas: HerramientaEjecutadaInfo[] = []
    let escaladoHumano = false
    let motivoEscalado: string | undefined
    // Se pone en true en cuanto alguna rama ejecuta `escalarAHumano`: el pendiente
    // ya quedó en la bandeja del equipo y nadie más debe volver a insertarlo.
    let escaladoPersistido = false

    const fechaHoraCordoba = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Cordoba",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date())

    // Bloques que se inyectan SOLO cuando aplican (mantienen el prompt base chico):
    //  - situaciones: reglas de casos puntuales (chat_situaciones) que pegan con este mensaje
    //  - memoria de estado: lo que ya quedó resuelto en la conversación (moto, variante...)
    const situaciones = await detectarSituaciones(mensajeUsuario).catch(() => [])
    const bloqueSituaciones = formatearBloqueSituaciones(situaciones)
    const bloqueEstado = formatearMemoriaEstado(estadoConv)

    // Patch de estado que se irá llenando con lo que resuelvan las herramientas
    // y se persiste al final del turno.
    const patchEstado: EstadoConversacion = {}
    const persistirEstado = () => guardarEstadoConversacion(estadoKey, patchEstado).catch(() => {})

    /**
     * Deja anotado en la memoria de la charla que esta consulta quedó derivada
     * al equipo. El turno siguiente lo lee: el bot no vuelve a hablar por encima
     * de algo que él mismo escaló, ni contesta la insistencia del cliente
     * (conv 3637, 08/09). Se limpia solo cuando un humano responde en el chat.
     */
    const anotarEscaladoPendiente = (motivo: string, resumen: string) => {
        if (patchEstado.escaladoPendiente) return // el primero de la ráfaga manda
        patchEstado.escaladoPendiente = { motivo, resumen, en: new Date().toISOString() }
    }

    // El cliente llegó de un anuncio que no resolvimos a un kit del catálogo (o
    // que pega con más de uno): el texto del anuncio es la única pista de qué
    // está mirando. Va como contexto para que lo busque, no como dato de venta.
    const bloqueAnuncio = opciones.referralAnuncio
        ? [
              "### ANUNCIO POR EL QUE ENTRÓ EL CLIENTE (Instagram/Facebook):",
              opciones.referralAnuncio.titulo ? `Título: ${opciones.referralAnuncio.titulo}` : "",
              opciones.referralAnuncio.cuerpo ? `Texto: ${opciones.referralAnuncio.cuerpo}` : "",
              "El cliente viene por ESE producto aunque no lo nombre. Buscalo en el catálogo con esos términos antes de preguntarle qué necesita. Si no lo encontrás, escalá: no inventes ni ofrezcas otro kit como si fuera el del anuncio."
          ]
              .filter(Boolean)
              .join("\n")
        : ""

    /**
     * PREFIJO ESTABLE (se cachea) — no meter acá NADA que cambie entre turnos.
     *
     * El proveedor cobra 90% menos por el tramo inicial del prompt que ya vio,
     * pero solo mientras sea byte a byte el mismo. Antes el contexto temporal
     * (con minutos) iba pegado acá arriba: cambiaba en cada request y tiraba
     * abajo el cacheo de todo lo que venía después, incluidas las definiciones
     * de herramientas. Entre prompt de sistema y tools son ~3.400 tokens de los
     * ~5.800 que gasta un turno: es la mitad de la factura de entrada.
     *
     * Todo lo variable vive ahora en `bloqueVariable`, que va al FINAL (ver
     * abajo). Como efecto secundario el modelo lo obedece mejor, porque queda
     * pegado al mensaje del cliente en vez de sepultado arriba de todo.
     */
    const promptEstable = config.tonoEstilo
        ? `${PROMPT_SISTEMA_AGENTE}\n\n### PAUTA DE ESTILO CONFIGURADA POR EL DUEÑO:\n${config.tonoEstilo}`
        : PROMPT_SISTEMA_AGENTE

    // Contexto de ESTE turno: cambia siempre, por eso va después del historial.
    const bloqueVariable = [
        `### CONTEXTO TEMPORAL ACTUAL EN EL LOCAL (Córdoba Capital):\nHoy es ${fechaHoraCordoba} hs.`,
        bloqueAnuncio,
        bloqueEstado,
        bloqueSituaciones
    ].filter(Boolean).join("\n\n")

    // Construir los mensajes para la API
    const mensajes: any[] = [
        { role: "system", content: promptEstable },
        ...historialPrevio.map((m) => {
            if (m.rol === "tool") {
                return {
                    role: "tool",
                    tool_call_id: m.tool_call_id,
                    name: m.nombre,
                    content: m.contenido
                }
            }
            if (m.rol === "assistant" && m.tool_calls) {
                return {
                    role: "assistant",
                    content: m.contenido || null,
                    tool_calls: m.tool_calls
                }
            }
            return {
                role: m.rol,
                content: m.contenido
            }
        }),
        // Va acá, entre el historial y el mensaje del cliente, para que el
        // prefijo cacheable (sistema + tools + historial) no cambie nunca.
        { role: "system", content: bloqueVariable },
        { role: "user", content: mensajeUsuario }
    ]

    let tokensTotales = sinCostoLLM(modelo)!
    let paso = 0

    // Proveedor que está atendiendo el turno. Puede cambiar al suplente en
    // cualquier paso si el principal se cae; los `mensajes` son los mismos para
    // los dos (formato OpenAI), así que el turno sigue donde quedó.
    let provActivo = proveedores[0]
    let indiceProv = 0

    /**
     * Los modelos de razonamiento de OpenAI (gpt-5*, o1*, o3*, o4*) NO aceptan
     * `temperature` distinto del default: mandarlo devuelve 400. Son los mismos
     * que aceptan `reasoning_effort`. Se evalúa por proveedor porque el suplente
     * puede ser de otra familia que el principal (DeepSeek -> gpt-5).
     */
    const esDeRazonamiento = (m: string) => /(^|\/)(gpt-5|o1|o3|o4)([.-]|$)/.test(m.toLowerCase())

    while (paso < MAX_PASOS_REACT) {
        paso++

        const cuerpo: Record<string, any> = {
            messages: mensajes,
            tools: definicionesHerramientas,
            tool_choice: "auto"
        }
        if (!esDeRazonamiento(provActivo.modelo)) {
            cuerpo.temperature = opciones.temperatura ?? 0.2
        }
        /**
         * Sin esto gpt-5 razona en `medium` por default y quema ~600 tokens de
         * razonamiento invisible por turno. Se pagan a precio de SALIDA, que es
         * 8x el de entrada: eran casi la mitad de la factura diaria para
         * redactar respuestas de WhatsApp de 40-80 tokens.
         *
         * `low` alcanza porque el trabajo difícil no lo hace el modelo: lo hacen
         * las herramientas (catálogo, compatibilidad, variante) y los nodos
         * determinísticos. El modelo enruta y redacta. Si alguna vez hay que
         * volver atrás, es `reasoning_effort` en chat_config, sin tocar código.
         */
        const effort = opciones.reasoningEffort ?? config.reasoningEffort
        if (esDeRazonamiento(provActivo.modelo) && effort) {
            cuerpo.reasoning_effort = effort
        }

        /**
         * Pide el paso al proveedor activo. Si se cayó del todo (ya agotó sus
         * reintentos con backoff) y hay suplente, se pasa a él y se reintenta
         * ESTE mismo paso: para el cliente el turno sigue normal, solo que lo
         * termina de contestar el otro modelo.
         */
        let data: any
        while (true) {
            try {
                data = await llamarLLM(provActivo, cuerpo)
                break
            } catch (err: any) {
                const siguiente = proveedores[indiceProv + 1]
                if (!siguiente) throw err // no hay red: que el turno falle y lo recupere el barrido
                console.error(
                    `[motor] ${provActivo.modelo} no respondió, se pasa al suplente ${siguiente.modelo}:`,
                    err?.message || err
                )
                indiceProv++
                provActivo = siguiente
                tokensTotales.fallback = true
                // El suplente puede no aceptar los mismos parámetros que el principal.
                if (esDeRazonamiento(provActivo.modelo)) {
                    delete cuerpo.temperature
                    if (effort) cuerpo.reasoning_effort = effort
                } else {
                    delete cuerpo.reasoning_effort
                    cuerpo.temperature = opciones.temperatura ?? 0.2
                }
            }
        }

        // El modelo que quede registrado es el que efectivamente contestó.
        tokensTotales.modelo = provActivo.modelo
        const mensajeAsistente = data.choices?.[0]?.message

        if (data.usage) {
            tokensTotales.prompt += data.usage.prompt_tokens || 0
            tokensTotales.completion += data.usage.completion_tokens || 0
            tokensTotales.total += data.usage.total_tokens || 0
            // `cacheados` es el termómetro del prefijo estable y `razonamiento`
            // el de la partida más cara. Los provee OpenAI; otros proveedores
            // pueden no mandarlos y quedan en 0.
            tokensTotales.cacheados += data.usage.prompt_tokens_details?.cached_tokens || 0
            tokensTotales.razonamiento += data.usage.completion_tokens_details?.reasoning_tokens || 0
        }
        tokensTotales.pasos = paso

        const llamadasTools: LlamadaHerramientaLLM[] = mensajeAsistente?.tool_calls || []

        // Si el modelo NO llamó a ninguna herramienta, redactó su respuesta final
        if (!llamadasTools || llamadasTools.length === 0) {
            const contenido = mensajeAsistente?.content || ""

            // Separar en múltiples mensajes si el modelo usó el delimitador de ráfaga
            const partesRaw = contenido
                .split(/---MENSAJE---|(?:\r?\n){2,}---(?:\r?\n){2,}/)
                .map((p: string) => p.trim())
                .filter(Boolean)

            const partes = partesRaw.length > 0 ? partesRaw : [contenido.trim()]

            // Guardrail duro: si el modelo filtró razonamiento interno, inglés o
            // la guía cruda de una herramienta, NO se manda nada dudoso al
            // cliente — se escala a un humano y silencio total.
            if (pareceRespuestaNoConfiable(contenido)) {
                console.warn("[motor] respuesta no confiable (posible fuga de razonamiento/inglés):", contenido.slice(0, 200))

                // Red de seguridad: si alguna herramienta de este turno dejó una
                // `pregunta_directa` (la pregunta_variante lista para enviar),
                // mandamos ESA en vez de quedarnos mudos + escalar.
                const preguntaDirecta = herramientasEjecutadas
                    .map((e) => e.resultado?.pregunta_directa)
                    .find((p): p is string => typeof p === "string" && p.trim().length > 0)

                if (preguntaDirecta && !pareceRespuestaNoConfiable(preguntaDirecta)) {
                    const s = sanitizarMensajeSalida(preguntaDirecta, {
                        palabrasProhibidas: config.palabrasProhibidas,
                        permitirBro: config.permitirBro,
                        esConversacionEnCurso: historialPrevio.length > 0,
                    })
                    if (s.textoLimpio) {
                        await persistirEstado()
                        return {
                            mensajeFinal: s.textoLimpio,
                            mensajesFinales: [s.textoLimpio],
                            herramientasEjecutadas,
                            escaladoHumano: false,
                            latenciaMs: Date.now() - inicio,
                            tokensUsados: tokensTotales,
                        }
                    }
                }

                await escalarAHumano({
                    motivo: "respuesta_no_confiable",
                    resumen_consulta: `El bot generó una respuesta sospechosa (posible fuga de instrucciones internas). Última consulta del cliente: ${mensajeUsuario.slice(0, 300)}`,
                    conversation_id: opciones.conversationId,
                }).catch((err) => console.error("[motor] fallo al persistir escalado por respuesta no confiable:", err))
                await persistirEstado()
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: true,
                    motivoEscalado: "respuesta_no_confiable",
                    escaladoPersistido: true,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: tokensTotales,
                }
            }

            // Lo que el bot ya dijo textualmente antes en esta charla. Sirve para
            // no repetir oraciones enteras (los ejemplos del prompt se usaban
            // como plantilla y salían idénticos dos mensajes seguidos).
            const dichoPorElBot = historialPrevio
                .filter((m) => m.rol === "assistant" && m.contenido)
                .map((m) => m.contenido)

            /**
             * Hechos que salieron de una herramienta EN ESTE TURNO: son la
             * respuesta a lo que el cliente acaba de pedir, no una repetición,
             * y el guardrail de hechos no los toca.
             *
             * Se excluye lo que `consultar_info_negocio` devuelve con
             * `ya_respondido: true`: ahí la herramienta misma está diciendo que
             * ese tema ya se contestó, así que sus datos no cuentan como frescos.
             */
            const hechosDeEsteTurno = new Set<string>()
            for (const ej of herramientasEjecutadas) {
                if (ej.resultado?.ya_respondido === true) continue
                for (const h of extraerHechos(JSON.stringify(ej.resultado ?? ""))) {
                    hechosDeEsteTurno.add(h)
                }
            }

            const mensajesFinalesSanitizados: string[] = []
            for (let i = 0; i < partes.length; i++) {
                const parte = partes[i]
                const esEnCurso = historialPrevio.length > 0 || i > 0
                const sanitizado = sanitizarMensajeSalida(parte, {
                    palabrasProhibidas: config.palabrasProhibidas,
                    permitirBro: config.permitirBro,
                    esConversacionEnCurso: esEnCurso
                })
                // Los globos ya emitidos en este mismo turno también cuentan.
                const yaDichoPorElBot = [...dichoPorElBot, ...mensajesFinalesSanitizados]
                const sinRepetidos = quitarOracionesYaDichas(sanitizado.textoLimpio, yaDichoPorElBot)
                // Segunda pasada: la de arriba solo atrapa la oración calcada.
                // Un modelo que parafrasea le pasa por al lado y el cliente
                // igual lee el mismo plazo o el mismo precio dos veces.
                const sinHechosRepetidos = quitarHechosYaDichos(sinRepetidos, yaDichoPorElBot, mensajeUsuario, hechosDeEsteTurno)
                if (sinHechosRepetidos && !pareceRespuestaNoConfiable(sinHechosRepetidos)) {
                    mensajesFinalesSanitizados.push(sinHechosRepetidos)
                }
            }

            const mensajeFinalUnificado = mensajesFinalesSanitizados.join("\n\n---\n\n")

            // El kit que queda en la memoria tiene que ser el que el cliente
            // realmente leyó, no cualquier otro que se haya buscado en el camino.
            const descartadosPorElMensaje = confirmarPresentadoSegunMensaje(
                patchEstado,
                herramientasEjecutadas,
                mensajeFinalUnificado
            )

            await persistirEstado()
            return {
                mensajeFinal: mensajeFinalUnificado || null,
                mensajesFinales: mensajesFinalesSanitizados,
                fotoUrl: extraerFotoDeBienvenida(herramientasEjecutadas, estadoConv, descartadosPorElMensaje),
                herramientasEjecutadas,
                escaladoHumano: false,
                latenciaMs: Date.now() - inicio,
                tokensUsados: tokensTotales
            }
        }

        // Si el modelo solicitó herramientas:
        // IMPORTANTE: Ignoramos cualquier texto intermedio que el modelo haya querido balbucear
        // como "Un momento, voy a consultar...". Las herramientas se ejecutan en silencio absoluto.
        mensajes.push({
            role: "assistant",
            content: null,
            tool_calls: llamadasTools
        })

        // Ejecutar cada herramienta
        for (const call of llamadasTools) {
            try {
                const ejecucion = await ejecutarHerramienta(call.function.name, call.function.arguments, {
                    conversationId: opciones.conversationId,
                    // Lo ya contestado antes en esta charla + lo contestado en
                    // los pasos previos de ESTE turno (una ráfaga puede tocar
                    // el mismo tema dos veces).
                    temasYaRespondidos: [
                        ...(estadoConv.temasRespondidos || []),
                        ...(patchEstado.temasRespondidos || [])
                    ],
                    // Punto del embudo: SOLO lo que venía de turnos anteriores
                    // (`estadoConv`), nunca lo que se resolvió recién en este
                    // turno. "Ya presentado" significa "el cliente ya lo leyó";
                    // si en la primera vuelta `resolver_variante` pinea el combo
                    // y en la segunda se consulta el catálogo, la ficha todavía
                    // no salió y hay que entregarla.
                    embudo: {
                        grupoPineadoId: estadoConv.grupoPineado?.id ?? null,
                        packPresentadoId: estadoConv.packPresentado?.id ?? null,
                        varianteResuelta: estadoConv.varianteResuelta ?? null
                    }
                })
                herramientasEjecutadas.push(ejecucion)

                // 1. Si la herramienta fue explícitamente escalar_a_humano
                if (call.function.name === "escalar_a_humano") {
                    escaladoHumano = true
                    motivoEscalado = ejecucion.argumentos?.motivo || "escalado_manual"
                    // El propio ejecutor de la herramienta ya insertó el pendiente.
                    escaladoPersistido = true
                    anotarEscaladoPendiente(
                        motivoEscalado || "escalado_manual",
                        ejecucion.argumentos?.resumen_consulta || mensajeUsuario
                    )
                }

                // 1.b resolver_variante puede pedir escalado (moto no registrada en un
                //     combo con incompatibilidad física real): se honra en el acto.
                if (call.function.name === "resolver_variante" && ejecucion.resultado?.escalar === true) {
                    escaladoHumano = true
                    motivoEscalado = ejecucion.resultado?.motivo || "moto_no_registrada"
                    escaladoPersistido = true
                    anotarEscaladoPendiente(
                        motivoEscalado || "moto_no_registrada",
                        `Compatibilidad de "${ejecucion.argumentos?.modelo_moto || "?"}" con "${ejecucion.argumentos?.combo || "?"}" (el cliente escribió: "${mensajeUsuario.slice(0, 160)}").`
                    )
                    await escalarAHumano({
                        motivo: ejecucion.resultado?.motivo || "moto_no_registrada",
                        resumen_consulta: `Variante no resuelta para "${ejecucion.argumentos?.modelo_moto || "?"}" en combo "${ejecucion.argumentos?.combo || "?"}".`,
                        modelo_moto: ejecucion.argumentos?.modelo_moto,
                        kit: ejecucion.argumentos?.combo,
                        conversation_id: opciones.conversationId
                    }).catch((err) => console.error("[motor] fallo al persistir escalado de resolver_variante:", err))
                }

                // 2. REGLA DETERMINISTA DE ORO: Si consultó compatibilidad y NO se encontró,
                //    se escala en silencio Y se persiste el pendiente linkeado a la conversación.
                if (
                    call.function.name === "consultar_compatibilidad" &&
                    ejecucion.resultado?.encontrado === false &&
                    ejecucion.resultado?.confianza !== "parcial"
                ) {
                    escaladoHumano = true
                    const moto = ejecucion.argumentos?.modelo_moto || "desconocida"
                    motivoEscalado = `moto_no_registrada: ${moto}`
                    escaladoPersistido = true
                    anotarEscaladoPendiente(
                        "moto_no_registrada",
                        `Compatibilidad no confirmada para "${moto}" (el cliente escribió: "${mensajeUsuario.slice(0, 160)}").`
                    )
                    await escalarAHumano({
                        motivo: "moto_no_registrada",
                        resumen_consulta: `Compatibilidad no confirmada para "${moto}"${ejecucion.argumentos?.kit_nombre_o_id ? ` con "${ejecucion.argumentos.kit_nombre_o_id}"` : ""}.`,
                        modelo_moto: moto,
                        kit: ejecucion.argumentos?.kit_nombre_o_id,
                        conversation_id: opciones.conversationId
                    }).catch((err) => console.error("[motor] fallo al persistir moto_no_registrada:", err))
                }

                // El modelo ve SOLO `mensaje_para_agente`: es el contrato de cada
                // herramienta (qué mostrar y qué NO mostrar en este paso). Los arrays
                // crudos (packs, grupos, variantes...) quedan en el inspector y la base
                // pero NO llegan al modelo, para que no contradiga la guía del paso.
                const contenidoParaModelo =
                    ejecucion.resultado && typeof ejecucion.resultado.mensaje_para_agente === "string"
                        ? ejecucion.resultado.mensaje_para_agente
                        : JSON.stringify(ejecucion.resultado)

                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: contenidoParaModelo
                })
            } catch (err: any) {
                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({ error: err.message || "Error al ejecutar herramienta" })
                })
            }
        }

        // Capturar en el patch de estado lo que resolvieron las herramientas de este paso.
        for (const ej of herramientasEjecutadas) {
            const r = ej.resultado || {}
            if (ej.nombre === "consultar_catalogo_y_precios" && Array.isArray(r.grupos) && r.grupos.length === 1 && (r.packs?.length ?? 0) === 0) {
                patchEstado.grupoPineado = { id: r.grupos[0].id, nombre: r.grupos[0].nombre }
            }
            // Un solo pack suelto resuelto (kit sin grupo): queda "presentado".
            if (
                ej.nombre === "consultar_catalogo_y_precios" &&
                Array.isArray(r.packs) && r.packs.length === 1 &&
                (r.grupos?.length ?? 0) === 0 &&
                !r.packs[0].grupo_id
            ) {
                patchEstado.packPresentado = {
                    id: r.packs[0].id,
                    nombre: r.packs[0].nombre,
                    precio: Number(r.packs[0].precio) || 0
                }
            }
            if (ej.nombre === "resolver_variante") {
                if (r.grupo_id && patchEstado.grupoPineado === undefined) {
                    patchEstado.grupoPineado = { id: r.grupo_id, nombre: ej.argumentos?.combo || "" }
                }
                if (r.resuelta && r.variante_pack_id) {
                    patchEstado.varianteResuelta = { packId: r.variante_pack_id, etiqueta: r.etiqueta || "", precio: r.precio || 0 }
                }
                if (r.moto_confirmada && patchEstado.motoConfirmada === undefined) {
                    patchEstado.motoConfirmada = r.moto_confirmada
                }
            }
            if (ej.nombre === "consultar_compatibilidad" && r.compatible === true && r.modelo_moto_detectado) {
                patchEstado.motoConfirmada = r.modelo_moto_detectado
            }
            // Tema de negocio efectivamente entregado: queda anotado para que el
            // turno siguiente no vuelva a volcar el mismo bloque (conv 3561).
            if (ej.nombre === "consultar_info_negocio" && r.encontrado === true && r.tema) {
                patchEstado.temasRespondidos = unirTemas(patchEstado.temasRespondidos, [r.tema])
            }
        }

        // Si se activó escalado a humano (por la herramienta o por regla determinista de compatibilidad):
        // SILENCIO TOTAL: El bot NO envía ningún mensaje al cliente de WhatsApp.
        if (escaladoHumano) {
            await persistirEstado()
            return {
                mensajeFinal: null, // Silencio total cara al cliente
                herramientasEjecutadas,
                escaladoHumano: true,
                motivoEscalado,
                escaladoPersistido,
                latenciaMs: Date.now() - inicio,
                tokensUsados: tokensTotales
            }
        }

        // Si no escaló, el loop continúa hacia el paso siguiente pasando los resultados de las herramientas
    }

    // Si agotó los pasos máximos sin respuesta, escalar por seguridad
    anotarEscaladoPendiente("limite_pasos_react_superado", mensajeUsuario.slice(0, 300))
    await persistirEstado()
    return {
        mensajeFinal: null,
        herramientasEjecutadas,
        escaladoHumano: true,
        motivoEscalado: "limite_pasos_react_superado",
        // Nadie llamó a `escalarAHumano` en esta salida: el consumidor debe
        // persistir el pendiente para que el equipo vea la conversación.
        escaladoPersistido: false,
        latenciaMs: Date.now() - inicio,
        tokensUsados: tokensTotales
    }
}
