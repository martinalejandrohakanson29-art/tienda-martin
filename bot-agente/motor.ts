import { MensajeChat, RespuestaAgente, HerramientaEjecutadaInfo, LlamadaHerramientaLLM } from "./tipos"
import { definicionesHerramientas, ejecutarHerramienta } from "./herramientas"
import { escalarAHumano } from "./herramientas/escalar-humano"
import { admiteRespuestaParcial } from "./nucleo/motivos-escalado"
import { PROMPT_SISTEMA_AGENTE } from "./prompts/sistema"
import { sanitizarMensajeSalida, pareceRespuestaNoConfiable, quitarOracionesYaDichas, quitarHechosYaDichos, extraerHechos, quitarDerivacionAnunciada, quitarNegativaSobreLoDerivado, oracionesQueNieganVentaSuelta, quitarOraciones, afirmaCompatibilidad, afirmaTenerParaSuMoto, ofreceProductosParaLaMoto, presentaPrecioDeProducto, cuentaProductosNombrados, oracionQuePreguntaLaMoto } from "./guardrails/sanitizador"
import { obtenerConfiguracionAgente, ConfiguracionAgente } from "./configuracion"
import { detectarSituaciones, formatearBloqueSituaciones } from "./situaciones"
import { esConsultaCoberturaEnvio } from "./herramientas/info-negocio"
import { quitarPreguntaDeMotoFinal, restoFueraDePlantilla, normalizarTexto, formatearPrecioAR } from "./nucleo/texto"
import { pideOtroProductoQueElAnuncio } from "./nucleo/otro-producto-anuncio"
import { pideOtraCilindradaQueElProducto } from "./nucleo/cilindrada-objetivo"
import { conversionDesdeMotorAjeno } from "./nucleo/conversion-pedida"
import { empaquetarLectura, leerNumeros, lecturaYaHecha } from "./nucleo/numeros-del-mensaje"
import { piezaQueVendemosSuelta } from "./nucleo/venta-suelta"
import { coincideIntencionDirecta } from "./nucleo/afirmaciones"
import { mismaConsultaCompatibilidad, tieneVeredictoCompatibilidad, algunProductoLeVa } from "./nucleo/consulta-compatibilidad"
import { bloqueLetraDeLaCasa, bloqueCierresDeLaCasa } from "./frases"
import {
    condicionSuperada,
    guiaCondicionSuperada,
    guiaNegativaYaEntregada
} from "./nucleo/negativa-condicional"
import { resolverMoto, cilindradaSinMarca, marcaConCilindradaSinModelo, motoDesconocidaMencionada, guiaMotoDesconocida } from "./nucleo/motos"
import {
    cargarEstadoConversacion,
    guardarEstadoConversacion,
    formatearMemoriaEstado,
    unirTemas,
    esInsistenciaSinContenido,
    esCharlaNueva,
    EstadoConversacion
} from "./nucleo/estado-persistente"
import { debeCallarPorCierreSocial, esDespedidaDelBot, pareceNoTeEntendi } from "./nucleo/cierre-social"
import { debeCallarPorAcuseDeRecibo, elBotDejoUnPedidoPendiente } from "./nucleo/acuse-de-recibo"
import {
    pideAlternativaTrasNegativa,
    resumenAlternativaTrasNegativa
} from "./nucleo/alternativa-tras-negativa"

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
     * Pisa el `deepseek_thinking` de chat_config para ESTA llamada (`enabled` |
     * `disabled`), con el mismo propósito que `reasoningEffort`: medir contra el
     * banco sin escribir la config que lee producción.
     */
    thinking?: string
    /**
     * Anuncio de Meta por el que entró el cliente (`content_attributes.referral`
     * del mensaje de Chatwoot). El texto del cliente no dice de qué kit viene;
     * el anuncio sí.
     */
    referralAnuncio?: { titulo?: string | null; cuerpo?: string | null }
    /**
     * Globos que YA se le mandaron al cliente como parte de ESTA MISMA ráfaga,
     * antes de llamar a este turno. Hoy lo usa el camino de plantilla de
     * anuncio: la ficha oficial sale primero y el "resto" de la ráfaga se
     * resuelve en un sub-turno.
     *
     * Sirve para desactivar la excepción de "hechos frescos" sobre los datos
     * que esos globos ya dijeron. Sin esto, si el resto de la ráfaga era
     * "cuánto sale", el sub-turno llamaba a `consultar_catalogo_y_precios`, sus
     * precios quedaban marcados como frescos y el guardrail de hechos dejaba
     * pasar el mismo precio dos veces con tres segundos de diferencia
     * (conv 3859, 10/09: la ficha daba $175.000 / $189.000 / envío gratis y el
     * globo siguiente repetía los tres).
     */
    globosYaEmitidos?: string[]
}

const DEFAULT_MODEL = "gpt-5" // Modelo de producción (chat_config.proveedor_activo lo puede pisar)
const DEFAULT_BASE_URL = "https://api.openai.com/v1"
/**
 * ESCALADO PARCIAL — contrato que se le inyecta al modelo cuando una parte de
 * la ráfaga se derivó al equipo pero el turno puede seguir.
 *
 * Por qué existe (conv 3421, 09/09): el cliente mandó "Para una brava nevada
 * 110" y "Que marca es el cilindro" en la misma ráfaga. La marca del cilindro
 * no está cargada en ninguna tabla, así que el bot escaló — correcto. Pero el
 * escalado muteaba el TURNO ENTERO, y la compatibilidad de la Brava 110, que sí
 * estaba cargada y confirmada, se fue al silencio con él. El cliente no recibió
 * nada y contestó un humano diez minutos después.
 *
 * Desde acá el escalado deja muda SOLO la consulta derivada: lo que una
 * herramienta ya respondió se le sigue contestando al cliente.
 *
 * El centinela SIN_RESPUESTA es la salida honesta cuando no quedó nada que
 * decir: sin él el modelo rellena con una frase de compromiso.
 */
const CONTRATO_ESCALADO_PARCIAL = [
    "",
    "--- ESA CONSULTA QUEDO DERIVADA AL EQUIPO (silencio solo sobre ESE punto) ---",
    "1. No la contestes, no la aproximes y no opines sobre ella: no tenemos el dato.",
    "2. No le anuncies al cliente que la derivaste, que la consultas, que averiguas ni que le avisas despues. El equipo entra en la charla sin anunciarse.",
    "3. Si en el MISMO mensaje el cliente pregunto OTRA cosa, resolvela igual: llama a la herramienta que corresponda y contestale SOLO eso, corto y sin mencionar lo derivado.",
    "4. Si no queda nada mas para contestar con datos de una herramienta, respondes unicamente: SIN_RESPUESTA",
].join("\n")

/**
 * Escalado que NO admite respuesta parcial (reclamo, mayorista, motivo que
 * no entendemos): silencio absoluto. El motor corta el turno igual sin
 * volver a llamar al modelo; esto es para el simulador y el banco, donde el
 * resultado de la herramienta se lee tal cual.
 */
const SUFIJO_SILENCIO_TOTAL =
    "\nRegla de oro: no envies NINGUN mensaje al cliente en este turno. El equipo humano continua la conversacion."

/**
 * LA FICHA DEL PRODUCTO SE MIRA ANTES DE DERIVAR.
 *
 * Preámbulo que reemplaza al resultado de `escalar_a_humano` cuando el modelo
 * deriva una duda técnica del producto sin haber consultado el catálogo en el
 * turno. No se derivó nada todavía: se le entrega la composición oficial y
 * decide de nuevo. Si el dato no está, vuelve a escalar y esa vez sí se deriva.
 */
const PREAMBULO_FICHA_ANTES_DE_ESCALAR = [
    "TODAVIA NO SE DERIVO NADA. Ibas a derivar una duda tecnica del producto sin haber mirado su ficha en este turno.",
    "Estos son los datos oficiales del producto del que estan hablando:",
    ""
].join("\n")

const CIERRE_FICHA_ANTES_DE_ESCALAR = [
    "",
    "--- QUE HACES CON ESTO ---",
    "1. Si lo que pregunto el cliente esta contestado arriba, contestaselo con tus palabras, en 1 o 2 renglones, y NO derives.",
    "2. Si el dato NO esta arriba, ejecuta escalar_a_humano de nuevo con el mismo motivo: esa vez si se deriva y guardas silencio sobre ese punto.",
    "3. No le cuentes al cliente nada de esto.",
    "4. Esto es material de consulta, NO un libreto: el cliente ya vio la presentacion del kit. PROHIBIDO volver a mandarle el texto de bienvenida, los precios, las dos variantes o la ficha entera. Contestas SOLO lo que pregunto."
].join("\n")

/**
 * ¿Esta llamada a `escalar_a_humano` se contesta con la ficha en vez de
 * derivarse? Solo la primera duda técnica del turno, y solo si el modelo no
 * miró el catálogo y hay un kit en el embudo del que sacar la composición.
 *
 * Es el gate del fix de la conv 4317 (ver el bloque en `ejecutarTurnoAgente`),
 * separado acá para poder probarlo sin levantar un turno entero.
 */
export function debeServirFichaAntesDeEscalar(datos: {
    nombreHerramienta: string
    argumentosCrudos: string | null | undefined
    yaMiroElCatalogo: boolean
    fichaYaServida: boolean
    kitEmbudoId: number | null
    packEmbudoId: number | null
}): boolean {
    if (datos.nombreHerramienta !== "escalar_a_humano") return false
    if (datos.fichaYaServida || datos.yaMiroElCatalogo) return false
    if (!datos.kitEmbudoId && !datos.packEmbudoId) return false

    let motivoPedido = ""
    try {
        motivoPedido = String(JSON.parse(datos.argumentosCrudos || "{}")?.motivo || "")
    } catch {
        motivoPedido = ""
    }
    // El motivo puede venir como "consulta_tecnica: no se si la tapa...".
    return motivoPedido.split(":")[0].trim() === "consulta_tecnica"
}

/** Centinela con el que el modelo pide silencio total en un escalado parcial. */
const CENTINELA_SIN_RESPUESTA = /(^|\s)SIN[_ ]RESPUESTA(\s|$|\.)/i

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
 * Traduce un `proveedor_activo` de chat_config ("deepseek:deepseek-flash",
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
        modelo = modelo || "deepseek-flash"
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
    descartados: { packsDescartados: Set<number>; gruposDescartados: Set<number> },
    mensajeFinal: string
): string | undefined {
    // `resolver_variante` también presenta: cuando el cliente elige un combo de
    // un menú ("el primero"), el modelo va derecho a esa herramienta y la ficha
    // sale desde ahí (ver `fichaPendiente` en resolver-variante.ts). Sin esta
    // rama la ficha salía sin su foto (conv 4401, 17/09).
    for (const ej of herramientasEjecutadas) {
        if (ej.nombre !== "resolver_variante") continue
        const r = ej.resultado || {}
        const foto = typeof r.foto_url === "string" ? r.foto_url.trim() : ""
        if (!foto) continue
        if (r.grupo_id && estadoConv.grupoPineado?.id === r.grupo_id) continue
        // Mismo criterio que abajo: la foto sale solo si el mensaje que se envía
        // es de verdad el de ese kit (su precio aparece en el texto).
        const precios: number[] = Array.isArray(r.precios_ficha) ? r.precios_ficha : []
        const presentaElKit =
            precios.length === 0 || precios.some((precio) => precioApareceEnTexto(mensajeFinal, precio))
        if (presentaElKit) return foto
    }

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

        // El mensaje tiene que PRESENTAR ese kit para que la foto tenga sentido.
        // Es el mismo criterio de `confirmarPresentadoSegunMensaje` (el precio
        // del kit en el texto), que hasta ahora solo corría cuando en el turno
        // había varias búsquedas. Con una sola no se chequeaba nada: en la conv
        // 4194 el mensaje era "si, vendemos repuestos, decime qué pieza buscás"
        // y salió con la foto del kit dakar 200 pegada, un kit que el texto ni
        // nombra. Si el kit no tiene precio cargado no se exige nada (no hay
        // evidencia posible) y la foto sale como siempre.
        const precios: number[] = pack
            ? [Number(pack.precio) || 0]
            : (grupo?.variantes || []).map((v: { precio: number }) => Number(v.precio) || 0)
        const presentaElKit =
            precios.every((p) => !p) || precios.some((p) => precioApareceEnTexto(mensajeFinal, p))
        if (!presentaElKit) continue

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
export function detectarEscaladoDeterminista(msg: string): { motivo: string; resumen: string } | null {
    const texto = (msg || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()

    if (!texto) return null

    // 1. Pedido explícito e inequívoco de hablar con un humano
    const rxHumano = /\b(pasame|comunicame|quiero hablar|atendeme|derivar(me)?|hablar)\s+(con\s+)?(un\s+|una\s+)?(humano|persona|asesor|alguien\s+real)\b/i
    if (coincideIntencionDirecta(texto, rxHumano) || texto === "humano" || texto === "persona real" || texto === "pasame con alguien") {
        return {
            motivo: "cliente_pide_humano",
            resumen: "El cliente solicitó expresamente ser atendido por un asesor o persona humana."
        }
    }

    // 2. Insultos o agresiones graves explícitas
    const rxAgresion = /\b(estafadores?|ladrones?|garcas?|hijos? de puta|concha de tu madre|hdp|sinverguenzas?|chorros?)\b/i
    if (coincideIntencionDirecta(texto, rxAgresion)) {
        return {
            motivo: "cliente_agresivo",
            resumen: `Mensaje con agresión o insultos directos: "${msg}"`
        }
    }

    // 3. Reclamo postventa explícito y crítico
    const rxReclamo = /\b(vino rot[ao]|lleg[oó] rot[ao]|vino fallad[ao]|paquete rot[ao]|hacer un reclamo|reclamo por (el |mi )?(envio|pedido|paquete|compra)|no me lleg[oó] (el |mi )?(pedido|paquete|compra))\b/i
    if (coincideIntencionDirecta(texto, rxReclamo)) {
        return {
            motivo: "reclamo_postventa",
            resumen: `Reclamo explícito del cliente: "${msg}"`
        }
    }

    // 4. Pedido explícito de link (Mercado Libre, publicación, link de pago)
    //
    // EXCEPCIÓN (14/09): el link de NUESTRA página oficial de Mercado Libre sí
    // lo tenemos cargado (info_negocio, fila `garantia`) y desde hoy es parte
    // del argumento de confianza: al que no se anima a transferir por adelantado
    // se le ofrece comprar por ML con compra protegida. Escalar ese pedido
    // dejaba al bot ofreciendo una salida y callándose cuando se la pedían.
    // Lo que sigue escalando es lo que de verdad no tenemos a mano: el link de
    // una PUBLICACIÓN puntual y cualquier link de PAGO (ese lo arma un humano).
    const rxNuestraPaginaML = /\b(mercado\s*libre|mercadolibre|meli)\b/i
    const rxPublicacionPuntual = /\b(publicacion|publicación|aviso|anuncio|articulo|artículo|item|producto)\b/i
    const rxLinkDePago = /\b(mercado\s*pago|mercadopago|link\s+de\s+pago|pagar|pago)\b/i
    const pideNuestraPaginaML =
        rxNuestraPaginaML.test(texto) && !rxPublicacionPuntual.test(texto) && !rxLinkDePago.test(texto)

    const rxLinkML = /\b(link|enlace|publicacion)\s+(de\s+)?(mercadolibre|mercado\s+libre|ml|pago|mercadopago|mercado\s+pago)\b/i
    const rxLinkGenerico = /\b(pasame|mandame|pasa|manda|tenes|comparti(me)?|dame)\s+(el\s+|un\s+)?(link|enlace|publicacion)\b/i
    if (!pideNuestraPaginaML && (rxLinkML.test(texto) || rxLinkGenerico.test(texto))) {
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

    // La variante de la moto anterior deja de ser firme cuando el cliente
    // nombra otro modelo. Es un dato del cliente, no una entrega del bot.
    if (estadoConv.varianteResuelta && (estadoConv.motoMencionada || estadoConv.motoConfirmada)) {
        const [actual, anterior] = await Promise.all([
            resolverMoto(mensajeUsuario),
            resolverMoto(estadoConv.motoMencionada || estadoConv.motoConfirmada || "")
        ])
        if (actual.modelo && (!anterior.modelo || actual.modelo.id !== anterior.modelo.id)) {
            estadoConv.varianteResuelta = null
            estadoConv.motoConfirmada = null
            estadoConv.motoMencionada = actual.modelo.nombre_completo
            await guardarEstadoConversacion(estadoKey, {
                varianteResuelta: null,
                motoConfirmada: null,
                motoMencionada: actual.modelo.nombre_completo
            })
        }
    }

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

    // 0.b El local ya se despidió y lo que llega es puro trámite social
    //     ("dale mil gracias buen finde", "de una", "💪🏼💪🏼"). En el mostrador
    //     eso no se contesta: se devuelve UNA cortesía y se deja ir al cliente.
    //     El bot venía quedándose siempre con la última palabra y encadenaba
    //     despedidas de a tres (convs 3988, 3960, 3985 — 11/09). Silencio a $0.
    const ultimoMensajeDelBot = [...historialPrevio].reverse().find((m) => m.rol === "assistant" && m.contenido)?.contenido
    /** Todo lo que el bot ya dijo en esta charla, junto (ver `EstadoEmbudo.textoPreviosDelBot`). */
    const textoQueElBotYaDijo = historialPrevio
        .filter((m) => m.rol === "assistant" && m.contenido)
        .map((m) => m.contenido)
        .join("\n")
    if (debeCallarPorCierreSocial(mensajeUsuario, ultimoMensajeDelBot, historialPrevio.length > 0)) {
        return {
            mensajeFinal: null,
            mensajesFinales: [],
            herramientasEjecutadas: [
                {
                    nombre: "cierre_social",
                    argumentos: { mensaje: mensajeUsuario },
                    resultado: {
                        mensaje_para_agente:
                            "La charla ya se cerró y el cliente solo saluda o agradece. Silencio: no hace falta tener la última palabra."
                    }
                }
            ],
            escaladoHumano: false,
            latenciaMs: Date.now() - inicio,
            tokensUsados: sinCostoLLM(modelo)
        }
    }

    // 0.b.bis La pelota sigue del lado del cliente: le pedimos que vaya a medir
    //     la leva y lo que vuelve es un "bueno", un "D1" o un "sale meta". No
    //     hay nada que contestar; el bot venía improvisando un "no te entendí"
    //     o repitiendo el sermón de la medida (convs 4172 y 4206, 14-15/09).
    if (debeCallarPorAcuseDeRecibo(mensajeUsuario, ultimoMensajeDelBot, historialPrevio.length > 0)) {
        return {
            mensajeFinal: null,
            mensajesFinales: [],
            herramientasEjecutadas: [
                {
                    nombre: "acuse_de_recibo",
                    argumentos: { mensaje: mensajeUsuario },
                    resultado: {
                        mensaje_para_agente:
                            "El cliente solo acusó recibo de un pedido que sigue abierto de su lado. Silencio: se espera el dato."
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

    // 0.c Ya le dijimos que el kit no le va a su moto y ahora pregunta si tenemos
    //     otra cosa para esa misma moto ("Y algo para esa no tenes ??", conv 4186).
    //     No hay ninguna alternativa confirmada por el sistema —la compat se
    //     consulta producto -> moto, nunca al revés— así que el modelo se queda
    //     sin dato y rellena: la vez pasada le devolvió un menú de categorías
    //     inventado y le prometió "las opciones y precios que tenemos para esa".
    //     Silencio y a la bandeja técnica, que es quien sabe si hay algo.
    if (pideAlternativaTrasNegativa(mensajeUsuario, estadoConv.negativaEntregada)) {
        const negativa = estadoConv.negativaEntregada!
        const resumen = resumenAlternativaTrasNegativa(negativa, mensajeUsuario)
        const motivo = "compatibilidad_dudosa"

        const resultado = await escalarAHumano({
            motivo,
            resumen_consulta: resumen,
            modelo_moto: negativa.moto,
            kit: negativa.kit || undefined,
            conversation_id: opciones.conversationId
        }).catch((err) => {
            console.error("[motor] fallo al persistir escalado por alternativa tras negativa:", err)
            return {
                escalado: true,
                motivo,
                resumen,
                mensaje_para_agente: "ESCALADO DETERMINISTA (no se pudo persistir)."
            }
        })

        await guardarEstadoConversacion(estadoKey, {
            escaladoPendiente: { motivo, resumen, en: new Date().toISOString() }
        }).catch(() => {})

        return {
            mensajeFinal: null,
            mensajesFinales: [],
            herramientasEjecutadas: [
                {
                    nombre: "escalar_a_humano",
                    argumentos: { motivo, resumen_consulta: resumen, modelo_moto: negativa.moto },
                    resultado
                }
            ],
            escaladoHumano: true,
            motivoEscalado: motivo,
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

    /**
     * Los números del mensaje, leídos UNA vez por turno con su rol (la
     * cilindrada de su moto, a cuánto quiere llevarla, la medida que pide).
     *
     * Mismo principio que `motoDelMensajeTurno` más abajo: el dato se resuelve
     * una sola vez acá y viaja en el embudo hasta las tools. Antes cada rama lo
     * leía por su cuenta —la de la plantilla del anuncio, acá abajo, y
     * `resolver_variante` adentro de la tool— y un número podía terminar con un
     * rol distinto según por dónde entrara la charla.
     *
     * Va ANTES del bloque de la plantilla porque esa rama es la primera que lo
     * necesita. Ver `nucleo/numeros-del-mensaje.ts` para la precedencia.
     */
    const numerosDelTurno = empaquetarLectura(mensajeUsuario, await leerNumeros(mensajeUsuario))

    // 1.bis El cliente pide un kit para pasar de UN motor a OTRO y el motor del
    //     que parte no es ninguno de los que potenciamos ("un kit de 70 a 110",
    //     conv 4475 — tenía una Motomel Eco 70). No hay producto que ofrecerle:
    //     `cilindradas_base` arranca en 105. Antes el "70" se leía como la
    //     medida de un kit y el "110" como ruido, y el turno terminaba
    //     ofreciéndole los dos combos que potencian una 110 a 120 — la pregunta
    //     del aviso, no la suya.
    //
    //     Va ANTES del match de plantilla: acá el cliente entró por el anuncio
    //     de la 110 y escribió libre, así que no hay plantilla ni `resto` donde
    //     el hermano `pideOtraCilindradaQueElProducto` pudiera verlo. Y va antes
    //     del modelo porque el destino ("110") coincide con el del aviso: con la
    //     ficha sobre la mesa, cualquier turno normal la lee como la respuesta.
    //
    //     Silencio total aunque la ráfaga traiga algo más: lo que el cliente vino
    //     a preguntar es de qué motor parte, y el resto cuelga de eso.
    const conversionAjena = await conversionDesdeMotorAjeno(
        mensajeUsuario,
        lecturaYaHecha(numerosDelTurno, mensajeUsuario)
    )

    if (conversionAjena) {
        const motivo = "consulta_tecnica"
        const resumen =
            `Pide un kit para pasar de ${conversionAjena.base} a ${conversionAjena.objetivo}` +
            ` ("${conversionAjena.frase}") y no tenemos nada para un motor de ${conversionAjena.base}: ` +
            mensajeUsuario.slice(0, 300)

        const resultado = await escalarAHumano({
            motivo,
            resumen_consulta: resumen,
            conversation_id: opciones.conversationId
        }).catch((err) => {
            console.error("[motor] fallo al persistir escalado por conversión desde motor ajeno:", err)
            return {
                escalado: true,
                motivo,
                resumen,
                mensaje_para_agente: "ESCALADO DETERMINISTA (no se pudo persistir)."
            }
        })

        await guardarEstadoConversacion(estadoKey, {
            escaladoPendiente: { motivo, resumen, en: new Date().toISOString() }
        }).catch(() => {})

        return {
            mensajeFinal: null,
            mensajesFinales: [],
            herramientasEjecutadas: [
                {
                    nombre: "escalar_a_humano",
                    argumentos: { motivo, resumen_consulta: resumen },
                    resultado
                }
            ],
            escaladoHumano: true,
            motivoEscalado: motivo,
            escaladoPersistido: true,
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
        const { detectarPlantillaAnuncio, detectarPlantillaPorReferral, detectarPlantillasEnLaRafaga } = await import(
            "./herramientas/catalogo-precios"
        )

        // El cliente clickeó VARIOS anuncios seguidos y el debounce juntó sus
        // plantillas en una sola ráfaga (conv 4149, 14/09: el 200, el 170+leva y
        // el 220 en cinco minutos). Antes se entregaba la ficha de uno solo —el
        // que ganara el match— y los otros quedaban colgando o se derivaban.
        //
        // No lo adivinamos por él: se le devuelve la pregunta con la letra de la
        // casa (chat_config.mensaje_varios_kits), costo $0. A propósito NO se
        // enumeran los kits: los nombres del catálogo son internos.
        const plantillasEnLaRafaga = await detectarPlantillasEnLaRafaga(mensajeUsuario)
        if (plantillasEnLaRafaga.length > 1) {
            const pregunta = sanitizarMensajeSalida(config.mensajeVariosKits, {
                palabrasProhibidas: config.palabrasProhibidas,
                permitirBro: config.permitirBro,
                esConversacionEnCurso: historialPrevio.length > 0
            }).textoLimpio

            // Preguntar dos veces lo mismo es peor que no preguntar: si ya salió
            // en esta charla, el turno sigue de largo y lo resuelve el modelo con
            // el catálogo (o deriva, que es la salida honesta).
            const yaSePregunto = historialPrevio.some(
                (m) => m.rol === "assistant" && normalizarTexto(m.contenido) === normalizarTexto(pregunta)
            )

            if (pregunta && !yaSePregunto) {
                return {
                    mensajeFinal: pregunta,
                    mensajesFinales: [pregunta],
                    herramientasEjecutadas: [
                        {
                            nombre: "match_plantilla_publicidad",
                            argumentos: { varios: plantillasEnLaRafaga.map((p) => `${p.tipo}:${p.id}`).join(", ") },
                            resultado: {
                                match_directo: false,
                                origen: "anuncio_instagram",
                                mensaje_para_agente:
                                    `La ráfaga trae las plantillas de ${plantillasEnLaRafaga.length} anuncios distintos ` +
                                    `(${plantillasEnLaRafaga.map((p) => p.nombre).join(", ")}). No se entrega ninguna ficha: ` +
                                    `se le pregunta al cliente por cuál kit consulta (costo \$0).`
                            }
                        }
                    ],
                    escaladoHumano: false,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: sinCostoLLM(modelo)
                }
            }
        }

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

        // ...y la excepcion (a) tiene a su vez su propia excepcion (conv 3726,
        // 16/09): "ya se lo presentamos" vale para ESTA charla, no para siempre.
        // El cliente entro por el anuncio del Kit 170 el 09/09, quedo en
        // confirmar "cuando cobre" y volvio a clickear el MISMO anuncio una
        // semana despues: como `packPresentado` seguia puesto, la ficha no salio
        // y el modelo le contesto "Para la Sapucai 150 ya te confirme que entra,
        // decime que dato puntual queres saber". Un cliente que entra de cero por
        // una publicidad se quedo sin precio y con un reproche. Pasado el silencio
        // de sesion es una charla nueva: la ficha vuelve a salir entera (el resto
        // del estado —su moto— sigue valiendo y le saca la repregunta del final).
        const esElMismoKitYaPresentado =
            !!matchPlantilla &&
            !esCharlaNueva(estadoConv) &&
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
                // cuerpo (kit, precio, pregunta) sale igual. Salvo que el cliente
                // esté volviendo de otra charla (`esCharlaNueva`): ahí la ficha
                // sale entera, con su "Hola amigo!", igual que la primera vez.
                esConversacionEnCurso: historialPrevio.length > 0 && !esCharlaNueva(estadoConv)
            })

            // El cliente casi nunca manda SOLO la plantilla: uno o dos segundos
            // después llega su pregunta real ("cuánto vale", "hacen envíos a
            // Santiago del Estero?") y el debounce las junta en una sola ráfaga.
            // Como el matcher usa `includes`, esa ráfaga entera daba match y el
            // turno terminaba acá: la pregunta quedaba sin responder (convs 2977
            // y 3657, 08/09). Ahora la bienvenida sale igual (letra exacta, foto,
            // costo $0) y el resto se resuelve en un turno normal, que ya ve el
            // kit como presentado y no repite la ficha.
            // Cuando el kit salió del referral no hay plantilla que descontar
            // del texto: el aviso (y el nombre del kit) es lo único con que
            // reconocer que el cliente solo está nombrando ESE combo.
            const contextoAnuncio = [
                matchPlantilla.nombre,
                opciones.referralAnuncio?.titulo,
                opciones.referralAnuncio?.cuerpo
            ]
                .filter(Boolean)
                .join(" ")

            const resto = restoFueraDePlantilla(
                mensajeUsuario,
                matchTexto ? matchTexto.plantillaNormalizada : "",
                contextoAnuncio
            )

            // El texto que acompaña al click dice que NO viene por este kit:
            // pide otro producto, de otra medida ("entro por el 170 y pregunta
            // si tenemos un kid de cg 190"). La ficha del aviso —precio y foto—
            // se leería como la respuesta a eso, así que no sale: silencio y a
            // la bandeja del equipo. Decisión de Martín (16/09, conv 4386).
            //
            // No es el mismo caso que el escalado entero de más abajo (conv
            // 4351): ahí el sub-turno ya corrió y derivó todo. Acá se corta
            // ANTES, porque el sub-turno tiene el kit del aviso como contexto y
            // termina contestando sobre ese kit igual —en la 4386 salió una
            // negativa de compatibilidad contra una moto que el cliente nunca
            // nombró (`consultar_compatibilidad` con "CG 190" → CG Titan 150)—.
            // Cortar antes también ahorra el turno del modelo.
            const otroProducto = resto
                ? await pideOtroProductoQueElAnuncio(resto, contextoAnuncio)
                : { esOtroProducto: false as const }

            // Hermano del de arriba: el texto que acompaña al click no pide otro
            // producto, dice A CUÁNTO quiere llevar el motor ("quiero hacerla
            // 140" sobre el aviso del Cilindro 120). De en cuánto deja el motor
            // cada kit no hay dato en ninguna tabla, así que la ficha —con su
            // precio— tampoco puede salir como si fuera la respuesta.
            // `resto` casi nunca es el mensaje entero (la plantilla del aviso
            // se descuenta), asi que la lectura del turno sirve solo cuando
            // coinciden; si no, se lee ese texto. Los numeros de la plantilla
            // no los escribio el cliente y no pueden cambiarle el rol a nada.
            const otraCilindrada = resto
                ? await pideOtraCilindradaQueElProducto(
                      resto,
                      contextoAnuncio,
                      lecturaYaHecha(numerosDelTurno, resto)
                  )
                : null

            if (otraCilindrada) {
                const motivo = "consulta_tecnica"
                await escalarAHumano({
                    motivo,
                    resumen_consulta:
                        `Entró por el anuncio de "${matchPlantilla.nombre}" y quiere llevar el motor a ${otraCilindrada.cilindrada}` +
                        ` ("${otraCilindrada.frase}"): ${resto.slice(0, 300)}`,
                    conversation_id: opciones.conversationId
                }).catch((err) => console.error("[motor] fallo al persistir escalado de cilindrada objetivo:", err))

                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas: [
                        {
                            nombre: "match_plantilla_publicidad",
                            argumentos: {
                                tipo: matchPlantilla.tipo,
                                id: matchPlantilla.id,
                                nombre: matchPlantilla.nombre
                            },
                            resultado: {
                                match_directo: false,
                                origen: "anuncio_instagram",
                                mensaje_para_agente:
                                    `El cliente entró por el anuncio de '${matchPlantilla.nombre}' pero lo que escribió dice a cuánto quiere llevar el motor (${otraCilindrada.cilindrada}), que no es la medida del aviso. No hay dato de en cuánto deja el motor este kit: no se entrega la ficha, el turno queda mudo y la consulta va a la bandeja del equipo.`
                            }
                        }
                    ],
                    escaladoHumano: true,
                    motivoEscalado: motivo,
                    escaladoPersistido: true,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: sinCostoLLM(modelo)
                }
            }

            if (otroProducto.esOtroProducto) {
                const motivo = "producto_no_catalogado"
                await escalarAHumano({
                    motivo,
                    resumen_consulta:
                        `Entró por el anuncio de "${matchPlantilla.nombre}" pero pregunta por otro producto` +
                        (otroProducto.cilindrada ? ` (${otroProducto.cilindrada})` : "") +
                        `: ${resto.slice(0, 300)}`,
                    conversation_id: opciones.conversationId
                }).catch((err) => console.error("[motor] fallo al persistir escalado de producto ajeno al anuncio:", err))

                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas: [
                        {
                            nombre: "match_plantilla_publicidad",
                            argumentos: {
                                tipo: matchPlantilla.tipo,
                                id: matchPlantilla.id,
                                nombre: matchPlantilla.nombre
                            },
                            resultado: {
                                match_directo: false,
                                origen: "anuncio_instagram",
                                mensaje_para_agente:
                                    `El cliente entró por el anuncio de '${matchPlantilla.nombre}' pero lo que escribió pide otro producto` +
                                    (otroProducto.cilindrada ? ` (${otroProducto.cilindrada})` : "") +
                                    `. No se entrega la ficha del aviso: el turno queda mudo y la consulta va a la bandeja del equipo.`
                            }
                        }
                    ],
                    escaladoHumano: true,
                    motivoEscalado: motivo,
                    escaladoPersistido: true,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: sinCostoLLM(modelo)
                }
            }

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
                                // La ficha ya trae el precio y el envio. Si el resto de
                                // la rafaga era justamente "cuanto sale", el sub-turno
                                // no tiene nada que agregar y volvia a tirar los mismos
                                // numeros tres segundos despues (conv 3859, 10/09).
                                //
                                // Ojo con el alcance: esto vale SOLO para el combo de la
                                // ficha. Sin esa aclaracion el modelo se guardaba tambien
                                // el precio de OTRO kit que el cliente preguntaba en la
                                // misma rafaga ("y el 170 mas leva que vale?") y le
                                // contestaba que incluia, sin el numero.
                                `Esa ficha YA le dio el precio y el envio DE ESE combo ("${matchPlantilla.nombre}"): no repitas esos datos. ` +
                                `Si te pregunta por OTRO producto, ese precio no salio todavia — daselo. ` +
                                `Si lo unico que preguntaba era el precio o el envio de ESE combo, ya esta contestado — no mandes nada mas. ` +
                                // Excepción: el cliente YA dijo una moto, pero
                                // dijo marca y cilindrada sin el modelo ("Tengo
                                // una Zanella 150", conv 4525). Ahí prohibir la
                                // pregunta lo deja sin salida — no puede
                                // confirmar nada ni preguntar lo que falta— y el
                                // turno termina hablando de productos sobre una
                                // moto que no sabemos cuál es. No es repetir la
                                // pregunta: la ficha preguntó QUÉ moto y esto
                                // pregunta CUÁL de esas.
                                (marcaConCilindradaSinModelo(mensajeUsuario, { exigirMarcador: true })
                                    ? `El cliente ya dijo su moto pero solo la marca y la cilindrada, sin el modelo: preguntale CUAL es (una sola pregunta, corta) y no le pases ninguna ficha, precio ni producto hasta saberlo.]`
                                    : textoFinal.includes("?") && /moto/i.test(textoFinal)
                                      ? `La ficha que ya salió cierra preguntandole la moto, asi que NO se la vuelvas a preguntar: quedaria preguntada dos veces seguidas.]`
                                      : `]`)
                        },
                        { rol: "user", contenido: mensajeUsuario },
                        { rol: "assistant", contenido: textoFinal }
                    ],
                    // Sin el referral: el kit del anuncio ya se entrego y volver a
                    // pasarlo re-dispararia la bienvenida en el sub-turno.
                    // Con la ficha como globo ya emitido: sus precios y su "envio
                    // gratis" no cuentan como dato fresco aunque una herramienta
                    // los devuelva de nuevo en este sub-turno.
                    { ...opciones, referralAnuncio: undefined, globosYaEmitidos: [textoFinal] }
                )

                // El resto escaló ENTERO: no hay UN solo dato que contestarle, así
                // que la ficha saldría SOLA. Y una ficha sola no es neutra: trae el
                // precio y se lee como "esto es para vos".
                //
                // Conv 4351 (16/09, +5493534459906): el cliente entró por el anuncio
                // del kit 200 varillero y escribió "que vale un kit 190 para xr 150"
                // —otro producto y otra moto—. El resto escaló en silencio (el 190 no
                // está en el catálogo; la XR 150 no tiene compat con ese kit) y el
                // bot le mandó igual la ficha del 200 con su $167.000. El equipo tuvo
                // que desdecirlo a mano 30 segundos después ("ese kit no le va a la
                // XR 150").
                //
                // El contrato del 09/09 ([[fix-bot-plantilla-texto-acompanante]]) era
                // "la ficha sale igual, pero el SEGUNDO globo aclara si no le entra".
                // Cuando el resto escala entero ese segundo globo no existe, así que
                // el contrato no se puede cumplir: el turno queda mudo y la consulta
                // la contesta el equipo desde la bandeja. Decisión de Martín (16/09).
                //
                // Ojo con el alcance: esto NO toca el atajo $0 del caso normal —el
                // cliente que llega por el anuncio y pregunta sobre ESE kit no escala,
                // así que su ficha sale igual de rápido.
                //
                // Si el escalado es PARCIAL no se entra acá: el sub-turno derivó una
                // consulta pero contestó las otras, y esa respuesta tiene que salir
                // igual (conv 4149, 14/09: preguntó por tres kits, se derivó el que
                // no está en el catálogo y con él se tiró a la basura el precio del
                // otro, que la herramienta ya había resuelto). Este `if` miraba
                // `escaladoHumano` a secas y dejaba la rama de la plantilla afuera
                // del escalado parcial que rige en el flujo normal.
                if (turnoResto.escaladoHumano && !turnoResto.escaladoParcial) {
                    const motivo = turnoResto.motivoEscalado || "otro"
                    if (!turnoResto.escaladoPersistido) {
                        await escalarAHumano({
                            motivo,
                            resumen_consulta: `Consulta que vino junto con la plantilla del anuncio: ${resto.slice(0, 300)}`,
                            conversation_id: opciones.conversationId
                        }).catch((err) => console.error("[motor] fallo al persistir escalado del resto de la ráfaga:", err))
                    }

                    // La ficha no salió, así que el kit NO quedó presentado: había
                    // que anotarlo antes para que el sub-turno supiera de qué combo
                    // se hablaba, pero dejarlo puesto le haría creer al turno
                    // siguiente que el cliente ya vio una ficha que nunca recibió
                    // (ver [[fix-bot-memoria-kit-presentado-falso]]).
                    if (matchPlantilla.tipo === "pack") {
                        await guardarEstadoConversacion(estadoKey, { packPresentado: null }).catch(() => {})
                    } else if (matchPlantilla.tipo === "grupo") {
                        await guardarEstadoConversacion(estadoKey, { grupoPineado: null }).catch(() => {})
                    }

                    return {
                        mensajeFinal: null,
                        mensajesFinales: [],
                        herramientasEjecutadas: [infoMatch, ...(turnoResto.herramientasEjecutadas || [])],
                        escaladoHumano: true,
                        motivoEscalado: motivo,
                        escaladoPersistido: true,
                        latenciaMs: Date.now() - inicio,
                        tokensUsados: turnoResto.tokensUsados
                    }
                }

                // La ficha ya cierra con "a qué moto se lo querés poner?": el
                // sub-turno tiene la orden de no repetirla, pero la orden es del
                // prompt y a veces no la cumple — y el cliente lee la misma
                // pregunta dos globos seguidos. Backstop determinista de este
                // lado, que es donde se sabe con certeza si ya se preguntó.
                const laFichaYaPreguntoLaMoto = quitarPreguntaDeMotoFinal(textoFinal) !== textoFinal
                const globosResto = (turnoResto.mensajesFinales || [])
                    .map((g, i, arr) =>
                        laFichaYaPreguntoLaMoto && i === arr.length - 1 ? quitarPreguntaDeMotoFinal(g) : g
                    )
                    .filter(Boolean)

                return {
                    ...turnoResto,
                    mensajeFinal: [textoFinal, ...globosResto].filter(Boolean).join("\n\n---\n\n"),
                    mensajesFinales: [textoFinal, ...globosResto],
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
    /**
     * Escalado PARCIAL activo: algo de esta ráfaga quedó derivado al equipo,
     * pero el motivo admite contestar el resto (ver `admiteRespuestaParcial`).
     * Mientras esté en true el loop NO corta: el modelo puede seguir llamando
     * herramientas y redactar la respuesta de lo que sí sabemos.
     */
    let escaladoParcial = false
    /** Algún escalado del turno exige silencio total: pisa a `escaladoParcial`. */
    let silencioAbsoluto = false
    /**
     * Backstop del escalado parcial: si ninguna OTRA herramienta del turno
     * resolvió un dato real para el cliente, no hay "resto de la ráfaga" que
     * contestar. No alcanza con pedirle al modelo que lo sepa (conv 4112,
     * 14/09: el modelo redactó una respuesta igual en vez del centinela
     * SIN_RESPUESTA); esto lo verifica el motor por su cuenta.
     */
    let huboOtroDatoResuelto = false

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

    /**
     * El cliente nombró una moto que NO tenemos cargada ("la twister 125").
     * Hasta la conv 4388 (16/09) eso era indistinguible de "no dijo ninguna
     * moto": el turno arrancaba a ciegas y el bot le contestó el menú de kits
     * en vez de derivar la pregunta de compatibilidad. Ver
     * `motoDesconocidaMencionada`.
     */
    const motoDesconocidaDelTurno = await motoDesconocidaMencionada(mensajeUsuario).catch(() => null)
    const bloqueMotoDesconocida = motoDesconocidaDelTurno
        ? `### MOTO QUE NO TENEMOS CARGADA:
${guiaMotoDesconocida(motoDesconocidaDelTurno)}`
        : ""
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

    /**
     * COBERTURA DE ENVIO CON FUENTE OBLIGATORIA (conv 4429, 17/09).
     *
     * El contrato general dice que el modelo debe consultar info_negocio, pero
     * si en el historial ya leyó "hacemos envíos a todo el país", DeepSeek a
     * veces contesta de memoria "sí, llega tranquilo" y omite la tool. Así se
     * pierde justamente el dato nuevo que el cliente necesita: por qué correo
     * y de qué forma le llega.
     *
     * Para una pregunta explícita de cobertura la consulta deja de depender del
     * routing del modelo. El motor trae la fila oficial antes de redactar y la
     * inyecta en el contexto variable. No hay datos logísticos hardcodeados acá:
     * transportista, modalidad y demora siguen saliendo de info_negocio.
     */
    let bloqueCoberturaEnvio = ""
    if (esConsultaCoberturaEnvio("envios", mensajeUsuario)) {
        const infoEnvio = await ejecutarHerramienta(
            "consultar_info_negocio",
            { tema: "envios", pregunta_cliente: mensajeUsuario },
            { temasYaRespondidos: estadoConv.temasRespondidos || [] }
        ).catch((err) => {
            console.error("[motor] no se pudo precargar la cobertura de envío:", err)
            return null
        })

        if (infoEnvio) {
            herramientasEjecutadas.push(infoEnvio)
            const r = infoEnvio.resultado || {}
            if (r.encontrado === true) {
                huboOtroDatoResuelto = true
                patchEstado.temasRespondidos = unirTemas(patchEstado.temasRespondidos, [r.tema || "envios"])
                bloqueCoberturaEnvio = [
                    "### INFORMACION OFICIAL DE ENVIO YA CONSULTADA PARA ESTE TURNO:",
                    r.mensaje_para_agente,
                    "La consulta ya fue ejecutada por el motor. No vuelvas a llamar consultar_info_negocio para envios en este turno: redacta la respuesta con estos datos."
                ].join("\n")
            }
        }
    }

    /**
     * ENTRÓ POR UN ANUNCIO Y PIDE OTRA MEDIDA — la guarda, en el camino normal.
     *
     * La misma decisión de la conv 4386 ya vivía en la rama de la plantilla
     * (arriba): si el texto que acompaña al click pide un producto de otra
     * medida, la ficha del aviso —con precio y foto— se leería como la
     * respuesta, así que no sale y la consulta la contesta el equipo.
     *
     * El problema es que esa rama solo corre cuando el referral RESUELVE a un
     * kit del catálogo, y muchos avisos no resuelven a propósito: el body de
     * Meta suele ser genérico ("POTENCIA TU 110 CON ESTE COMBO!") y pega con
     * cualquier kit de 110, así que desde la conv 3357 el aviso que no es "casi
     * igual" a la plantilla cargada queda solo como contexto. Ahí la guarda
     * nunca llegaba a consultarse.
     *
     * Conv 4555 (18/09, +5493644171755): entró por ese mismo aviso genérico y
     * escribió "Para el 125 que tenes". Sin plantilla resuelta el turno fue
     * normal, el modelo buscó en el catálogo los términos DEL AVISO ("leva de
     * calle cilindro 120") y le mandó la ficha del Kit 120 con su $99.000, su
     * foto y la repregunta de la moto. Nadie contestó por el 125: el equipo
     * tuvo que meter `/bot off` y preguntar a mano un minuto después.
     *
     * Acá NO se corta el turno como en la rama de la plantilla: se deriva ESA
     * consulta (escalado parcial) y el resto de la ráfaga se contesta igual —si
     * preguntó también por el envío, esa respuesta sale—. Lo que no puede salir
     * es un producto con precio, y eso no se le pide al prompt: lo verifica el
     * motor sobre el mensaje ya redactado (ver el backstop de más abajo).
     */
    let otraMedidaDelAnuncio: { cilindrada?: number } | null = null
    if (opciones.referralAnuncio) {
        const contextoAnuncio = [opciones.referralAnuncio.titulo, opciones.referralAnuncio.cuerpo]
            .filter(Boolean)
            .join(" ")
        const pedido = await pideOtroProductoQueElAnuncio(mensajeUsuario, contextoAnuncio).catch((err) => {
            console.error("[motor] falló la guarda de otra medida sobre el anuncio:", err)
            return null
        })
        if (pedido?.esOtroProducto) {
            otraMedidaDelAnuncio = { cilindrada: pedido.cilindrada }
            const motivo = "producto_no_catalogado"
            const resumen =
                `Entró por el anuncio ("${contextoAnuncio.slice(0, 120)}") pero pregunta por otro producto` +
                (pedido.cilindrada ? ` (${pedido.cilindrada})` : "") +
                `: ${mensajeUsuario.slice(0, 300)}`
            await escalarAHumano({
                motivo,
                resumen_consulta: resumen,
                conversation_id: opciones.conversationId
            }).catch((err) =>
                console.error("[motor] fallo al persistir el escalado de otra medida sobre el anuncio:", err)
            )
            anotarEscaladoPendiente(motivo, resumen)
            escaladoHumano = true
            motivoEscalado = motivo
            escaladoPersistido = true
            escaladoParcial = admiteRespuestaParcial(motivo)
            herramientasEjecutadas.push({
                nombre: "escalar_a_humano",
                argumentos: { motivo, resumen_consulta: resumen },
                resultado: {
                    escalado: true,
                    mensaje_para_agente:
                        `El cliente entró por un anuncio pero pide un producto de otra medida` +
                        (pedido.cilindrada ? ` (${pedido.cilindrada})` : "") +
                        `. Esa consulta ya quedó derivada al equipo por el motor.`
                }
            })
        }
    }

    // El cliente llegó de un anuncio que no resolvimos a un kit del catálogo (o
    // que pega con más de uno): el texto del anuncio es la única pista de qué
    // está mirando. Va como contexto para que lo busque, no como dato de venta.
    //
    // Salvo que lo que escribió pida OTRA medida: ahí buscar el aviso en el
    // catálogo es justo lo que no hay que hacer — es lo que le trajo la ficha
    // del 120 a quien preguntaba por un 125 (conv 4555).
    const bloqueAnuncio = opciones.referralAnuncio
        ? [
              "### ANUNCIO POR EL QUE ENTRÓ EL CLIENTE (Instagram/Facebook):",
              opciones.referralAnuncio.titulo ? `Título: ${opciones.referralAnuncio.titulo}` : "",
              opciones.referralAnuncio.cuerpo ? `Texto: ${opciones.referralAnuncio.cuerpo}` : "",
              otraMedidaDelAnuncio
                  ? `El cliente NO viene por ese producto: pide otra medida${otraMedidaDelAnuncio.cilindrada ? ` (${otraMedidaDelAnuncio.cilindrada})` : ""}, que ya quedó derivada al equipo. No busques el aviso en el catálogo ni le pases el kit del aviso, su precio o su foto: no es lo que preguntó.`
                  : "El cliente viene por ESE producto aunque no lo nombre. Buscalo en el catálogo con esos términos antes de preguntarle qué necesita. Si no lo encontrás, escalá: no inventes ni ofrezcas otro kit como si fuera el del anuncio."
          ]
              .filter(Boolean)
              .join("\n")
        : ""

    const bloqueOtraMedidaDelAnuncio = otraMedidaDelAnuncio
        ? [
              "### CONSULTA YA DERIVADA AL EQUIPO EN ESTE TURNO:",
              `El cliente pide un producto de otra medida${otraMedidaDelAnuncio.cilindrada ? ` (${otraMedidaDelAnuncio.cilindrada})` : ""} que no es el del anuncio por el que entró.`,
              CONTRATO_ESCALADO_PARCIAL.trim()
          ].join("\n")
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

    // Cierres de la casa: el unico momento que no resuelve ninguna herramienta
    // (cerrar no es un paso del embudo), asi que viaja en el contexto del turno.
    // Sin frases cargadas devuelve "" y el bloque sale igual que antes.
    const bloqueCierres = await bloqueCierresDeLaCasa()

    // Contexto de ESTE turno: cambia siempre, por eso va después del historial.
    const bloqueVariable = [
        `### CONTEXTO TEMPORAL ACTUAL EN EL LOCAL (Córdoba Capital):\nHoy es ${fechaHoraCordoba} hs.`,
        bloqueAnuncio,
        bloqueOtraMedidaDelAnuncio,
        bloqueEstado,
        bloqueMotoDesconocida,
        bloqueSituaciones,
        bloqueCoberturaEnvio,
        bloqueCierres ? `### CIERRES DE LA CASA${bloqueCierres}` : ""
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

    /**
     * Los Flash de DeepSeek (V4 y V4.1) piensan por default, y ese razonamiento
     * invisible se paga a precio de SALIDA igual que en gpt-5: ~900 tokens por
     * turno, la mitad de la factura. A diferencia de `reasoning_effort` en
     * gpt-5 —que sí bajamos a `low`— acá conviene dejarlo prendido: apagado el
     * modelo deja de derivar lo que no sabe y empieza a afirmar de más. El
     * porqué, con los números de las tres corridas, está en `deepseekThinking`
     * (configuracion.ts). Se prende y apaga desde chat_config, sin deploy.
     */
    const esFlashDeepseek = (m: string) => /deepseek.*flash/.test(m.toLowerCase())

    /**
     * La moto que el cliente nombró en ESTE mensaje, resuelta una sola vez por
     * turno (el resolvedor cachea los modelos 60s).
     *
     * Viaja a las tools en el embudo: `consultar_catalogo_y_precios` encuentra
     * productos por su nombre y no tiene forma de saber que el cliente ya dijo
     * para qué moto los quiere, así que no avisaba nada y el modelo pasaba
     * derecho de "existe el producto" a "sí, te sirve". Con el dato, la tool le
     * exige chequear compatibilidad antes de afirmar — que es lo que evita
     * llegar al backstop de la moto y tener que derivarle el caso al equipo.
     */
    const motoDelMensajeTurno = await resolverMoto(mensajeUsuario)
        .then((r) =>
            r.confianza === "ninguna"
                ? null
                : r.modelo?.nombre_completo || r.candidatos.map((c) => c.nombre_completo).join(" / ") || null
        )
        .catch(() => null)

    /**
     * La moto VIGENTE de la charla: la de este mensaje, o la que el cliente
     * nombró en un turno anterior y quedó guardada.
     *
     * El hueco que tapa (conv 4206, 15/09): el cliente dice "Una 110 DLX",
     * pregunta otra cosa en el turno siguiente y ahí ni el aviso del catálogo
     * ni el backstop de abajo veían moto alguna —los dos leían solo el mensaje
     * del turno— así que el bot afirmó "para la 110 DLX tenemos estas
     * opciones" y le ofreció el kit dakar 200 y el 220.
     *
     * No reemplaza a `motoConfirmada`: esto no dice que le entre nada, dice que
     * hay una moto en juego y que no se puede afirmar sobre ella sin consultar.
     */
    // El cliente puede nombrar su moto sin que resuelva a un modelo cargado
    // ("Una 110 DLX": DLX la usan todas las marcas y hay 12 motos de 110). Sigue
    // siendo una moto en juego, y el turno tiene que saberlo. Ver
    // `cilindradaSinMarca` — solo dispara con un marcador explícito, para no
    // confundir el numero del KIT con la cilindrada de la moto.
    // La moto desconocida también es una moto en juego: no sabemos qué es, pero
    // sabemos que todo lo que digamos de acá en más es SOBRE ella. Así viaja al
    // aviso del catálogo y al backstop, igual que `cilindradaSinMarca`.
    // Marca + cilindrada sin modelo ("Tengo una Zanella 150", conv 4525) es el
    // tercer sabor de lo mismo: no resuelve a un modelo, pero es su moto y todo
    // lo que se diga de acá en más es sobre ella. Sin esto la charla corría sin
    // moto en juego y los backstops que la miran quedaban ciegos.
    const motoDelTurno =
        motoDelMensajeTurno ||
        cilindradaSinMarca(mensajeUsuario) ||
        marcaConCilindradaSinModelo(mensajeUsuario, { exigirMarcador: true }) ||
        motoDesconocidaDelTurno
    const motoVigenteDeLaCharla = motoDelTurno || estadoConv.motoMencionada || estadoConv.motoConfirmada || null
    if (motoDelTurno && motoDelTurno !== estadoConv.motoMencionada) {
        patchEstado.motoMencionada = motoDelTurno
    }

    /**
     * Alguna búsqueda del catálogo de ESTE turno volvió sin match. Cierra la
     * puerta al volcado del catálogo completo como reintento (conv 4206).
     */
    let catalogoSinMatchEnTurno = false

    /**
     * Qué buscó el modelo en el catálogo y volvió sin nada. Es la lista de lo
     * que NO sabemos de este turno: si además se derivó al equipo, el bot no
     * puede cerrar esos temas él mismo con un "no viene incluido" / "va aparte"
     * (conv 4301, 16/09). Ver `quitarNegativaSobreLoDerivado`.
     */
    const terminosSinMatchEnTurno: string[] = []

    /**
     * Ya se le entregó la ficha del kit en lugar de derivar una duda técnica.
     * Pasa una sola vez por turno: si después de leerla el modelo insiste en
     * derivar, es que el dato no está y la consulta es del equipo.
     */
    let fichaServidaAntesDeEscalar = false

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
        const thinking = opciones.thinking ?? config.deepseekThinking
        if (esFlashDeepseek(provActivo.modelo) && thinking) {
            cuerpo.thinking = { type: thinking }
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
                if (esFlashDeepseek(provActivo.modelo)) {
                    if (thinking) cuerpo.thinking = { type: thinking }
                } else {
                    delete cuerpo.thinking
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

            // Escalado parcial: el modelo avisa con el centinela que no le quedó
            // nada para contestar por fuera de lo derivado. Silencio total, que
            // es la salida vieja y segura.
            //
            // Backstop (conv 4112, 14/09): si ninguna otra herramienta resolvió
            // un dato real, no existe "resto de la ráfaga" — no se confía en que
            // el modelo haya usado el centinela; se calla igual aunque haya
            // redactado texto.
            if (escaladoParcial && (CENTINELA_SIN_RESPUESTA.test(contenido) || !huboOtroDatoResuelto)) {
                if (!CENTINELA_SIN_RESPUESTA.test(contenido)) {
                    console.warn("[motor] escalado parcial sin dato adicional resuelto, texto libre descartado:", contenido.slice(0, 200))
                }
                await persistirEstado()
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: true,
                    motivoEscalado,
                    escaladoPersistido,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: tokensTotales
                }
            }

            // Separar en múltiples mensajes si el modelo usó el delimitador de ráfaga
            const partesRaw = contenido
                .split(/---MENSAJE---|\r?\n[ \t]*-{3,}[ \t]*(?=\r?\n|$)/)
                // Backstop: una linea de guiones que sobrevivio al split (pegada
                // a texto) no puede viajar al cliente como si fuera contenido.
                .map((p: string) => p.replace(/^[^\S\r\n]*-{3,}[^\S\r\n]*$/gm, "").trim())
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
                            escaladoHumano: escaladoParcial,
                            motivoEscalado: escaladoParcial ? motivoEscalado : undefined,
                            escaladoPersistido: escaladoParcial ? escaladoPersistido : undefined,
                            escaladoParcial: escaladoParcial || undefined,
                            latenciaMs: Date.now() - inicio,
                            tokensUsados: tokensTotales,
                        }
                    }
                }

                // Si el turno ya venía de un escalado parcial, el pendiente ya
                // está en la bandeja: no se duplica la fila por este fallo.
                if (!escaladoParcial) {
                    await escalarAHumano({
                        motivo: "respuesta_no_confiable",
                        resumen_consulta: `El bot generó una respuesta sospechosa (posible fuga de instrucciones internas). Última consulta del cliente: ${mensajeUsuario.slice(0, 300)}`,
                        conversation_id: opciones.conversationId,
                    }).catch((err) => console.error("[motor] fallo al persistir escalado por respuesta no confiable:", err))
                }
                await persistirEstado()
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: true,
                    motivoEscalado: escaladoParcial ? motivoEscalado : "respuesta_no_confiable",
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

            /**
             * Hechos que el cliente YA leyó en un globo de esta misma ráfaga
             * (la ficha de la plantilla del anuncio, que sale antes de este
             * sub-turno). Que la herramienta los haya devuelto recién no los
             * vuelve nuevos: los tiene tres segundos más arriba en la pantalla.
             * Le ganan tanto a la excepción de "hechos frescos" como al atajo
             * de "el cliente preguntó" (conv 3859).
             */
            const hechosDeLaMismaRafaga = new Set<string>()
            for (const globo of opciones.globosYaEmitidos || []) {
                for (const h of extraerHechos(globo || "")) hechosDeLaMismaRafaga.add(h)
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
                const sinRepetidos = quitarOracionesYaDichas(sanitizado.textoLimpio, yaDichoPorElBot, mensajeUsuario)
                // Segunda pasada: la de arriba solo atrapa la oración calcada.
                // Un modelo que parafrasea le pasa por al lado y el cliente
                // igual lee el mismo plazo o el mismo precio dos veces.
                const sinHechosRepetidos = quitarHechosYaDichos(
                    sinRepetidos,
                    yaDichoPorElBot,
                    mensajeUsuario,
                    hechosDeEsteTurno,
                    hechosDeLaMismaRafaga
                )
                // El escalado es invisible para el cliente: si el modelo lo
                // blanqueó ("eso lo consulto y te aviso"), esa oración se cae.
                const sinAnuncioDeDerivacion = escaladoParcial
                    ? quitarDerivacionAnunciada(sinHechosRepetidos)
                    : sinHechosRepetidos
                /**
                 * El producto derivado no se cierra con una negativa propia:
                 * justo eso es lo que el catálogo no encontró y por lo que se
                 * escaló. Una búsqueda sin match NO prueba que no lo vendamos
                 * (conv 4301: se le dijo "el carburador y esos chiches van
                 * aparte" cuando el combo que los trae existe).
                 */
                const sinNegativaDeLoDerivado = escaladoParcial
                    ? quitarNegativaSobreLoDerivado(sinAnuncioDeDerivacion, terminosSinMatchEnTurno)
                    : sinAnuncioDeDerivacion
                if (sinNegativaDeLoDerivado && !pareceRespuestaNoConfiable(sinNegativaDeLoDerivado)) {
                    mensajesFinalesSanitizados.push(sinNegativaDeLoDerivado)
                }
            }

            /**
             * BACKSTOP DE LA PIEZA SUELTA (conv 4394, 16/09).
             *
             * "Vendes levas solas" -> "Las levas las damos dentro de los kits,
             * no como pieza suelta". Las damos sueltas: hay tres levas activas
             * en `chat_articulos`, con precio y con el alias "leva sola"
             * cargado justamente para esto. El bot se inventó una política de
             * la casa porque el menú de kits no le pasaba ni un dato de la
             * pieza sola — eso se arregló en `catalogo-precios.ts`, y esto es
             * la red: una negativa de venta por separado sobre algo que el
             * catálogo SÍ vende suelto no sale al cliente.
             *
             * La oración se cae y el punto se deriva: al cliente hay que
             * contestarle, y lo que el bot iba a decir era falso. El resto del
             * mensaje se conserva (escalado parcial de siempre).
             */
            const negativasDeVentaSuelta: string[] = []
            for (const parte of mensajesFinalesSanitizados) {
                for (const oracion of oracionesQueNieganVentaSuelta(parte)) {
                    const pieza = await piezaQueVendemosSuelta(oracion).catch(() => null)
                    if (!pieza) continue
                    console.warn(
                        `[motor] backstop de la pieza suelta: "${oracion}" niega vender "${pieza}" por separado y el catálogo la vende sola`
                    )
                    negativasDeVentaSuelta.push(oracion)
                }
            }
            if (negativasDeVentaSuelta.length > 0) {
                for (let i = mensajesFinalesSanitizados.length - 1; i >= 0; i--) {
                    const limpio = quitarOraciones(mensajesFinalesSanitizados[i], negativasDeVentaSuelta)
                    if (limpio) mensajesFinalesSanitizados[i] = limpio
                    else mensajesFinalesSanitizados.splice(i, 1)
                }
                const motivo = "consulta_precio"
                const resumen = `El cliente preguntó por una pieza SUELTA y el bot iba a negarle que la vendamos por separado: "${negativasDeVentaSuelta
                    .join(" ")
                    .slice(0, 200)}". El catálogo la vende sola.`
                if (!escaladoPersistido) {
                    const resultadoEscalado = await escalarAHumano({
                        motivo,
                        resumen_consulta: resumen,
                        conversation_id: opciones.conversationId
                    }).catch((err) => {
                        console.error("[motor] fallo al persistir el backstop de la pieza suelta:", err)
                        return null
                    })
                    escaladoPersistido = Boolean(resultadoEscalado)
                    herramientasEjecutadas.push({
                        nombre: "escalar_a_humano",
                        argumentos: { motivo, resumen_consulta: resumen },
                        resultado: resultadoEscalado || { escalado: true, motivo, resumen }
                    })
                }
                anotarEscaladoPendiente(motivo, resumen)
                motivoEscalado = motivoEscalado || motivo
                escaladoParcial = mensajesFinalesSanitizados.length > 0
                // La negativa ERA todo el mensaje: silencio total y lo toma el
                // equipo, que es la salida segura de siempre.
                if (mensajesFinalesSanitizados.length === 0) {
                    await persistirEstado()
                    return {
                        mensajeFinal: null,
                        mensajesFinales: [],
                        herramientasEjecutadas,
                        escaladoHumano: true,
                        motivoEscalado: motivo,
                        escaladoPersistido,
                        latenciaMs: Date.now() - inicio,
                        tokensUsados: tokensTotales
                    }
                }
            }

            /**
             * BACKSTOP DE LA REPREGUNTA: mientras le preguntamos CUÁL es su
             * moto, no le ponemos un producto con precio enfrente.
             *
             * Conv 4525 (18/09): con la Zanella 150 sin resolver, el bot
             * pregunta "cual Zanella 150 tenes?" —lo correcto— y en el mismo
             * turno le manda la ficha del Dakar 200 con sus $167.000. Las dos
             * cosas juntas se contradicen: si todavía no sabemos qué moto es,
             * ese kit no se le puede estar ofreciendo.
             *
             * La guía de la herramienta ya se lo prohíbe, pero el catálogo le
             * ordena al mismo tiempo mandar la ficha oficial "tal cual", y esa
             * orden gana.
             *
             * El corte es por regla, no por lista de frases: mientras hay una
             * repregunta de moto pendiente, lo ÚNICO que sale es la pregunta.
             * Filtrando frase por frase se escapaban todas las formas de decir
             * lo mismo —"esa es la otra opción que tenemos para el 200, te la
             * paso", "si, se puede pasar a 200"— y cada una pedía su regex. Lo
             * que las une es el estado: sin saber qué moto es, NADA de lo que
             * se diga sobre un producto vale. Se pierde algún dato que no
             * dependía de la moto (el envío, la demora), y es un precio barato
             * al lado del silencio total que había antes.
             *
             * Si no hay ninguna pregunta que rescatar, no queda nada que decir:
             * el turno va mudo a la bandeja, la salida segura de siempre.
             *
             * La ficha del anuncio NO pasa por acá: la rama de la plantilla la
             * emite como globo propio antes del sub-turno (decisión del 09/09,
             * la ficha del aviso sale igual).
             */
            const pidioRepreguntarLaMoto = herramientasEjecutadas.some(
                (ej) => ej.resultado?.repregunta_moto === true
            )
            if (pidioRepreguntarLaMoto) {
                // La moto que la herramienta pidió repreguntar ("zanella 150"):
                // es lo que ancla cuál de las oraciones es LA pregunta.
                const motoARepreguntar = herramientasEjecutadas
                    .map((ej) => (ej.resultado?.repregunta_moto === true ? String(ej.resultado?.marca || "") : ""))
                    .find(Boolean)
                const laPregunta = mensajesFinalesSanitizados
                    .map((globo) => oracionQuePreguntaLaMoto(globo, motoARepreguntar))
                    .find(Boolean)
                if (laPregunta) {
                    if (mensajesFinalesSanitizados.length > 1 || mensajesFinalesSanitizados[0] !== laPregunta) {
                        console.warn(
                            "[motor] se recorta el turno a la pregunta por la moto: todavía no sabemos cuál es"
                        )
                    }
                    mensajesFinalesSanitizados.length = 0
                    mensajesFinalesSanitizados.push(laPregunta)
                } else {
                    console.warn("[motor] no hay pregunta que rescatar y todavía no sabemos cuál es su moto")
                    mensajesFinalesSanitizados.length = 0
                }
                if (mensajesFinalesSanitizados.length === 0) {
                    const motivo = "moto_no_registrada"
                    const resumen = `El turno iba a hablar de productos mientras todavía no sabemos cuál es su moto, y no llegó a preguntárselo (el cliente escribió: "${mensajeUsuario.slice(0, 160)}").`
                    if (!escaladoPersistido) {
                        const resultadoEscalado = await escalarAHumano({
                            motivo,
                            resumen_consulta: resumen,
                            conversation_id: opciones.conversationId
                        }).catch((err) => {
                            console.error("[motor] fallo al persistir el backstop de la repregunta:", err)
                            return null
                        })
                        escaladoPersistido = Boolean(resultadoEscalado)
                        herramientasEjecutadas.push({
                            nombre: "escalar_a_humano",
                            argumentos: { motivo, resumen_consulta: resumen },
                            resultado: resultadoEscalado || { escalado: true, motivo, resumen }
                        })
                    }
                    anotarEscaladoPendiente(motivo, resumen)
                    await persistirEstado()
                    return {
                        mensajeFinal: null,
                        mensajesFinales: [],
                        herramientasEjecutadas,
                        escaladoHumano: true,
                        motivoEscalado: motivo,
                        escaladoPersistido,
                        latenciaMs: Date.now() - inicio,
                        tokensUsados: tokensTotales
                    }
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

            /**
             * BACKSTOP del escalado parcial: el bot no puede seguir hablando y
             * de paso dictaminar que "le va bien" a la moto.
             *
             * Se aborta al silencio total en dos casos:
             *  - lo derivado ERA la compatibilidad (`moto_no_registrada`,
             *    `compatibilidad_dudosa`): justo eso es lo que no pudimos
             *    confirmar, asi que ninguna afirmacion vale;
             *  - el mensaje afirma compatibilidad sin que ninguna herramienta
             *    del turno la haya confirmado (seria de memoria).
             *
             * Un `consulta_tecnica` por un dato suelto (la marca del cilindro)
             * NO cae aca si la compat salio de una herramienta: ese es
             * exactamente el caso que el escalado parcial viene a rescatar.
             *
             * Cuando lo derivado ERA la compat, el detector es el ancho: no
             * alcanza con mirar "le va / es compatible". En la conv 4525
             * (18/09, Zanella 150) se derivo la compat del kit 170 y el mismo
             * turno siguio con *"Sobre el 200, si, para varillero tenemos este
             * kit potenciado"* + precio. No dice "le entra", pero le esta
             * afirmando que su moto es varillera y que le vendemos eso: la
             * misma afirmacion sin dato, en su version comercial. El backstop
             * de la moto (mas abajo) si la ve con `afirmaTenerParaSuMoto`,
             * pero exige un nombre de moto resuelto y "Zanella 150" —marca +
             * cilindrada, sin modelo— no resuelve a nada, asi que quedaba
             * ciego. Fuera de la compat el detector sigue siendo el de antes,
             * para no mutear los parciales que el escalado vino a rescatar.
             */
            const motivoBaseEscalado = (motivoEscalado || "").split(":")[0].trim().toLowerCase()
            const loDerivadoEraLaCompat =
                motivoBaseEscalado === "moto_no_registrada" || motivoBaseEscalado === "compatibilidad_dudosa"
            const compatConfirmadaPorHerramienta = tieneVeredictoCompatibilidad(herramientasEjecutadas)

            /**
             * El MENÚ que el turno le puso enfrente: los productos que devolvió
             * el catálogo en este turno y que el cliente todavía NO vio.
             *
             * Es el complemento del precio para el Paso 1, que a propósito va
             * sin precios: ver `cuentaProductosNombrados`. El que ya está en el
             * embudo queda afuera porque hablar de él es seguir la charla, no
             * ofrecerle algo nuevo sin saber si le entra.
             */
            const productosNuevosDelTurno = herramientasEjecutadas
                .filter((ej) => ej.nombre === "consultar_catalogo_y_precios")
                .flatMap((ej) => [
                    ...((ej.resultado?.grupos || []) as { id?: number; nombre?: string }[]).filter(
                        (g) => g?.id !== estadoConv.grupoPineado?.id
                    ),
                    ...((ej.resultado?.packs || []) as { id?: number; nombre?: string }[]).filter(
                        (p) => p?.id !== estadoConv.packPresentado?.id
                    )
                ])
                .map((p) => p?.nombre || "")
            const leMandoUnMenuDeProductos =
                !compatConfirmadaPorHerramienta &&
                cuentaProductosNombrados(mensajeFinalUnificado, productosNuevosDelTurno) >= 2

            const afirmaSobreLoDerivado = loDerivadoEraLaCompat
                ? afirmaCompatibilidad(mensajeFinalUnificado) ||
                  afirmaTenerParaSuMoto(mensajeFinalUnificado) ||
                  ofreceProductosParaLaMoto(mensajeFinalUnificado, motoVigenteDeLaCharla) ||
                  // El hecho, no la redaccion: si ninguna herramienta confirmo
                  // compat en este turno y el mensaje igual le pone un producto
                  // con precio enfrente, eso YA es la afirmacion que derivamos.
                  (!compatConfirmadaPorHerramienta && presentaPrecioDeProducto(mensajeFinalUnificado)) ||
                  leMandoUnMenuDeProductos
                : afirmaCompatibilidad(mensajeFinalUnificado)
            if (
                escaladoParcial &&
                afirmaSobreLoDerivado &&
                (loDerivadoEraLaCompat || !compatConfirmadaPorHerramienta)
            ) {
                console.warn("[motor] escalado parcial abortado: el mensaje afirmaba compatibilidad justo sobre lo derivado")
                await persistirEstado()
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: true,
                    motivoEscalado,
                    escaladoPersistido,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: tokensTotales
                }
            }

            /**
             * BACKSTOP DE LA OTRA MEDIDA: entró por un anuncio, pidió otra
             * medida (ya derivada arriba) y el turno igual terminó poniéndole
             * un producto con precio enfrente.
             *
             * Mira el HECHO, no la redacción, igual que el de la compat
             * derivada: al cliente no le cambia nada que el precio venga con o
             * sin la palabra "combo" —lo que lee es un producto con su número,
             * justo cuando lo que preguntó no lo sabemos—. El prompt ya se lo
             * pide (`bloqueOtraMedidaDelAnuncio`), pero pedirlo no alcanza: en
             * la conv 4555 el modelo tenía el aviso en el contexto y lo buscó
             * en el catálogo por su cuenta.
             *
             * Lo demás de la ráfaga sigue pudiendo salir: lo único que este
             * backstop veta es el mensaje que lleva precio.
             */
            if (otraMedidaDelAnuncio && mensajeFinalUnificado && presentaPrecioDeProducto(mensajeFinalUnificado)) {
                console.warn(
                    `[motor] otra medida derivada (${otraMedidaDelAnuncio.cilindrada ?? "?"}): el turno igual presentaba un producto con precio, se descarta`
                )
                await persistirEstado()
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: true,
                    motivoEscalado,
                    escaladoPersistido,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: tokensTotales
                }
            }

            /**
             * BACKSTOP DE LA MOTO QUE NO TENEMOS: el cliente nombró una moto
             * que no está cargada y el turno terminó contestando igual, sin
             * derivar nada.
             *
             * Es lo que pasó en la conv 4388 (16/09): *"precio de la leva para
             * el cb1 / es compatible con la twister 125?"* y el bot mandó el
             * menú de los tres combos que pegan con "leva". No afirmó nada
             * sobre la moto —por eso el backstop de abajo no lo veía— pero
             * tampoco contestó lo que le preguntaron: le cambió el tema. Con la
             * moto fuera del registro, NINGUNA herramienta puede decir si le
             * entra algo, así que lo único correcto es derivar.
             *
             * Solo dispara cuando el modelo no derivó NADA por su cuenta: si
             * escaló (entero o parcial) siguiendo la guía del turno, el
             * escalado parcial manda y el resto de la ráfaga se contesta igual.
             */
            if (
                motoDesconocidaDelTurno &&
                mensajeFinalUnificado &&
                !escaladoHumano &&
                !escaladoParcial &&
                !herramientasEjecutadas.some((ej) => ej.nombre === "escalar_a_humano")
            ) {
                console.warn(`[motor] backstop de la moto que no tenemos: "${motoDesconocidaDelTurno}" no está cargada y el turno contestó igual`)
                const motivo = "moto_no_registrada"
                const resumen = `El cliente preguntó por su ${motoDesconocidaDelTurno}, que no tenemos cargada, y el bot iba a contestar otra cosa: "${mensajeFinalUnificado.replace(/\n/g, " ").slice(0, 200)}"`
                const resultadoEscalado = await escalarAHumano({
                    motivo,
                    resumen_consulta: resumen,
                    modelo_moto: motoDesconocidaDelTurno,
                    conversation_id: opciones.conversationId
                }).catch((err) => {
                    console.error("[motor] fallo al persistir el backstop de la moto desconocida:", err)
                    return null
                })
                anotarEscaladoPendiente(motivo, resumen)
                await persistirEstado()
                herramientasEjecutadas.push({
                    nombre: "escalar_a_humano",
                    argumentos: { motivo, resumen_consulta: resumen },
                    resultado: resultadoEscalado || { escalado: true, motivo, resumen }
                })
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: true,
                    motivoEscalado: motivo,
                    escaladoPersistido: Boolean(resultadoEscalado),
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: tokensTotales
                }
            }

            /**
             * BACKSTOP DE LA MOTO: el cliente nombró su moto y el mensaje
             * afirma algo sobre ella —que le entra, o que tenemos algo para
             * ella— sin que ninguna herramienta lo haya confirmado.
             *
             * Es el hueco que quedaba abierto cuando el término de búsqueda
             * lleva moto Y producto ("escape para rouser ns200"): el guard de
             * `terminoEsSoloMoto` no aplica, el catálogo encuentra el producto y
             * de ahí a "sí, tenemos" hay un paso que nadie chequeaba.
             *
             * Medido contra los últimos 800 turnos enviados: dispara en 5 (0,6%)
             * y los 5 son errores reales — a una XR 150 se le recitó "compatible
             * con todas las 110", a una ZB 110 "le entra directo" sin consultar,
             * y a la Rouser NS 200 de la conv 4194 que le vendíamos repuestos.
             *
             * Una moto guardada no exime este control: la confirmación anterior
             * puede pertenecer a otro producto o a otra moto de la conversación.
             *
             * La moto no tiene que estar en el mensaje de ESTE turno: el cliente
             * la dice una vez y sigue preguntando. Mientras esto miraba solo
             * `mensajeUsuario`, un "Una 110 DLX" de dos mensajes antes dejaba
             * pasar "Para la 110 DLX tenemos estas opciones" con el kit dakar
             * 200 y el 220 adentro (conv 4206). Ver `motoMencionada`.
             */
            if (
                mensajeFinalUnificado &&
                !compatConfirmadaPorHerramienta &&
                // Los dos detectores de siempre, o —si hay una moto en juego en
                // la charla— la forma invertida que ellos no ven ("Para la Wave
                // 110 tenemos estas opciones"), que se chequea abajo con el
                // nombre ya resuelto.
                (afirmaCompatibilidad(mensajeFinalUnificado) ||
                    afirmaTenerParaSuMoto(mensajeFinalUnificado) ||
                    Boolean(motoVigenteDeLaCharla))
            ) {
                // La moto puede venir de ESTE mensaje o de uno anterior: el
                // cliente la dice una vez y sigue preguntando (conv 4206).
                const motoDelCliente = await resolverMoto(mensajeUsuario).catch(() => null)
                const nombreMotoDelTurno =
                    motoDelCliente && motoDelCliente.confianza !== "ninguna"
                        ? motoDelCliente.modelo?.nombre_completo ||
                          motoDelCliente.candidatos.map((c) => c.nombre_completo).join(" / ") ||
                          mensajeUsuario.slice(0, 60)
                        : null
                const nombreMoto = nombreMotoDelTurno || motoVigenteDeLaCharla || null
                /**
                 * El menú del Paso 1 no afirma nada por sí solo: pregunta cuál
                 * de las opciones busca. Lo que lo vuelve una afirmación es que
                 * NINGUNA de las opciones le entre a la moto que hay en juego
                 * (la Wave del caso 96: los tres combos del 120 piden alesar
                 * los cárteres). Eso lo resuelve el motor contra la tabla, sin
                 * LLM: ver `algunProductoLeVa`. Prohibir el menú cada vez que
                 * no se consultó compat derivaría toda consulta de precio con
                 * la moto en el mismo mensaje, que es el costo que no se paga.
                 */
                const algunaOpcionDelMenuLeVa =
                    leMandoUnMenuDeProductos && nombreMoto
                        ? // Un error de base no puede convertirse en una tanda de
                          // derivaciones: ante la duda el menú se considera bueno.
                          await algunProductoLeVa(nombreMoto, productosNuevosDelTurno).catch(() => true)
                        : false
                const menuSinNingunaOpcionQueLeVa =
                    leMandoUnMenuDeProductos && Boolean(nombreMoto) && !algunaOpcionDelMenuLeVa
                const afirmaAlgoSobreSuMoto =
                    afirmaCompatibilidad(mensajeFinalUnificado) ||
                    // Los dos detectores de FORMA se apagan cuando el menú es
                    // legítimo: se disparan con la enumeración misma ("el 120 lo
                    // manejamos en tres combos" matchea "manejamos … combos"),
                    // donde el sujeto es el KIT y no la moto. Era la otra mitad
                    // de la inestabilidad del caso 19. `afirmaCompatibilidad` y
                    // el precio siguen contando: son afirmaciones puntuales, y
                    // el Paso 1 tiene prohibido dar precios de entrada.
                    (!algunaOpcionDelMenuLeVa &&
                        (afirmaTenerParaSuMoto(mensajeFinalUnificado) ||
                            ofreceProductosParaLaMoto(mensajeFinalUnificado, nombreMoto))) ||
                    // Pasarle un producto CON PRECIO es afirmar lo mismo sin
                    // decirlo: "esto es para vos". En la conv 4525 el turno que
                    // ni siquiera consultó compatibilidad le mandó la ficha del
                    // Dakar 200 con sus $167.000 a una Zanella 150 que no
                    // sabíamos cuál era, y ninguno de los tres detectores de
                    // arriba lo veía porque no usó ninguna de esas formas.
                    presentaPrecioDeProducto(mensajeFinalUnificado) ||
                    // Y el menú del Paso 1, que es la misma jugada sin precios:
                    // "el kit 120 para Wave lo tenemos en tres versiones, cuál
                    // buscás?" con los tres nombres abajo, a una Wave a la que
                    // no le entra ninguno. Ver `cuentaProductosNombrados`: la
                    // regex de `ofreceProductosParaLaMoto` no cruza el salto de
                    // línea y eso pasaba 2 de cada 3 veces.
                    menuSinNingunaOpcionQueLeVa
                if (nombreMoto && afirmaAlgoSobreSuMoto) {
                    console.warn(`[motor] backstop de la moto: el mensaje afirmaba sobre "${nombreMoto}" sin compatibilidad confirmada`)
                    const motivo = "compatibilidad_dudosa"
                    const resumen = `El cliente nombró su ${nombreMoto} y el bot iba a afirmar sin dato de compatibilidad: "${mensajeFinalUnificado.replace(/\n/g, " ").slice(0, 200)}"`
                    const resultadoEscalado = await escalarAHumano({
                        motivo,
                        resumen_consulta: resumen,
                        modelo_moto: nombreMoto,
                        conversation_id: opciones.conversationId
                    }).catch((err) => {
                        console.error("[motor] fallo al persistir el backstop de la moto:", err)
                        return null
                    })
                    anotarEscaladoPendiente(motivo, resumen)
                    await persistirEstado()
                    herramientasEjecutadas.push({
                        nombre: "escalar_a_humano",
                        argumentos: { motivo, resumen_consulta: resumen },
                        resultado: resultadoEscalado || { escalado: true, motivo, resumen }
                    })
                    return {
                        mensajeFinal: null,
                        mensajesFinales: [],
                        herramientasEjecutadas,
                        escaladoHumano: true,
                        motivoEscalado: motivo,
                        escaladoPersistido: Boolean(resultadoEscalado),
                        latenciaMs: Date.now() - inicio,
                        tokensUsados: tokensTotales
                    }
                }
            }

            // BACKSTOP del cierre social: el local ya se había despedido y el
            // modelo salió con un "perdón, no te entendí, me lo repetís?" por
            // un mensaje suelto del cliente ("Metta", conv 3985). Si no hay
            // nada abierto, repreguntar solo alarga la charla: silencio.
            if (
                mensajeFinalUnificado &&
                pareceNoTeEntendi(mensajeFinalUnificado) &&
                (esDespedidaDelBot(ultimoMensajeDelBot) || elBotDejoUnPedidoPendiente(ultimoMensajeDelBot))
            ) {
                console.warn("[motor] se descarta un 'no te entendí' sobre una charla cerrada o con un pedido pendiente")
                await persistirEstado()
                return {
                    mensajeFinal: null,
                    mensajesFinales: [],
                    herramientasEjecutadas,
                    escaladoHumano: false,
                    latenciaMs: Date.now() - inicio,
                    tokensUsados: tokensTotales
                }
            }

            await persistirEstado()
            return {
                mensajeFinal: mensajeFinalUnificado || null,
                mensajesFinales: mensajesFinalesSanitizados,
                fotoUrl: extraerFotoDeBienvenida(
                    herramientasEjecutadas,
                    estadoConv,
                    descartadosPorElMensaje,
                    mensajeFinalUnificado || ""
                ),
                herramientasEjecutadas,
                // Con escalado parcial el turno derivó algo Y contesta: el
                // consumidor tiene que enviar el mensaje igual (ver
                // `escaladoParcial` en tipos.ts).
                escaladoHumano: escaladoParcial,
                motivoEscalado: escaladoParcial ? motivoEscalado : undefined,
                escaladoPersistido: escaladoParcial ? escaladoPersistido : undefined,
                escaladoParcial: escaladoParcial || undefined,
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
            // Ya derivamos algo en este turno: una segunda llamada a
            // escalar_a_humano solo agregaría una fila repetida en la bandeja
            // del equipo. Se le contesta al modelo sin volver a persistir.
            if (call.function.name === "escalar_a_humano" && escaladoPersistido) {
                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: "Esa consulta ya quedó derivada al equipo en este mismo turno. No la vuelvas a derivar." +
                        (escaladoParcial ? CONTRATO_ESCALADO_PARCIAL : " No envies ningun mensaje al cliente.")
                })
                continue
            }

            /**
             * LA FICHA DEL PRODUCTO SE MIRA ANTES DE DERIVAR (conv 4317, 16/09).
             *
             * "La tapa viene completa armada?" sobre el combo que el cliente
             * venía comprando: el modelo llamó `resolver_variante` (para el
             * "corto" de la misma ráfaga) y `escalar_a_humano`, nunca consultó
             * el catálogo, y esa pregunta se fue a la bandeja del equipo en
             * silencio. El dato estaba cargado: el detalle de la Tapa CDI 125
             * dice, textual, que viene completa y lista para colocar.
             *
             * El modelo escala cuando "no tiene el dato", pero el dato no está
             * en su contexto: está en una herramienta que no ejecutó. Así que
             * la primera derivación técnica del turno sin catálogo consultado
             * no deriva: se le entrega la composición oficial del kit que ya
             * está en el embudo y decide otra vez. Si el dato de verdad no
             * está, vuelve a llamar a la tool y ahí sí se deriva (arriba, en el
             * guard de `escaladoPersistido`, o en el flujo normal).
             *
             * Solo para `consulta_tecnica`: el resto de los motivos (precio,
             * stock, envío, reclamo, moto no registrada) no se contestan con la
             * ficha del producto y derivan derecho como siempre.
             */
            {
                const kitEmbudoId = estadoConv.grupoPineado?.id ?? null
                const packEmbudoId = estadoConv.packPresentado?.id ?? null
                const sirveFicha = debeServirFichaAntesDeEscalar({
                    nombreHerramienta: call.function.name,
                    argumentosCrudos: call.function.arguments,
                    yaMiroElCatalogo: herramientasEjecutadas.some(
                        (ej) => ej.nombre === "consultar_catalogo_y_precios"
                    ),
                    fichaYaServida: fichaServidaAntesDeEscalar,
                    kitEmbudoId,
                    packEmbudoId
                })

                if (sirveFicha) {
                    try {
                        const ficha = await ejecutarHerramienta(
                            "consultar_catalogo_y_precios",
                            kitEmbudoId ? { grupo_id: kitEmbudoId } : { pack_id: packEmbudoId },
                            {
                                conversationId: opciones.conversationId,
                                embudo: {
                                    charlaEnCurso: historialPrevio.length > 0,
                                    grupoPineadoId: estadoConv.grupoPineado?.id ?? null,
                                    packPresentadoId: estadoConv.packPresentado?.id ?? null,
                                    varianteResuelta: estadoConv.varianteResuelta ?? null,
                                    motoConfirmada: estadoConv.motoConfirmada ?? null,
                                    repreguntasMoto:
                                        patchEstado.repreguntasMoto ?? estadoConv.repreguntasMoto ?? 0,
                                    motoDelMensaje: motoDelTurno,
                                    motoMencionada: motoVigenteDeLaCharla,
                                    numerosDelMensaje: numerosDelTurno
                                }
                            }
                        )
                        // Sin ficha no hay nada mejor que derivar: sigue el flujo normal.
                        if (ficha.resultado?.encontrado !== false && ficha.resultado?.mensaje_para_agente) {
                            fichaServidaAntesDeEscalar = true
                            herramientasEjecutadas.push(ficha)
                            mensajes.push({
                                role: "tool",
                                tool_call_id: call.id,
                                name: call.function.name,
                                content:
                                    PREAMBULO_FICHA_ANTES_DE_ESCALAR +
                                    ficha.resultado.mensaje_para_agente +
                                    CIERRE_FICHA_ANTES_DE_ESCALAR
                            })
                            continue
                        }
                    } catch (err) {
                        console.error("[motor] fallo al servir la ficha antes de escalar:", err)
                    }
                }
            }

            // ¿Alguna rama de ESTE call derivó algo al equipo? Define si al
            // resultado que ve el modelo se le pega el contrato de parcial.
            let escaloEnEsteCall = false
            /**
             * Registra el escalado y decide si el turno puede seguir hablando.
             * Con un motivo de silencio absoluto (reclamo, mayorista, ambiguo)
             * `escaladoParcial` queda en false y el turno corta mudo, como
             * siempre. Un solo motivo mudo manda sobre toda la ráfaga.
             */
            const marcarEscalado = (motivo: string) => {
                escaladoHumano = true
                escaloEnEsteCall = true
                if (!admiteRespuestaParcial(motivo)) {
                    silencioAbsoluto = true
                    escaladoParcial = false
                } else if (!silencioAbsoluto) {
                    escaladoParcial = true
                }
            }
            try {
                const ejecucion = await ejecutarHerramienta(call.function.name, call.function.arguments, {
                    conversationId: opciones.conversationId,
                    mensajeCliente: mensajeUsuario,
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
                        charlaEnCurso: historialPrevio.length > 0,
                        grupoPineadoId: estadoConv.grupoPineado?.id ?? null,
                        packPresentadoId: estadoConv.packPresentado?.id ?? null,
                        varianteResuelta: estadoConv.varianteResuelta ?? null,
                        // Excepción al "solo turnos anteriores": la variante que
                        // se resolvió recién, en un paso previo de ESTE turno.
                        // No cuenta como firme (el cliente todavía no la leyó),
                        // pero el catálogo la necesita para armar la composición
                        // con la pieza que de verdad se lleva (conv 4344).
                        varianteResueltaEnTurno: patchEstado.varianteResuelta ?? null,
                        motoConfirmada: estadoConv.motoConfirmada ?? null,
                        // Cuántas veces ya se le repreguntó la moto. Excepción
                        // al "solo turnos anteriores" de arriba: acá el dato es
                        // un cupo, y si una ráfaga repregunta dos veces en el
                        // mismo turno tiene que verse ya en el segundo paso.
                        repreguntasMoto: patchEstado.repreguntasMoto ?? estadoConv.repreguntasMoto ?? 0,
                        motoDelMensaje: motoDelTurno,
                        motoMencionada: motoVigenteDeLaCharla,
                        // Los numeros del mensaje ya leidos con su rol: sin
                        // esto `resolver_variante` vuelve a leer el mismo texto
                        // y puede clasificarlo distinto que la rama de arriba.
                        numerosDelMensaje: numerosDelTurno,
                        // Lo que el bot ya le dijo en esta charla: evidencia de
                        // que una ficha ya salió aunque nadie la haya pineado
                        // (ver `fichaPendiente` en resolver-variante.ts).
                        textoPreviosDelBot: textoQueElBotYaDijo
                    },
                    catalogoSinMatch: catalogoSinMatchEnTurno
                })
                herramientasEjecutadas.push(ejecucion)

                // 1. Si la herramienta fue explícitamente escalar_a_humano
                if (call.function.name === "escalar_a_humano") {
                    motivoEscalado = ejecucion.argumentos?.motivo || "escalado_manual"
                    marcarEscalado(motivoEscalado || "escalado_manual")
                    // El propio ejecutor de la herramienta ya insertó el pendiente.
                    escaladoPersistido = true
                    anotarEscaladoPendiente(
                        motivoEscalado || "escalado_manual",
                        ejecucion.argumentos?.resumen_consulta || mensajeUsuario
                    )
                }

                // 1.b resolver_variante puede pedir escalado (moto no registrada en un
                //     combo con incompatibilidad física real, o cliente que pide algo
                //     que el combo no es): se honra en el acto.
                if (call.function.name === "resolver_variante" && ejecucion.resultado?.escalar === true) {
                    motivoEscalado = ejecucion.resultado?.motivo || "moto_no_registrada"
                    marcarEscalado(motivoEscalado || "moto_no_registrada")
                    escaladoPersistido = true
                    // El resumen habla de compatibilidad solo cuando el escalado ES de
                    // compatibilidad: `producto_no_catalogado` sale del atributo fijo del
                    // pack (ej. cliente de recorrido largo sobre el combo corto) y ahí
                    // "Compatibilidad de X" despistaba al equipo en la bandeja.
                    const esProductoQueNoTenemos =
                        (motivoEscalado || "").split(":")[0].trim() === "producto_no_catalogado"
                    const resumenBase = esProductoQueNoTenemos
                        ? `Pide una versión de "${ejecucion.argumentos?.combo || "?"}" que no tenemos armada`
                        : `Compatibilidad de "${ejecucion.argumentos?.modelo_moto || "?"}" con "${ejecucion.argumentos?.combo || "?"}"`
                    anotarEscaladoPendiente(
                        motivoEscalado || "moto_no_registrada",
                        `${resumenBase} (el cliente escribió: "${mensajeUsuario.slice(0, 160)}").`
                    )
                    await escalarAHumano({
                        motivo: ejecucion.resultado?.motivo || "moto_no_registrada",
                        resumen_consulta: esProductoQueNoTenemos
                            ? `${resumenBase}. El cliente escribió: "${mensajeUsuario.slice(0, 160)}".`
                            : `Variante no resuelta para "${ejecucion.argumentos?.modelo_moto || "?"}" en combo "${ejecucion.argumentos?.combo || "?"}".`,
                        modelo_moto: ejecucion.argumentos?.modelo_moto,
                        kit: ejecucion.argumentos?.combo,
                        conversation_id: opciones.conversationId
                    }).catch((err) => console.error("[motor] fallo al persistir escalado de resolver_variante:", err))
                }

                // 2. REGLA DETERMINISTA DE ORO: Si consultó compatibilidad y NO se encontró,
                //    se escala en silencio Y se persiste el pendiente linkeado a la conversación.
                //
                //    Excepción: cuando la herramienta PIDIÓ repreguntar la moto
                //    (`repregunta_moto`), no falta la moto en el registro: falta
                //    que el cliente diga cuál es, y preguntarlo lo consigue.
                //    `resolver_variante` ya lo respetaba (conv 3947, marca
                //    sola), pero por este lado se escalaba igual: si el modelo
                //    llamaba `consultar_compatibilidad` en vez de la otra, la
                //    repregunta moría acá y el turno se iba mudo. El tope vive
                //    en la herramienta: agotado, deja de pedir repregunta y
                //    esto vuelve a derivar solo.
                if (
                    call.function.name === "consultar_compatibilidad" &&
                    ejecucion.resultado?.encontrado === false &&
                    ejecucion.resultado?.confianza !== "parcial" &&
                    ejecucion.resultado?.repregunta_moto !== true
                ) {
                    const moto = ejecucion.argumentos?.modelo_moto || "desconocida"
                    motivoEscalado = `moto_no_registrada: ${moto}`
                    marcarEscalado("moto_no_registrada")
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

                // 2.b EL RUBRO QUE NO VENDEMOS SE DERIVA, NO SE CONTESTA.
                //
                //     Misma regla de oro que la de arriba, del lado del
                //     catálogo: si el cliente pidió algo cuyo vocabulario no
                //     existe en ninguno de nuestros productos ("un kit de
                //     electricidad", conv 4206), esa consulta es del equipo.
                //
                //     La herramienta ya se lo ordena al modelo, pero la orden
                //     es texto y en la 4206 el modelo prefirió buscar de nuevo.
                //     Acá el escalado queda hecho aunque el modelo no lo pida.
                //     Es PARCIAL a propósito: el resto de la ráfaga se contesta
                //     igual (ahí mismo el cliente también pidió un kit de
                //     potenciación, y esa sí la teníamos).
                if (
                    call.function.name === "consultar_catalogo_y_precios" &&
                    ejecucion.resultado?.rubro_ajeno &&
                    !escaladoPersistido
                ) {
                    const rubro = String(ejecucion.resultado.rubro_ajeno).slice(0, 80)
                    motivoEscalado = "producto_no_catalogado"
                    marcarEscalado("producto_no_catalogado")
                    escaladoPersistido = true
                    const resumen = `Pide "${rubro}", que no es de lo que vendemos (el cliente escribió: "${mensajeUsuario.slice(0, 160)}").`
                    anotarEscaladoPendiente("producto_no_catalogado", resumen)
                    await escalarAHumano({
                        motivo: "producto_no_catalogado",
                        resumen_consulta: resumen,
                        conversation_id: opciones.conversationId
                    }).catch((err) => console.error("[motor] fallo al persistir producto_no_catalogado:", err))
                }

                // Una búsqueda de este turno ya volvió sin match: a partir de
                // acá el catálogo no se puede listar entero como reintento.
                if (call.function.name === "consultar_catalogo_y_precios" && ejecucion.resultado?.encontrado === false) {
                    catalogoSinMatchEnTurno = true
                    const termino = (ejecucion.argumentos?.termino_busqueda || "").trim()
                    if (termino) terminosSinMatchEnTurno.push(termino)
                }

                // 3. LA NEGATIVA DE COMPATIBILIDAD NO SE SIRVE A CIEGAS.
                //
                //    Las herramientas de compat no tienen memoria ni leen el
                //    mensaje: miran "moto + kit", devuelven el veredicto de la
                //    fila y la guía le ordena al modelo copiar la línea tal
                //    cual. Eso está bien la PRIMERA vez. Después no:
                //
                //    a) La fila casi nunca dice "imposible", dice "hay que
                //       alesar los cárteres" / "hay que cambiar la leva": es una
                //       condición. Si el cliente dice que ya la cumplió, el
                //       veredicto habla de una moto de fábrica, no de la suya.
                //    b) Si ya se la dimos y sigue escribiendo del tema, no
                //       sabemos por qué insiste. Repetir la misma línea es
                //       responder ciego (conv 3874, 10-11/09, Wave NF: "Si ya
                //       se ya lo tengo a agrandado los carter todo" → misma
                //       negativa palabra por palabra al día siguiente).
                //
                //    En los dos casos la charla pasa al equipo en silencio. El
                //    control vive acá, en un solo lugar, porque cubre los tres
                //    puntos del código que sirven una negativa y porque es el
                //    único que tiene juntos el veredicto, el mensaje del cliente
                //    y la memoria de la conversación.
                //
                //    Qué NO hay acá: una lista de modificaciones posibles. El
                //    "qué hay que hacerle" sale del `detalle` de la propia fila,
                //    así que un kit nuevo con otra condición funciona sin tocar
                //    código (ver `nucleo/negativa-condicional.ts`).
                let guiaNegativa: string | null = null
                const resNeg = ejecucion.resultado || {}
                const esVeredictoNegativo =
                    (call.function.name === "resolver_variante" && resNeg.incompatible === true) ||
                    (call.function.name === "consultar_compatibilidad" &&
                        resNeg.encontrado === true &&
                        resNeg.compatible === false)

                if (esVeredictoNegativo) {
                    const motoNeg = String(
                        resNeg.moto || resNeg.modelo_moto_detectado || ejecucion.argumentos?.modelo_moto || ""
                    ).trim()
                    const kitNeg = String(
                        (resNeg.grupo_id ? `grupo:${resNeg.grupo_id}` : null) ||
                            ejecucion.argumentos?.combo ||
                            ejecucion.argumentos?.kit_nombre_o_id ||
                            resNeg.kit ||
                            ""
                    ).trim()
                    const detalleNeg = String(resNeg.detalle || "")
                    const previa = estadoConv.negativaEntregada
                    const yaSeLaDimos = await mismaConsultaCompatibilidad(previa, { moto: motoNeg, kit: kitNeg })
                    const superada = condicionSuperada(mensajeUsuario, detalleNeg || (yaSeLaDimos ? previa?.detalle : undefined))

                    if (motoNeg && (superada || yaSeLaDimos)) {
                        guiaNegativa = superada
                            ? guiaCondicionSuperada({ moto: motoNeg, tipo: superada.tipo })
                            : guiaNegativaYaEntregada({ moto: motoNeg })

                        const resumen = superada
                            ? superada.tipo === "hecho"
                                ? `Dice que a su ${motoNeg} YA le hizo la modificación que pide la ficha${superada.termino ? ` (${superada.termino})` : ""}: confirmar si así le entra${kitNeg ? ` el "${kitNeg}"` : ""}.`
                                : `Está dispuesto a hacerle la modificación que pide la ficha a su ${motoNeg}${superada.termino ? ` (${superada.termino})` : ""}: confirmar si así le entra${kitNeg ? ` el "${kitNeg}"` : ""}.`
                            : `Insiste después de la negativa de "${motoNeg}"${kitNeg ? ` para "${kitNeg}"` : ""}.`

                        motivoEscalado = "compatibilidad_dudosa"
                        marcarEscalado("compatibilidad_dudosa")
                        escaladoPersistido = true
                        anotarEscaladoPendiente(
                            "compatibilidad_dudosa",
                            `${resumen} (el cliente escribió: "${mensajeUsuario.slice(0, 160)}").`
                        )
                        await escalarAHumano({
                            motivo: "compatibilidad_dudosa",
                            resumen_consulta: `${resumen} El cliente escribió: "${mensajeUsuario.slice(0, 160)}".`,
                            modelo_moto: motoNeg,
                            kit: kitNeg || undefined,
                            conversation_id: opciones.conversationId
                        }).catch((err) =>
                            console.error("[motor] fallo al persistir escalado de negativa condicional:", err)
                        )
                    } else if (motoNeg) {
                        // Primera negativa de esta moto: queda anotada para que
                        // la próxima vez no se repita de memoria.
                        patchEstado.negativaEntregada = {
                            moto: motoNeg,
                            kit: kitNeg,
                            detalle: detalleNeg,
                            en: new Date().toISOString()
                        }
                    }
                }

                // Esta herramienta no fue la que escaló y trajo algo real (no un
                // "no encontrado"): hay "resto de la ráfaga" legítimo para contestar.
                if (!escaloEnEsteCall && ejecucion.resultado && ejecucion.resultado.encontrado !== false) {
                    huboOtroDatoResuelto = true
                }

                // El modelo ve SOLO `mensaje_para_agente`: es el contrato de cada
                // herramienta (qué mostrar y qué NO mostrar en este paso). Los arrays
                // crudos (packs, grupos, variantes...) quedan en el inspector y la base
                // pero NO llegan al modelo, para que no contradiga la guía del paso.
                const contenidoParaModelo =
                    guiaNegativa ??
                    (ejecucion.resultado && typeof ejecucion.resultado.mensaje_para_agente === "string"
                        ? ejecucion.resultado.mensaje_para_agente
                        : JSON.stringify(ejecucion.resultado))

                /**
                 * LETRA DE LA CASA (`bot-agente/frases`)
                 * Va pegada a la guia del paso, que es donde el modelo ya esta
                 * leyendo que hacer, y solo para el momento que esta
                 * herramienta acaba de resolver: un turno que no llega a un
                 * momento no paga por su letra.
                 *
                 * Nunca sobre una negativa ni sobre un call que escalo: esos
                 * textos ya estan decididos (la negativa tiene su propio
                 * `mensaje_incompatibilidad` editable, el escalado va mudo) y
                 * ofrecerle una forma de decirlos seria empujarlo a hablar.
                 */
                const letraDeLaCasa =
                    guiaNegativa || escaloEnEsteCall
                        ? ""
                        : await bloqueLetraDeLaCasa(ejecucion.resultado?.momento, {
                              // La moto del turno primero; si no la volvio a
                              // decir, la que ya venia confirmada de la charla:
                              // el cliente la dijo hace 3 turnos y la letra
                              // ("para tu {moto}") igual le habla de SU moto.
                              moto:
                                  ejecucion.resultado?.moto_confirmada ||
                                  ejecucion.resultado?.modelo_moto_detectado ||
                                  estadoConv.motoConfirmada,
                              kit: ejecucion.resultado?.etiqueta || ejecucion.resultado?.kit,
                              precio:
                                  typeof ejecucion.resultado?.precio === "number"
                                      ? formatearPrecioAR(ejecucion.resultado.precio)
                                      : null,
                              // La clausula de envio la decide la herramienta
                              // leyendo la base (`nucleo/envio.ts`), no la
                              // letra: una frase con {envio} sale sin la
                              // clausula cuando ese producto no lo tiene
                              // gratis, en vez de prometerlo igual.
                              envio: ejecucion.resultado?.envio_frase
                          })

                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    // Si este call derivó algo, el contrato de escalado parcial
                    // viaja pegado al resultado: es lo que le dice al modelo que
                    // calle ESE punto y siga con el resto de la ráfaga.
                    content: !escaloEnEsteCall
                        ? contenidoParaModelo + letraDeLaCasa
                        : escaladoParcial
                          ? contenidoParaModelo + CONTRATO_ESCALADO_PARCIAL
                          : contenidoParaModelo + SUFIJO_SILENCIO_TOTAL
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
                } else if (r.grupo_id && !r.resuelta) {
                    // La nueva duda/negación no puede dejar firme la elección anterior.
                    patchEstado.varianteResuelta = null
                }
                if (r.moto_confirmada && patchEstado.motoConfirmada === undefined) {
                    patchEstado.motoConfirmada = r.moto_confirmada
                }
            }
            if (ej.nombre === "consultar_compatibilidad" && r.compatible === true && r.modelo_moto_detectado) {
                patchEstado.motoConfirmada = r.modelo_moto_detectado
            }
            // La herramienta pidió repreguntarle la moto al cliente (dijo solo
            // la marca). Se cuenta para que la repregunta tenga freno: al llegar
            // a `TOPE_REPREGUNTAS_MOTO` las tools dejan de pedirla y derivan.
            if (r.repregunta_moto === true) {
                patchEstado.repreguntasMoto = (patchEstado.repreguntasMoto ?? estadoConv.repreguntasMoto ?? 0) + 1
            }
            // Tema de negocio efectivamente entregado: queda anotado para que el
            // turno siguiente no vuelva a volcar el mismo bloque (conv 3561).
            if (ej.nombre === "consultar_info_negocio" && r.encontrado === true && r.tema) {
                patchEstado.temasRespondidos = unirTemas(patchEstado.temasRespondidos, [r.tema])
            }
        }

        // Si se activó escalado a humano (por la herramienta o por regla determinista de compatibilidad):
        // SILENCIO TOTAL: El bot NO envía ningún mensaje al cliente de WhatsApp.
        // Escalado con silencio absoluto (reclamo, mayorista, motivo que no
        // entendemos): el turno muere acá, sin decirle nada al cliente.
        //
        // Si en cambio el escalado admite respuesta parcial, el loop NO corta: el
        // modelo sigue con el contrato pegado al resultado de la herramienta, y
        // puede llamar a las herramientas que le faltan para contestar el resto
        // de la ráfaga (conv 3421: derivar la marca del cilindro no puede dejar
        // muda la compatibilidad de la moto, que sí teníamos cargada).
        if (escaladoHumano && !escaladoParcial) {
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

    // Si agotó los pasos máximos sin respuesta, escalar por seguridad.
    // Salvo que el turno ya venga de un escalado parcial: ahí el pendiente ya
    // está en la bandeja del equipo y el motivo real es el de ese escalado.
    if (escaladoParcial) {
        await persistirEstado()
        return {
            mensajeFinal: null,
            herramientasEjecutadas,
            escaladoHumano: true,
            motivoEscalado,
            escaladoPersistido,
            latenciaMs: Date.now() - inicio,
            tokensUsados: tokensTotales
        }
    }

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
