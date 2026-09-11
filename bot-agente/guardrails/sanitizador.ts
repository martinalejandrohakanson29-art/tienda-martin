import { normalizarTexto } from "../nucleo/texto"
/**
 * Guardrail y sanitizador determinista de salida.
 * Se ejecuta en código puro sobre cualquier texto generado por la IA
 * antes de ser entregado al cliente, garantizando el cumplimiento estricto
 * de las normas de estilo y tono de Revolución Motos.
 */

/**
 * ENLACES: un link es un dato binario, anda o no anda.
 * ----------------------------------------------------
 * Desde que `info_negocio` carga las URLs reales (Instagram, TikTok, Maps,
 * Mercado Libre), el texto que sale puede tener una URL adentro. Todo este
 * archivo está escrito para texto en prosa y la maltrata sin querer:
 *   - las palabras prohibidas del admin y los reemplazos de modismos aplican
 *     `\b`, así que una palabra adentro del path la mutilan;
 *   - `pareceRespuestaNoConfiable` cuenta palabras inglesas y "me" (de
 *     `wa.me`) o "note"/"call" adentro de una URL son falsos positivos que
 *     descartan el mensaje ENTERO y escalan;
 *   - los filtros de repetición borrarían el link si el cliente lo vuelve a
 *     pedir, que es justo cuando hay que mandarlo.
 *
 * Solución: las URLs se enmascaran antes de tocar el texto y se restauran al
 * final, y los filtros que borran tienen excepción explícita para ellas.
 */
const RX_URL_FUENTE = "https?:\\/\\/[^\\s<>()\\[\\]\"']+|www\\.[^\\s<>()\\[\\]\"']+"

/** Nuevo regex en cada uso: son `/g`, compartirlos arrastra `lastIndex`. */
function rxUrl(): RegExp {
    return new RegExp(RX_URL_FUENTE, "gi")
}

export function contieneUrl(texto: string | null | undefined): boolean {
    return rxUrl().test(texto || "")
}

/** Reemplaza las URLs por un token opaco (área de uso privado Unicode). */
function enmascararUrls(texto: string): { texto: string; urls: string[] } {
    const urls: string[] = []
    const conMascara = texto.replace(rxUrl(), (url) => {
        urls.push(url)
        return `${urls.length - 1}`
    })
    return { texto: conMascara, urls }
}

function restaurarUrls(texto: string, urls: string[]): string {
    if (urls.length === 0) return texto
    return texto.replace(/(\d+)/g, (match, i) => urls[Number(i)] ?? match)
}

/**
 * WhatsApp no renderiza markdown: `[Instagram](https://...)` llega con los
 * corchetes a la vista. Se desarma a "Instagram: https://..." (o a la URL
 * pelada si el texto del link ya era la URL).
 */
export function normalizarEnlaces(texto: string): string {
    return (texto || "")
        .replace(/\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+|www\.[^\s)]+)\s*\)/gi, (_m, etiqueta: string, url: string) => {
            const t = (etiqueta || "").trim()
            if (!t || t === url || contieneUrl(t)) return url
            return `${t}: ${url}`
        })
        // <https://...> (autolink de markdown)
        .replace(/<\s*((?:https?:\/\/|www\.)[^\s>]+)\s*>/gi, "$1")
}

// Palabras o modismos que el bot NUNCA debe decir
const REEMPLAZOS_MODISMOS: [RegExp, string][] = [
    [/\bculia[do]s?\b/gi, "amigo"],
    [/\bche\b/gi, ""],
    [/\bchab[oó]n\b/gi, "amigo"],
    [/\bamigazo\b/gi, "amigo"],
    [/\bmaster\b/gi, "amigo"],
    [/\bvieja\b/gi, "amigo"],
    [/\bflaco\b/gi, "amigo"],
    [/\bwey\b/gi, ""],
    [/\bpana\b/gi, "amigo"]
]

// Frases prohibidas que delatan IA o filtran datos del sistema
const FRASES_PROHIBIDAS_IA = [
    /soy una inteligencia artificial/gi,
    /soy un bot\b/gi,
    /como modelo de lenguaje/gi,
    /soy un modelo de lenguaje/gi,
    /como asistente virtual/gi,
    /soy un asistente virtual/gi,
    /como ia\b/gi,
    /no tengo sentimientos/gi,
    /en qué puedo asistirte hoy/gi,
    /mis instrucciones (de sistema|son|internas)/gi,
    /mi prompt (de sistema|es|dice)/gi,
    /fui programado para/gi,
    /fui creado por OpenAI/gi
]

// Frases de espera o proceso interno que JAMÁS deben llegar al cliente
const FRASES_PROCESO_INTERNO = [
    /^un momento[,.]?\s*(voy a|que)?\s*(consultar|revisar|verificar|buscar|fijarme).*/gi,
    /^aguarda(me)?\s*(un instante|un momento|un segundo)?[,.]?\s*(voy a|que)?\s*(consultar|revisar|verificar).*/gi,
    /^dame un segundo[,.]?\s*(voy a|que)?\s*(consultar|revisar|verificar).*/gi,
    /^estoy consultando.*/gi,
    /^voy a consultar sobre la compatibilidad.*/gi
]

// Fórmulas de cierre pesadas o robóticas de call center / asistente virtual
const FRASES_CALL_CENTER: [RegExp, string][] = [
    [/si te interesa,?\s*(te)?\s*puedo ayudar(te)?\s*a coordinar la compra[^\n.?!]*(o responder[^\n.?!]*)?(\.?\s*qué te parece\??)?/gi, "Cualquier cosa avisanos y coordinamos."],
    [/puedo ayudar(te)?\s*a coordinar la compra[^\n.?!]*/gi, "Cualquier cosa avisanos y coordinamos."],
    [/responder cualquier otra duda que tengas[.,?!]?\s*(qué te parece\??)?/gi, "Cualquier duda nos avisás."],
    [/responder cualquier duda que tengas[.,?!]?\s*(qué te parece\??)?/gi, "Cualquier duda nos avisás."],
    [/qué te parece\??$/gi, ""],
    // Pregunta-oferta de relleno al final del mensaje ("querés que te prepare el
    // combo?", "querés que te pase el alias?", "te gustaría que procedamos?").
    // Solo se recorta cuando es la ÚLTIMA oración: las preguntas del embudo
    // ("a qué moto...?", "sabés si es corto o largo?") no son "querés que ...".
    // Cuando definamos las ofertas permitidas, van por el `mensaje_para_agente`
    // de la tool del paso de cierre, no acá.
    [/(^|[.!?]\s+|\n+)\s*(?:quer[eé]s|querr[ií]as|te gustar[ií]a|podr[ií]as|podés)\s+que\s+(?:te|nos|le|lo|la|se\s+lo|se\s+la)?\s*[a-záéíóúñ]+[^\n?]*\?\s*$/gi, "$1"],
    [/no dudes en consultarme[.,?!]?/gi, "Cualquier duda me avisás."],
    [/quedo a tu (entera\s*)?disposición[.,?!]?/gi, ""],
    [/estoy a tu disposición[.,?!]?/gi, ""],
    [/en qué más (te puedo|puedo)\s*(ayudar|asistir|colaborar)\??/gi, ""],
    [/(?:^|\s*)(?:éxitos|exitos|suerte|ojal[aá])\s+(?:con\s+(?:la\s+)?juntada|con\s+(?:la\s+)?junta|juntando(?:\s+(?:la\s+)?plata)?|juntes(?:\s+(?:la\s+)?plata)?|puedas\s+juntar|con\s+el\s+cobro|cobres\s+pronto)[.!]*/gi, ""]
]

// Preámbulos de sinceridad / confesión. El bot no "confiesa" nada: informa.
//
// Conv 3874 (Wave NF): la negativa de compatibilidad salió como "te soy
// sincero: ese combo no le entra directo a la Wave NF". Un vendedor de
// mostrador no arranca pidiendo permiso para decir la verdad, dice el dato y
// el motivo. Es un recorte de prefijo: se saca la muletilla y queda la
// oración, que es la que importa.
const MULETILLAS_SINCERIDAD = [
    /\b(te\s+)?(voy a ser|soy|ser[ée]|siendo)\s+(sincero|honesto|franco)\s*[:,.\-–—]*\s*/gi,
    /\bpara\s+(ser|serte)\s+(sincero|honesto|franco)\s*[:,.\-–—]*\s*/gi,
    /\bsinceramente\s*[:,]*\s*/gi,
    /\bno\s+te\s+(voy a\s+)?(mentir|miento|engañar)\s*[:,.\-–—]*\s*/gi,
    /\b(te\s+)?(digo|dir[ée])\s+la\s+verdad\s*[:,.\-–—]*\s*/gi,
    /\bla\s+verdad\s+(es\s+)?que\s+/gi,
    /\blamento\s+(decirte|informarte|comunicarte)(\s+que)?\s*[:,]*\s*/gi,
]

// Corrección obligatoria de tuteo neutro a voseo argentino (ej: Recuerda -> Recordá)
const CORRECCIONES_VOSEO_ARGENTINO: [RegExp, string][] = [
    [/\brecuerda\b/gi, "recordá"],
    [/\bten en cuenta\b/gi, "tené en cuenta"],
    [/\bdime\b/gi, "decime"],
    [/\bdinos\b/gi, "decinos"],
    [/\bhazlo\b/gi, "hacelo"],
    [/\bhaz\b/gi, "hacé"],
    [/\bmira\b/gi, "mirá"],
    [/\bavísame\b/gi, "avisame"],
    [/\bescríbeme\b/gi, "escribime"],
    [/\bpídeme\b/gi, "pedime"],
    [/\bpregúntame\b/gi, "preguntame"],
    [/\bconsúltame\b/gi, "consultame"],
    [/\bcomunícate\b/gi, "comunicate"]
]

export interface ResultadoSanitizacion {
    textoLimpio: string
    modificado: boolean
    alertasIA: boolean
}

// ── Guardrail duro: respuestas que NO pueden llegar al cliente ────────────────
// El modelo a veces filtra su razonamiento interno, texto en inglés, o el
// `mensaje_para_agente` crudo de una herramienta (guía operativa, no un mensaje
// para el cliente). Si algo de esto aparece, NO se limpia — se descarta la
// respuesta entera y se escala a un humano (ver motor.ts).

// Palabras que son inequívocamente inglés (no se cruzan con español).
const PALABRAS_INGLES = [
    "the", "and", "you", "your", "with", "this", "that", "for", "are", "will",
    "should", "must", "need", "before", "after", "follow", "instruction",
    "instructions", "require", "requires", "required", "tool", "tools", "system",
    "answer", "customer", "already", "then", "now", "call", "please", "note",
    "here", "there", "which", "what", "when", "cannot", "can't", "don't", "i'll",
    "i've", "it's", "let", "me", "provide", "response", "message", "user",
]

// Frases meta / de proceso que delatan que es guía interna, no un mensaje.
const FRASES_META_INTERNAS = [
    /\bel sistema (requiere|necesita|me pide|exige|indica) que/i,
    /\b(the system|i) (requires?|need|should|must|will|have to|am required)/i,
    /\bfollow the (tool|system)/i,
    /\bbefore answering\b/i,
    /\b(resolver_variante|consultar_compatibilidad|consultar_catalogo_y_precios|consultar_info_negocio|escalar_a_humano|mensaje_para_agente)\b/i,
    /\bPASO \d+\b/,
    /CAT[ÁA]LOGO OFICIAL/i,
    /ATENCI[ÓO]N VENDEDOR/i,
    /REGLA (DE MOSTRADOR|COMERCIAL|ESTRICTA|DURA|DEL PROYECTO)/i,
    /TEXTO PARA (ENVIAR|EL CLIENTE)/i,
    /\bmensaje oficial cargado\b/i,
    /\b(escal[áa]|escalar) (en silencio|al equipo|a un humano)\b/i,
    /\[(silencio|dry-?run|piloto|reproceso|escalad)/i,
    /\bPROHIBIDO\b/,
    /\bel cliente (ya eligi|todav[ií]a no|a[uú]n no|no mencion|no dio|no aclar)/i,
    // Fuga de la guía interna en español: el modelo NARRA la instrucción en vez
    // de ejecutarla ("Fijate el contrato: tenes que preguntarle exactamente...").
    /\b(fijate|seg[uú][ií]|revis[áa]|respet[áa]|mir[áa])\s+(en\s+)?(el|la|este|esta)\s+(contrato|gu[ií]a|instrucci[oó]n|pauta|consigna)\b/i,
    /\bcontrato de grounding\b/i,
    /\b(el|seg[uú]n el|este)\s+contrato\s+(dice|indica|pide|exige|me pide)/i,
    /\b(ten[eé]s|tengo|deb[eo]|hay)\s+que\s+(preguntar|decir|explicar|responder|contestar)(le|selo)\b/i,
    /\b(pregunt|explic|dec|contest|copi|mand)[aá](le|la|lo|selo)?\s+(exactamente|textual(mente)?|tal\s+cual|literal(mente)?)\b/i,
    /\ben\s+su\s+propio\s+globo\b/i,
    /\bgu[ií]a t[eé]cnica( de taller)?\b/i,
    /\bpregunta[_ ](inicial|variante)\b/i,
    /(^|\n|\.\s)\s*(nota|mensaje|texto|gu[ií]a|instrucci[oó]n|indicaci[oó]n)?\s*para\s+(el\s+|un\s+)?(agente|vendedor|equipo)\b/i,
    /\bel\s+(paso|estado)\s+(del\s+embudo|actual\s+del\s+embudo)\b/i,
    /\bno\s+(le\s+)?vuelvas\s+a\s+preguntar\b/i,
]

/**
 * ¿La respuesta parece razonamiento interno / inglés / guía de herramienta en
 * vez de un mensaje real para el cliente? Si devuelve true, la respuesta se
 * descarta y se escala — NO se intenta limpiar.
 */
export function pareceRespuestaNoConfiable(texto: string | null | undefined): boolean {
    const t = (texto || "").trim()
    if (!t) return false

    for (const rx of FRASES_META_INTERNAS) {
        if (rx.test(t)) return true
    }

    // Detección de inglés: 2+ palabras inequívocamente inglesas como tokens.
    // Las URLs se sacan primero: `wa.me`, `/note`, `?user=` no son inglés
    // filtrado, son el link que cargó Martín — y un falso positivo acá tira el
    // mensaje entero y escala.
    const tokens = t.replace(rxUrl(), " ").toLowerCase().match(/[a-z']+/g) || []
    const setIngles = new Set(PALABRAS_INGLES)
    let hits = 0
    const vistas = new Set<string>()
    for (const tok of tokens) {
        if (setIngles.has(tok) && !vistas.has(tok)) {
            vistas.add(tok)
            hits++
            if (hits >= 2) return true
        }
    }

    return false
}

export interface OpcionesSanitizacion {
    palabrasProhibidas?: string[]
    permitirBro?: boolean
    esConversacionEnCurso?: boolean
}

/**
 * Limpia y normaliza el mensaje generado por el LLM
 */
/** Normaliza una oración para compararla: sin tildes, signos ni doble espacio. */
function claveOracion(oracion: string): string {
    return normalizarTexto(oracion)
}

/**
 * Quita del mensaje las oraciones que el bot YA dijo textualmente en sus
 * mensajes anteriores de esta conversación.
 *
 * Por qué existe: las frases de ejemplo del prompt terminaban usándose como
 * plantilla y salían idénticas dos mensajes seguidos ("Le va bien bro,
 * cualquier cosa avisanos y coordinamos." en la conv 3561). Esto NO es una
 * regla de negocio ni de embudo — es higiene de texto — así que vive acá, en el
 * sanitizador determinista, y no suma un párrafo al prompt.
 *
 * Conservador a propósito:
 *   - Solo compara oraciones de 4 palabras o más (no toca "Dale!", "Si bro").
 *   - Nunca deja el mensaje vacío: si todo era repetido, devuelve el original
 *     (que no se mande nada lo decide el motor, no este filtro).
 *   - No toca preguntas: repreguntar algo es legítimo.
 */
/**
 * Extrae los "hechos duros" de un texto: todo numero con la unidad que lo sigue.
 * Es lo que un cliente reconoce como dato repetido — el plazo, el precio, la
 * cantidad — a diferencia de la redaccion, que puede cambiar libremente.
 *
 *   "demora 4 a 6 dias habiles"  -> ["4 dias", "6 dias"]
 *   "sale $99.990"               -> ["99990"]
 *   "el envio es gratis"         -> ["gratis"]
 */
export function extraerHechos(texto: string): Set<string> {
    const hechos = new Set<string>()

    // Normalizacion propia, NO `normalizarTexto`: ese reemplaza el punto por un
    // espacio y parte "99.990" en "99 990", con lo cual ningun precio matcheaba.
    // Aca los separadores de miles se unen ANTES de limpiar la puntuacion.
    // Las URLs no son hechos: `.../p9bdB46a7JtNJXZP7` tiene digitos sueltos que
    // el regex de rangos lee como plazos o precios inexistentes.
    const plano = (texto || "")
        .replace(rxUrl(), " ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/(\d)[.,\s](?=\d{3}\b)/g, "$1")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()

    // Numeros con su unidad: "4 dias", "48 hs", "2 semanas". La unidad se toma
    // de la primera palabra que sigue, salteando conectores de rango.
    const RANGO = /(\d[\d.,]*)\s*(?:a|y|-)?\s*(?:(\d[\d.,]*)\s*)?([a-z]+)?/g
    let m: RegExpExecArray | null
    while ((m = RANGO.exec(plano)) !== null) {
        const unidad = m[3] && m[3].length > 1 ? m[3] : ""
        for (const n of [m[1], m[2]]) {
            if (!n) continue
            const limpio = n.replace(/[.,]/g, "")
            if (!limpio) continue
            hechos.add(unidad ? `${limpio} ${unidad}` : limpio)
            // Los numeros grandes (precios) se registran TAMBIEN pelados: la
            // palabra que los sigue cambia con la redaccion ("$99.990 con la
            // leva" / "$99.990 y coordinamos") y atarlos a ella los volvia
            // invisibles. Los chicos siguen necesitando su unidad para no
            // confundir "4 dias" con "kit 4".
            if (Number(limpio) >= 1000) hechos.add(limpio)
        }
    }

    // "gratis" funciona como un hecho: repetirlo suena igual de robotico que
    // repetir un precio, y no lleva numero que lo delate.
    if (/\bgratis\b/.test(plano)) hechos.add("gratis")

    return hechos
}

/**
 * Quita las frases que vuelven a decir un HECHO que el bot ya dio en esta
 * conversacion (un plazo, un precio, "gratis"), aunque esten redactadas de otra
 * forma.
 *
 * Por que existe: `quitarOracionesYaDichas` compara oraciones exactas, asi que
 * solo atrapa el copy-paste. Un modelo que parafrasea se le escapa entero —
 * "demora 4 a 6 dias habiles" y "son esos 4 a 6 dias hasta alla" son oraciones
 * distintas y el cliente igual esta leyendo el mismo dato dos veces. Se vio con
 * deepseek-v4-flash en el caso-33 del banco (09/09), que ni siquiera llama a
 * `consultar_info_negocio`: recita del historial, donde el dato siempre esta a
 * la vista. Como el problema es del texto y no del embudo, se resuelve aca y no
 * sumando un parrafo al prompt (que ya lo pide, en `estado-persistente.ts`).
 *
 * Conservador a proposito:
 *   - Si el cliente PREGUNTA algo, no filtra nada: volver a dar un dato que te
 *     acaban de pedir es responder, no repetirse. La unica excepcion es
 *     `hechosDeLaMismaRafaga` (ver el parametro): un dato que ya salio en un
 *     globo de HACE TRES SEGUNDOS no se vuelve nuevo porque lo hayan preguntado
 *     — la pregunta ya quedo contestada por ese globo.
 *   - No toca preguntas del bot ni frases sin hechos.
 *   - Recorta la frase justa, no la oracion entera, para no perder lo nuevo que
 *     venia pegado.
 *   - Nunca deja el mensaje vacio: si todo era repetido, devuelve el original.
 */
export function quitarHechosYaDichos(
    texto: string,
    mensajesPreviosDelBot: string[],
    mensajeDelCliente?: string,
    hechosFrescos?: Set<string>,
    /**
     * Hechos que el cliente ya leyo en un globo emitido en ESTA MISMA rafaga
     * (la ficha de la plantilla del anuncio, que sale antes del sub-turno que
     * resuelve el resto). Se filtran SIEMPRE, incluso si el cliente pregunto y
     * aunque una herramienta los haya devuelto en este turno: son las dos vias
     * por las que el mismo precio salia dos veces seguidas (conv 3859, 10/09).
     */
    hechosDeLaMismaRafaga?: Set<string>
): string {
    if (!texto?.trim() || !mensajesPreviosDelBot?.length) return texto

    const preguntaDelCliente = !!mensajeDelCliente && /\?/.test(mensajeDelCliente)
    // El cliente pregunta => contestar con el dato es lo correcto, no repetirse.
    // Salvo que ese dato ya haya salido en un globo de esta misma rafaga.
    if (preguntaDelCliente && !hechosDeLaMismaRafaga?.size) return texto

    const yaDichos = new Set<string>()
    // Si el cliente pregunto, lo unico prohibido es lo de la rafaga en curso:
    // el resto del historial vuelve a estar disponible para contestarle.
    for (const previo of preguntaDelCliente ? [] : mensajesPreviosDelBot) {
        for (const h of extraerHechos(previo || "")) yaDichos.add(h)
    }
    // Un hecho que salió de una herramienta EN ESTE TURNO no es una repetición:
    // es la respuesta. Cuando el cliente elige la variante, el precio final ya
    // estaba en la ficha del combo — y aun así confirmarlo es el cierre de la
    // venta, no ruido. Sin esta excepción el guardrail borraba justo el precio
    // (casos 24 y 29 del banco).
    if (hechosFrescos) {
        for (const h of hechosFrescos) yaDichos.delete(h)
    }
    // ...pero un hecho de la rafaga en curso le gana a "es fresco": la
    // herramienta lo devolvio recien, si, y el cliente igual lo tiene tres
    // segundos mas arriba en la pantalla.
    if (hechosDeLaMismaRafaga) {
        for (const h of hechosDeLaMismaRafaga) yaDichos.add(h)
    }
    if (yaDichos.size === 0) return texto

    const lineas = texto.split(/\n/)
    const salida: string[] = []

    for (const linea of lineas) {
        const oraciones = linea.split(/(?<=[.!?])\s+/)
        const oracionesLimpias: string[] = []

        for (const oracion of oraciones) {
            if (oracion.trim().endsWith("?")) {
                oracionesLimpias.push(oracion)
                continue
            }

            // Se recorta por frase (coma / "y" / ";"), no por oracion entera:
            // "El envio es gratis y son esos 4 a 6 dias" tiene que perder el
            // plazo pero no obliga a tirar el resto de lo que diga.
            const frases = oracion.split(/(?:,|;| y (?=[a-z]))/)
            const conservadas = frases.filter((frase) => {
                // Una frase con un link nunca se recorta: si el cliente lo
                // vuelve a pedir, mandarlo de nuevo es la respuesta.
                if (contieneUrl(frase)) return true
                const hechos = extraerHechos(frase)
                if (hechos.size === 0) return true
                return ![...hechos].some((h) => yaDichos.has(h))
            })

            if (conservadas.length === frases.length) {
                oracionesLimpias.push(oracion)
            } else if (conservadas.some((f) => f.trim().length > 0)) {
                let rearmada = conservadas.join(", ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim()
                rearmada = rearmada.replace(/^[,;\s]+/, "").replace(/[,;\s]+$/, "")
                if (rearmada) {
                    if (!/[.!?]$/.test(rearmada)) rearmada += "."
                    oracionesLimpias.push(rearmada.charAt(0).toUpperCase() + rearmada.slice(1))
                }
            }
        }

        salida.push(oracionesLimpias.join(" ").trim())
    }

    const resultado = salida.join("\n").replace(/\n{3,}/g, "\n\n").trim()
    if (resultado.length > 0) return resultado

    // Vacio y lo unico que tenia eran datos de la rafaga en curso => ese globo
    // no aporta nada: el cliente acaba de leer todo eso. Devolver el original
    // "por las dudas" es justamente el mensaje repetido (conv 3859). El motor
    // descarta los globos vacios; si era el unico, el turno queda mudo, que es
    // lo correcto cuando la ficha ya contesto la pregunta.
    // En cualquier otro caso se mantiene la regla vieja: nunca vaciar.
    if (hechosDeLaMismaRafaga?.size) return ""

    return texto
}

export function quitarOracionesYaDichas(texto: string, mensajesPreviosDelBot: string[]): string {
    if (!texto?.trim() || !mensajesPreviosDelBot?.length) return texto

    const yaDichas = new Set<string>()
    for (const previo of mensajesPreviosDelBot) {
        for (const o of (previo || "").split(/(?<=[.!?])\s+|\n+/)) {
            const clave = claveOracion(o)
            if (clave.split(" ").length >= 4) yaDichas.add(clave)
        }
    }
    if (yaDichas.size === 0) return texto

    const lineas = texto.split(/\n/)
    const salida: string[] = []
    for (const linea of lineas) {
        const oraciones = linea.split(/(?<=[.!?])\s+/)
        const conservadas = oraciones.filter((o) => {
            if (o.trim().endsWith("?")) return true // repreguntar es válido
            if (contieneUrl(o)) return true // volver a pasar un link es responder, no repetirse
            const clave = claveOracion(o)
            if (clave.split(" ").length < 4) return true
            return !yaDichas.has(clave)
        })
        salida.push(conservadas.join(" ").trim())
    }

    const resultado = salida.join("\n").replace(/\n{3,}/g, "\n\n").trim()
    return resultado.length > 0 ? resultado : texto
}

/**
 * Frases donde el bot ANUNCIA que deriva la consulta, promete averiguar o
 * compromete una respuesta futura.
 *
 * Por qué existe: con el escalado parcial el bot sigue hablando después de
 * derivar una parte de la ráfaga, y la tentación natural del modelo es
 * blanquearlo ("eso lo consulto y te aviso"). El escalado es INVISIBLE para el
 * cliente: el equipo entra en la conversación sin anunciarse, y una promesa de
 * respuesta es justo lo que no podemos garantizar (misma familia que el
 * "te aviso" indebido de los escalados de n8n).
 *
 * "avisame vos" / "cuando estés listo nos avisás" son legítimos y NO caen acá:
 * los patrones piden que el que averigua o avisa sea el bot.
 */
const FRASES_DERIVACION_ANUNCIADA = [
    /\b(lo|la|eso|esto|ese dato|el dato)\s+(consulto|averiguo|chequeo|verifico|confirmo|reviso|pregunto)\b/i,
    /\b(te|le)\s+(aviso|averiguo|consulto|confirmo luego|confirmo m[áa]s tarde|respondo (en un rato|m[áa]s tarde|enseguida))\b/i,
    /\b(consulto|averiguo|pregunto|chequeo)\s+(con|a|al|en)\s+(el\s+)?(equipo|due[ñn]o|encargado|taller|dep[oó]sito|compa[ñn]er[oa]s?|fabrica|f[áa]brica|proveedor)\b/i,
    /\b(dejame|deja que)\s+(ver|chequear|consultar|averiguar|preguntar|fijarme|confirmar)\b/i,
    /\b(me fijo|nos fijamos|lo veo|lo miro)\s+y\s+(te|le)\s+(digo|aviso|paso|confirmo|respondo)\b/i,
    /\b(un|mi|el)\s+(compa[ñn]er[oa]|encargado|due[ñn]o|t[eé]cnico|vendedor)\s+(te|se)\s+(responde|contesta|escribe|comunica|contacta)\b/i,
    /\b(el|nuestro)\s+equipo\s+(te|se)\s+(responde|contesta|escribe|comunica|contacta|va a)\b/i,
    /\b(paso|derivo|traslado|elevo)\s+(la|tu)\s+(consulta|pregunta|duda)\b/i,
    /\b(en\s+)?(un rato|unos minutos|un momento|breve|la brevedad)\s+(te|le)\s+(digo|aviso|paso|confirmo|respondo|contesto)\b/i,
    /\b(ya\s+)?(te|le)\s+(estar[íi]a|voy a)\s+(confirmando|avisando|respondiendo|consultando)\b/i,
]

/**
 * Saca del mensaje las oraciones donde el bot anuncia la derivación o promete
 * averiguar. Devuelve el texto sin esas oraciones (puede quedar vacío: ahí el
 * turno se resuelve en silencio, que es la salida correcta).
 */
export function quitarDerivacionAnunciada(texto: string | null | undefined): string {
    const t = (texto || "").trim()
    if (!t) return ""

    const lineas = t.split(/\n/)
    const salida: string[] = []
    for (const linea of lineas) {
        const oraciones = linea.split(/(?<=[.!?])\s+/)
        const conservadas = oraciones.filter((o) => !FRASES_DERIVACION_ANUNCIADA.some((rx) => rx.test(o)))
        salida.push(conservadas.join(" ").trim())
    }

    return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * ¿El texto AFIRMA (o niega) que un kit le va a una moto?
 *
 * Backstop del escalado parcial: si lo que se derivó al equipo era justamente
 * la compatibilidad (bandeja técnica), el bot no puede seguir hablando y de
 * paso dictaminar que "le va bien". Ante esto el turno vuelve al silencio
 * total, que es la salida vieja y segura.
 */
export function afirmaCompatibilidad(texto: string | null | undefined): boolean {
    const t = (texto || "").trim()
    if (!t) return false
    const rx = [
        /\b(es|son|ser[íi]a|resulta)\s+(totalmente\s+|100%\s+|perfectamente\s+)?(compatible|incompatible)\b/i,
        /\bno\s+(es|son|ser[íi]a)\s+compatible\b/i,
        // El complemento es obligatorio a proposito: sin el, "te va a llegar
        // en 4 dias" contaba como afirmacion de compatibilidad.
        /\b(le|te)\s+(va|entra|calza|sirve|anda|ir[ía]a)\s+(bien|perfecto|directo|de una|joya|b[áa]rbaro|igual|sin problema|sin drama)\b/i,
        /\b(le|te)\s+(va|entra|calza|sirve|anda)\s*[.!]*$/i,
        /\b(le|te)\s+(queda|va a ir|va a entrar|va a andar)\b/i,
        /\bsin\s+(hacer\s+)?(ninguna\s+)?modificaci[oó]n(es)?\b/i,
        /\bsin\s+modificar\s+nada\b/i,
        /\b(anda|funciona)\s+(directo|perfecto)\b/i,
    ]
    return rx.some((r) => r.test(t))
}

export function sanitizarMensajeSalida(
    texto: string | null | undefined,
    opciones: OpcionesSanitizacion = {}
): ResultadoSanitizacion {
    if (!texto || !texto.trim()) {
        return { textoLimpio: "", modificado: false, alertasIA: false }
    }

    let limpio = texto.trim()
    let modificado = false
    let alertasIA = false

    // Los enlaces se normalizan (markdown -> texto plano, que es lo único que
    // WhatsApp muestra) y se enmascaran: el resto de este sanitizador trabaja
    // sobre prosa y le partiría el path a la URL. Se restauran al final, tal
    // cual vinieron de la base.
    const conEnlacesPlanos = normalizarEnlaces(limpio)
    if (conEnlacesPlanos !== limpio) {
        limpio = conEnlacesPlanos
        modificado = true
    }
    const { texto: enmascarado, urls } = enmascararUrls(limpio)
    limpio = enmascarado

    // 0. Si la conversación ya está en curso (turno 2 en adelante o globos secundarios),
    // remover cualquier saludo inicial residual que el modelo o la plantilla hayan arrastrado
    if (opciones.esConversacionEnCurso) {
        // Incluye los saludos SUELTOS, sin "hola" adelante: las plantillas del
        // catálogo abren con "Como va!" / "Que tal!" y a mitad de charla eso
        // llega igual de robótico que un "Hola!" repetido (conv 3561, ficha del
        // Kit 200 entregada en el turno 8).
        const rxSaludoInicial =
            /^(hola(\s+(bro|amigo|amiga|como va|como andas|buenas|buen dia|buenas tardes|buenas noches))?|buenas(\s+(tardes|dias|noches|bro|amigo))?|buen dia|buenas tardes|buenas noches|c[oó]mo (va|andas|andan|te va)|que tal|qu[eé] hac[eé]s)(\s+(bro|amigo|amiga))?[!.,?\s]*/i
        if (rxSaludoInicial.test(limpio)) {
            limpio = limpio.replace(rxSaludoInicial, "").trim()
            if (limpio.length > 0) {
                limpio = limpio.charAt(0).toUpperCase() + limpio.slice(1)
            }
            modificado = true
        }
    }

    // 0.b Normalizar el signo de peso: "$ 175.000" / "$ 175.000" -> "$175.000" (estilo es-AR de la casa)
    if (/\$[\s ]+\d/.test(limpio)) {
        limpio = limpio.replace(/\$[\s ]+(?=\d)/g, "$")
        modificado = true
    }

    // 1. Quitar signos de apertura obligatoriamente (¿ y ¡)
    if (/[¿¡]/.test(limpio)) {
        limpio = limpio.replace(/[¿¡]/g, "")
        modificado = true
    }

    // 2. Control contra frases que delatan IA
    for (const regex of FRASES_PROHIBIDAS_IA) {
        regex.lastIndex = 0 // los regex son constantes de modulo con flag /g: reset obligatorio
        if (regex.test(limpio)) {
            alertasIA = true
            limpio = limpio.replace(regex, "")
            modificado = true
        }
    }

    // 2.b Control contra frases de espera o proceso interno (silencio cara al cliente)
    for (const regex of FRASES_PROCESO_INTERNO) {
        regex.lastIndex = 0
        if (regex.test(limpio)) {
            // Si el mensaje es solo una frase de espera ("un momento voy a consultar..."), se anula completamente
            return {
                textoLimpio: "",
                modificado: true,
                alertasIA: false
            }
        }
    }

    // 2.c Reemplazo de fórmulas pesadas de call center por cierres naturales de mostrador
    for (const [regex, reemplazo] of FRASES_CALL_CENTER) {
        regex.lastIndex = 0
        const nuevo = limpio.replace(regex, reemplazo).trim()
        if (nuevo !== limpio) {
            limpio = nuevo
            modificado = true
        }
    }

    // 2.d Corrección determinista de voseo argentino (ej: Recuerda -> Recordá, Dime -> Decime)
    for (const [regex, reemplazo] of CORRECCIONES_VOSEO_ARGENTINO) {
        regex.lastIndex = 0
        const nuevo = limpio.replace(regex, (match) => {
            const esMayus = match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
            return esMayus ? reemplazo.charAt(0).toUpperCase() + reemplazo.slice(1) : reemplazo
        })
        if (nuevo !== limpio) {
            limpio = nuevo
            modificado = true
        }
    }

    // 2.e Recorte de preámbulos de sinceridad ("te soy sincero: ese combo no le
    // entra..."). Se saca la muletilla y la oración queda entera; si quedó
    // arrancando en minúscula por el recorte, se recapitaliza.
    // Se trabaja oración por oración a propósito: recapitalizar el texto entero
    // rompería las listas de precios ("👉🏼 largo: $189.000").
    {
        const conRecorte = limpio
            .split(/\n/)
            .map((linea) =>
                linea
                    .split(/(?<=[.!?])\s+/)
                    .map((oracion) => {
                        let o = oracion
                        for (const regex of MULETILLAS_SINCERIDAD) {
                            regex.lastIndex = 0
                            o = o.replace(regex, "")
                        }
                        o = o.trim()
                        if (o === oracion.trim()) return oracion
                        return o ? o.charAt(0).toUpperCase() + o.slice(1) : ""
                    })
                    .filter((o) => o.length > 0)
                    .join(" ")
            )
            .join("\n")
        if (conRecorte !== limpio) {
            limpio = conRecorte
            modificado = true
        }
    }

    // 3. Reemplazo o eliminación de modismos no deseados fijos
    for (const [regex, reemplazo] of REEMPLAZOS_MODISMOS) {
        regex.lastIndex = 0
        if (regex.test(limpio)) {
            limpio = limpio.replace(regex, reemplazo)
            modificado = true
        }
    }

    // 4. Si el usuario configuró permitirBro === false, eliminar 'bro'
    if (opciones.permitirBro === false) {
        if (/\bbro\b/gi.test(limpio)) {
            limpio = limpio.replace(/\bbro\b/gi, "amigo")
            modificado = true
        }
    }

    // 5. Palabras prohibidas dinámicas configuradas por el usuario desde el admin
    if (opciones.palabrasProhibidas && opciones.palabrasProhibidas.length > 0) {
        for (const palabra of opciones.palabrasProhibidas) {
            const pLimpia = palabra.trim()
            if (!pLimpia) continue
            // Escapar caracteres especiales de regex
            const escapada = pLimpia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            const rx = new RegExp(`\\b${escapada}\\b`, "gi")
            if (rx.test(limpio)) {
                limpio = limpio.replace(rx, "")
                modificado = true
            }
        }
    }

    // 6. Limpieza de espacios horizontales dobles, puntos duplicados o puntuación huérfana tras los reemplazos
    // PRESERVANDO saltos de línea y párrafos para formato de WhatsApp
    limpio = limpio
        .replace(/\.{2,}/g, ".")
        .replace(/\?{2,}/g, "?")
        .replace(/!{2,}/g, "!")
        .replace(/[^\S\r\n]+/g, " ") // colapsa solo espacios horizontales repetidos (espacio/tab), NO saltos de línea
        .replace(/[^\S\r\n]*\n[^\S\r\n]*/g, "\n") // elimina espacios sobrantes alrededor de un salto de línea
        .replace(/\n{3,}/g, "\n\n") // máximo 2 saltos de línea consecutivos (párrafo limpio)
        .replace(/[^\S\r\n]+([.,?!])/g, "$1") // quita espacio antes de signo de puntuación en la misma línea
        .replace(/^[.,\s]+/, "")
        .trim()

    limpio = restaurarUrls(limpio, urls)

    return {
        textoLimpio: limpio,
        modificado,
        alertasIA
    }
}
