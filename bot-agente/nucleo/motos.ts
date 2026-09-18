/**
 * Resolucion de la moto del cliente CON NIVEL DE CONFIANZA.
 * -----------------------------------------------------------------------------
 * El problema que resuelve (Opcion 3, charla del 07/09 con Martin):
 *   `consultar_compatibilidad` devolvia un booleano desnudo. Matcheaba una fila
 *   floja ("blitz" a secas) contra un cliente que fue mas especifico ("blitz
 *   150") y lo cantaba como CERTEZA. La herramienta mentia una confianza que no
 *   tenia.
 *
 * La idea: la herramienta primero resuelve QUE moto es, y sabe si esa
 * resolucion es firme o no. No es una regla por atributo (cilindrada, año,
 * color...) — es UN concepto: "el registro tiene que ser al menos tan
 * especifico como lo que dijo el cliente, y no contradecirlo".
 *
 *   exacta      -> el texto del cliente es un modelo/alias tal cual.
 *   aproximada  -> matchea una sola familia y no hay contradiccion (typo, o el
 *                  cliente fue mas vago que el catalogo).
 *   ambigua     -> el cliente dio un dato distintivo (una cilindrada) que NO
 *                  cierra con ningun modelo conocido, O la familia tiene varios
 *                  modelos y no dijo cual. Se devuelven los candidatos para que
 *                  la IA pregunte con contexto, en vez de adivinar o escalar.
 *   ninguna     -> no se reconocio nada -> escalado.
 */

import { prisma } from "@/lib/prisma"
import { normalizarTexto, distanciaOSA } from "./texto"
import { vocabularioDelNegocio } from "./rubros"

export interface MotoCanonica {
    id: number
    nombre_completo: string
    cilindrada: number | null
    aliases: string[]
}

export type ConfianzaMoto = "exacta" | "aproximada" | "ambigua" | "ninguna"

export interface ResolucionMoto {
    confianza: ConfianzaMoto
    /** Modelo resuelto (solo en exacta / aproximada). */
    modelo?: MotoCanonica
    /** Modelos posibles de la familia (solo en ambigua). */
    candidatos: MotoCanonica[]
    /** Cilindrada que dijo el cliente y no cierra con ningun modelo conocido. */
    cilindradaCliente?: number
    /** Motivo legible de la ambiguedad. */
    detalle?: string
}

/**
 * Numeros que parecen una cilindrada (50-2000).
 *
 * El tope de 2000 es el que deja afuera los AÑOS: "wave s 2022" nombra un
 * modelo, no una cilindrada de 2022cc. Lo usa tambien `compatibilidad.ts` para
 * descartar filas que hablan de otra cilindrada; si se toca el rango, se toca
 * para los dos.
 */
export function cilindradasEn(texto: string): number[] {
    const nums = (normalizarTexto(texto).match(/\b\d{2,4}\b/g) || []).map(Number)
    return nums.filter((n) => n >= 50 && n <= 2000)
}

/**
 * Marcas de fabrica. Nombran una fabrica, no un modelo: por si solas nunca
 * definen familia ni confirman nada. `compatibilidad.ts` tenia su propia copia
 * de esta lista y se desincronizaron (le faltaban "bajaj" y "suzuki"), asi que
 * de aca sale la unica.
 */
export const MARCAS_MOTO = new Set([
    "honda", "yamaha", "motomel", "zanella", "gilera", "corven", "keller",
    "brava", "mondial", "guerrero", "bajaj", "suzuki",
])

/** Palabras "de identidad" del modelo: no numeros, no marcas, 3+ letras. */
const MARCAS = new Set([...MARCAS_MOTO, "moto", "para", "una", "mi"])

/**
 * Relleno de la frase: no nombra ni marca ni modelo. Si sacando marcas y
 * relleno no queda NADA, el cliente dijo solo la marca.
 *
 * La lista es corta a proposito: lo que no este aca cuenta como palabra de
 * contenido y el caso NO se toma como "marca sola" — o sea que el error por
 * omision cae del lado de escalar, que es el comportamiento de siempre.
 */
const RELLENO = new Set([
    "para", "una", "un", "uno", "mi", "mis", "la", "el", "los", "las",
    "de", "del", "con", "que", "es", "tengo", "ando", "tiene", "seria",
    "sobre", "en", "por", "moto", "motito", "marca", "modelo", "chino",
    "china", "chinita", "cc", "cilindrada", "yo", "ser",
])

/**
 * ¿El cliente dijo SOLO la marca, sin modelo ni cilindrada? ("para una Gilera")
 *
 * No es lo mismo que "no se que moto es" (conv 3947, 11/09): ahi falta UN dato y
 * preguntarlo lo consigue, igual que en el caso "parcial". El bot escalaba en
 * silencio y un compañero tenia que escribir "cual gilera bro?" — justo la
 * pregunta que el bot podia hacer solo, y encima despues de haber sido EL quien
 * pregunto "para que moto estas buscando?".
 *
 * Si el cliente dio cilindrada ("gilera 110") o nombro algo que no es la marca
 * ("gilera altino"), esto devuelve null: ahi ya dio el dato y repreguntarselo
 * seria pedirle algo que ya dijo — ese caso sigue su camino de siempre
 * (compatibilidad por fila generica, o escalado si no consta).
 */
export function marcaSinModelo(texto: string): string | null {
    const norm = normalizarTexto(texto || "")
    if (!norm) return null
    if (cilindradasEn(norm).length > 0) return null

    const tokens = norm.split(" ").filter(Boolean)
    const marca = tokens.find((t) => MARCAS_MOTO.has(t))
    if (!marca) return null

    const contenido = tokens.filter((t) => !MARCAS_MOTO.has(t) && !RELLENO.has(t) && isNaN(Number(t)))
    if (contenido.length > 0) return null

    return marca
}

/**
 * ¿El cliente dijo MARCA + CILINDRADA pero no el modelo? ("Tengo una Zanella 150")
 *
 * El hueco que dejó la conv 4525 (18/09): "Zanella 150" no era nada para el
 * sistema. No resuelve a un modelo (tenemos la ZB 110 y la RX 150, y una
 * Zanella 150 puede ser cualquiera de las que no tenemos), no es `marcaSinModelo`
 * —dio la cilindrada— ni `cilindradaSinMarca` —dio la marca— ni
 * `motoDesconocidaMencionada`, que corta porque "zanella" es marca y no queda
 * ninguna palabra propia que tomar como nombre. Resultado: la charla entera
 * corrió como si no hubiera moto en juego, el 150 se leyó como ruido y los
 * backstops que miran la moto quedaron ciegos.
 *
 * Es el mismo caso que `marcaSinModelo`, un escalón más arriba: falta UN dato
 * —cuál de las de esa marca y cilindrada— y preguntarlo lo consigue. Es
 * literalmente lo que escribió Martín a mano en esa conversación ("cual zanella
 * 150 es bro?").
 *
 * NO es el caso del 11/09 (conv 3958, "rx 125"): ahí el cliente ya había dicho
 * modelo Y cilindrada, no faltaba nada que preguntar y se escala. Por eso acá
 * se exige que NO haya ninguna palabra de contenido: apenas nombra el modelo,
 * esto devuelve null y el caso sigue su camino de siempre.
 */
export function marcaConCilindradaSinModelo(
    texto: string,
    opciones: { exigirMarcador?: boolean } = {}
): string | null {
    // El cliente la dice en SU mensaje de la rafaga ("...kit 170?" / "Hola" /
    // "Tengo una Zanella 150" / "se puede poner un cilindro de 200"), y mirado
    // todo junto el texto tiene diez palabras de contenido. Por eso cada
    // renglon y cada oracion se miran por separado: el dato esta en uno solo.
    const partes = (texto || "")
        .split(/[\n.;!?]+/)
        .map((p) => p.trim())
        .filter(Boolean)
    if (partes.length > 1) {
        for (const parte of partes) {
            const hallado = marcaConCilindradaSinModelo(parte, opciones)
            if (hallado) return hallado
        }
        return null
    }

    const norm = normalizarTexto(texto || "")
    if (!norm) return null

    const cilindradas = cilindradasEn(norm)
    if (cilindradas.length !== 1) return null

    const tokens = norm.split(" ").filter(Boolean)
    const marca = tokens.find((t) => MARCAS_MOTO.has(t))
    if (!marca) return null

    // Sobre el MENSAJE crudo hace falta un marcador explícito, igual que en
    // `cilindradaSinMarca` y por el mismo motivo: "para una honda, el kit 120?"
    // tiene marca y número, pero el número es del kit — sin esto quedaría
    // registrada una "honda 120" que el cliente nunca dijo, y a partir de ahí
    // todo lo que hable el bot cae bajo el guardrail de una moto inventada.
    // Sobre `modelo_moto` (lo que la herramienta ya recibió COMO la moto) no se
    // exige: ahí el dato ya viene decidido.
    if (opciones.exigirMarcador) {
        const diceQueEsSuya = tokens.some((t) => ES_SU_MOTO.has(t))
        const terminacion = tokens.some((t) => TERMINACIONES_MOTO.has(t))
        if (!diceQueEsSuya && !terminacion) return null
    }

    // Igual que en `marcaSinModelo`: cualquier palabra que no sea marca,
    // relleno o número significa que dijo algo más ("zanella rx 150"), y ahí ya
    // dio el dato. Las terminaciones tampoco cuentan como modelo ("zanella 150
    // full" sigue sin decir cuál es).
    const contenido = tokens.filter(
        (t) =>
            !MARCAS_MOTO.has(t) &&
            !RELLENO.has(t) &&
            !TERMINACIONES_MOTO.has(t) &&
            isNaN(Number(t)) &&
            !/^\d+cc$/.test(t)
    )
    if (contenido.length > 0) return null

    return `${marca} ${cilindradas[0]}`
}

/**
 * Terminaciones con las que se vende una moto. No identifican el modelo (las
 * usan todas las marcas), pero decir una es señal de que se está hablando de
 * una moto y no de un kit.
 */
const TERMINACIONES_MOTO = new Set([
    "dlx", "deluxe", "full", "base", "tuning", "std", "standard", "estandar",
    "sport", "special", "especial", "classic", "clasica",
])

/** Palabras con las que el cliente dice que la moto es SUYA ("tengo una 110"). */
const ES_SU_MOTO = new Set(["moto", "motito", "tengo", "ando", "mi", "mis"])

/**
 * ¿El cliente dijo la CILINDRADA pero no la marca? ("Una 110 DLX")
 *
 * El espejo de `marcaSinModelo`, y el caso que dejó pasar la conv 4206: "110
 * DLX" no resuelve a ningún modelo —DLX es una terminación que usan todas las
 * marcas, y hay 12 motos de 110 cargadas— así que `resolverMoto` devolvía
 * `ninguna` y el motor no se enteraba de que había una moto en juego: no la
 * guardaba, el aviso del catálogo no viajaba y el backstop no miraba.
 *
 * (`consultar_compatibilidad` sí la contesta, por la fila genérica de
 * cilindrada. Lo que faltaba era registrarla, no responderla.)
 *
 * El disparo exige un MARCADOR explícito —una terminación, o que diga que la
 * moto es suya— y no solo el número. Sin eso, "el 120" y "cuánto sale el 200?"
 * entrarían como la moto del cliente cuando está hablando del kit, y a partir
 * de ahí todo lo que diga el bot quedaría bajo el guardrail de la moto
 * equivocada. Es la asimetría a propósito: se pierde "una 110" pelada.
 */
export function cilindradaSinMarca(texto: string): string | null {
    const norm = normalizarTexto(texto || "")
    if (!norm) return null

    const cilindradas = cilindradasEn(norm)
    if (cilindradas.length !== 1) return null

    const tokens = norm.split(" ").filter(Boolean)
    if (tokens.some((t) => MARCAS_MOTO.has(t))) return null

    // Cualquier palabra que no sea relleno, número o terminación significa que
    // está hablando de otra cosa ("el kit 120", "120 recorrido corto").
    const contenido = tokens.filter(
        (t) => !RELLENO.has(t) && !TERMINACIONES_MOTO.has(t) && isNaN(Number(t)) && !/^\d+cc$/.test(t)
    )
    if (contenido.length > 0) return null

    const terminaciones = tokens.filter((t) => TERMINACIONES_MOTO.has(t))
    const diceQueEsSuya = tokens.some((t) => ES_SU_MOTO.has(t))
    if (terminaciones.length === 0 && !diceQueEsSuya) return null

    return [String(cilindradas[0]), ...terminaciones.map((t) => t.toUpperCase())].join(" ")
}

/**
 * Frases con las que el cliente ENMARCA una moto. No la nombran: la presentan.
 * Alcanzan para leer "es compatible con la twister 125?" como una pregunta
 * sobre una moto, aunque no tengamos idea de qué es una Twister.
 */
const MARCOS_MOTO_FUERTES = [
    "compatible con", "compatible para", "compatible en", "compatibles con",
    "le va a", "le va al", "le va en", "le va la", "le va el",
    "le entra a", "le entra al", "le entra en", "le sirve a", "le sirve al",
    "sirve para", "sirve en", "sirve la", "sirve el", "anda en", "anda la",
    "entra en", "entra a", "va en", "va para", "va a la", "va al",
    "tengo una", "tengo un", "tengo la", "tengo el", "ando en", "ando una",
    "mi moto es", "moto es una", "para mi moto", "es para una", "es para la",
]

/**
 * Marcos DÉBILES: introducen cualquier cosa, no solo una moto ("envíos para el
 * interior"). Solo cuentan si además aparece una cilindrada, que es lo que
 * convierte "para el ___" en una moto ("para el cb 190").
 */
const MARCOS_MOTO_DEBILES = ["para", "en", "a", "con", "de"]

/** Determinantes: "la twister" es una moto, "potenciar" no. */
const DETERMINANTES = new Set(["la", "el", "una", "un", "mi", "mis", "los", "las", "unas", "unos"])

/**
 * Sustantivos de la charla que NUNCA son el nombre de una moto. Sin esto,
 * "tengo un problema con el envío" entraba como moto desconocida: el marco
 * ("tengo un") y el determinante están, y "problema" no es vocabulario del
 * catálogo. Es la lista de lo que un cliente dice tener y no es una moto.
 */
const NO_SON_MOTO = new Set([
    "problema", "problemas", "consulta", "consultas", "duda", "dudas", "pregunta",
    "preguntas", "envio", "envios", "pedido", "pedidos", "presupuesto", "precio",
    "precios", "descuento", "tema", "favor", "amigo", "amiga", "tiempo", "plata",
    "garantia", "factura", "stock", "negocio", "local", "cuenta", "numero",
    "mensaje", "foto", "fotos", "video", "apuro", "urgencia", "idea", "comercio",
    "taller", "cliente", "compra", "venta", "reclamo", "problemita",
])

/** Deícticos: "compatible con eso" no nombra ninguna moto. */
const DEICTICOS = new Set(["eso", "esto", "esa", "ese", "esta", "este", "esos", "esas", "ella", "el", "lo", "ahi", "aca", "alla"])

/** Corta la frase en fragmentos: cada uno se mira por separado. */
function fragmentos(textoNorm: string): string[] {
    return textoNorm
        .split(/\s+(?:y|pero|o|ademas|tambien)\s+/)
        .map((f) => f.trim())
        .filter(Boolean)
}

/**
 * La moto que el cliente nombró y NO tenemos cargada.
 * -----------------------------------------------------------------------------
 * Conv 4388 (16/09): *"precio de la leva para el cb1 / es compatible con la
 * twister 125?"*. Ni "cb1" ni "twister" existen en `motos_modelos`, así que
 * `resolverMoto` devolvía `ninguna`, `cilindradaSinMarca` tampoco disparaba (la
 * frase trae palabras de producto) y el turno arrancó **sin saber que había una
 * moto en juego**: el aviso del catálogo no viajó, el backstop no miró y el bot
 * contestó el menú de los tres combos que pegan con "leva". La pregunta de
 * compatibilidad —que era el mensaje entero— nunca se contestó ni se derivó.
 *
 * Es el hueco simétrico de [[fix-bot-marca-sola-se-repregunta]] y de
 * `cilindradaSinMarca`: hasta acá, una moto que no resuelve era indistinguible
 * de "no hay moto". Y no es lo mismo: cuando la moto no nos consta, lo único
 * correcto es derivar al equipo y guardar silencio sobre ese punto — que es lo
 * que hace `consultar_compatibilidad` cuando SÍ lo llaman.
 *
 * El criterio no mira el catálogo de motos (si estuviera ahí, ya habría
 * resuelto): mira la FORMA de la frase. Un marco de moto, un determinante o una
 * cilindrada, y palabras que no son ni producto nuestro ni marca conocida.
 * Por eso:
 *   - "es compatible con la twister 125"  -> moto desconocida ("twister 125")
 *   - "sirve para la leva corta?"         -> NO ("leva" es vocabulario nuestro)
 *   - "hacen envíos para el interior?"    -> NO (marco débil y sin cilindrada)
 *   - "le va a mi smash?"                 -> NO (resuelve: no es este caso)
 *   - "es compatible con la gilera?"      -> NO (es marca: ver `marcaSinModelo`)
 * El error por omisión cae del lado de no detectar nada, que es el
 * comportamiento de siempre.
 */
export async function motoDesconocidaMencionada(texto: string): Promise<string | null> {
    const norm = normalizarTexto(texto || "")
    if (!norm) return null

    // Si resuelve a algo conocido —o si es "marca sola" / "cilindrada sola"—
    // este no es el caso: esos ya tienen su camino.
    if (marcaSinModelo(norm) || cilindradaSinMarca(norm)) return null
    const resol = await resolverMoto(norm).catch(() => null)
    if (!resol || resol.confianza !== "ninguna") return null

    const vocabulario = await vocabularioDelNegocio()
    if (!vocabulario) return null // sin vocabulario no se decide nada

    for (const frag of fragmentos(norm)) {
        const tokens = frag.split(" ").filter(Boolean)

        for (const marco of [...MARCOS_MOTO_FUERTES, ...MARCOS_MOTO_DEBILES]) {
            const fuerte = MARCOS_MOTO_FUERTES.includes(marco)
            const idx = tokens.indexOf(marco.split(" ")[0])
            const largoMarco = marco.split(" ").length
            if (idx < 0 || tokens.slice(idx, idx + largoMarco).join(" ") !== marco) continue

            let cola = tokens.slice(idx + largoMarco)
            let hayDeterminante = DETERMINANTES.has(marco.split(" ").slice(-1)[0])
            while (cola.length > 0 && (RELLENO.has(cola[0]) || DETERMINANTES.has(cola[0]))) {
                if (DETERMINANTES.has(cola[0])) hayDeterminante = true
                cola = cola.slice(1)
            }
            if (cola.length === 0) continue

            // El NOMBRE de la moto es la tirada de palabras que arranca justo
            // ahí y que no es de nadie: ni relleno, ni vocabulario nuestro, ni
            // marca. Se corta en la primera palabra que sí lo es. Sin este
            // corte el nombre se comía el resto de la frase ("zr ches sacar
            // 150") y, peor, una cilindrada que aparecía tres palabras después
            // alcanzaba para dar el caso por moto ("para armar en 220 tenés
            // algo, el 170" -> no es una moto, es un kit).
            const nombreTokens: string[] = []
            for (const t of cola) {
                const numero = Number(t)
                const esCilindrada = !isNaN(numero) && numero >= 50 && numero <= 2000
                const esPropia =
                    t.length >= 2 &&
                    isNaN(numero) &&
                    !RELLENO.has(t) &&
                    !DEICTICOS.has(t) &&
                    !NO_SON_MOTO.has(t) &&
                    !MARCAS_MOTO.has(t) &&
                    !vocabulario.has(t) &&
                    !/^\d+cc$/.test(t)
                if (!esCilindrada && !esPropia) break
                nombreTokens.push(t)
                if (nombreTokens.length >= 4) break
            }
            if (nombreTokens.length === 0) continue

            const cilindrada = cilindradasEn(nombreTokens.join(" "))[0]
            const palabras = nombreTokens.filter((t) => isNaN(Number(t)))
            // Sin una palabra propia no hay moto que nombrar; con más de tres,
            // lo que sigue al marco es una frase, no el nombre de una moto.
            if (palabras.length === 0 || palabras.length > 3) continue
            // Marco débil: "para el ___" introduce cualquier cosa. Solo cuenta
            // si el cliente lo presentó como algo suyo Y le puso cilindrada.
            if (!fuerte && !(hayDeterminante && cilindrada)) continue
            // Marco fuerte: alcanza con una de las dos señales.
            if (!hayDeterminante && !cilindrada) continue // "sirve para potenciar"

            const nombre = nombreTokens.join(" ")
            return nombre.trim() || null
        }
    }

    return null
}

/**
 * Guía para el turno en el que el cliente nombró una moto que no nos consta.
 * No hay nada que preguntarle —el dato ya lo dio, somos nosotros los que no lo
 * tenemos— así que no se repregunta: se deriva y se calla ESE punto.
 */
export function guiaMotoDesconocida(moto: string): string {
    return [
        `⚠️ EL CLIENTE NOMBRÓ UNA MOTO QUE NO NOS CONSTA: "${moto}". No está en la tabla de compatibilidades: NINGUNA herramienta puede decir si le entra algo.`,
        `Ejecutá escalar_a_humano con motivo 'moto_no_registrada' y guardá SILENCIO sobre todo lo que dependa de esa moto: precio, compatibilidad, qué le conviene, qué tenemos para ella.`,
        `⛔ PROHIBIDO contestarle con el menú de kits, con una ficha o con una pregunta para que elija: eso es responderle otra cosa. PROHIBIDO repreguntarle la moto: ya te la dijo.`,
        `Si en la misma ráfaga preguntó algo que NO depende de la moto (envíos, horarios, formas de pago, dónde estamos), eso sí contestalo.`,
    ].join("\n")
}

/**
 * Cuantas veces se le puede repreguntar la moto a un cliente antes de derivar.
 * Dos: la primera es la pregunta legitima, la segunda una reformulacion. A la
 * tercera el cliente ya contesto dos veces sin precisar y seguir preguntando es
 * hacerlo sentir en un interrogatorio — va al equipo.
 */
export const TOPE_REPREGUNTAS_MOTO = 2

function palabrasModelo(texto: string): string[] {
    return normalizarTexto(texto)
        .split(" ")
        .filter((w) => w.length >= 3 && isNaN(Number(w)) && !MARCAS.has(w))
}

let cacheModelos: { data: MotoCanonica[]; ts: number } | null = null
async function cargarModelos(): Promise<MotoCanonica[]> {
    if (cacheModelos && Date.now() - cacheModelos.ts < 60_000) return cacheModelos.data
    const filas = await prisma.$queryRaw<MotoCanonica[]>`
        SELECT id, nombre_completo, cilindrada, aliases FROM motos_modelos
    `.catch(() => [] as MotoCanonica[])
    cacheModelos = { data: filas, ts: Date.now() }
    return filas
}

/** Cilindradas conocidas de un modelo (la columna + cualquier numero en nombre/alias). */
function cilindradasDe(m: MotoCanonica): Set<number> {
    const set = new Set<number>()
    if (m.cilindrada && m.cilindrada >= 50) set.add(m.cilindrada)
    for (const n of cilindradasEn(`${m.nombre_completo} ${m.aliases.join(" ")}`)) set.add(n)
    return set
}

/** ¿El texto del cliente nombra a este modelo (por nombre completo o alias exacto)? */
function coincideExacto(textoNorm: string, m: MotoCanonica): boolean {
    if (normalizarTexto(m.nombre_completo) === textoNorm) return true
    return m.aliases.some((a) => normalizarTexto(a) === textoNorm)
}

/**
 * ¿Un alias de 3+ letras aparece contenido en el texto del cliente (o viceversa)?
 *
 * OJO con los alias que son "marca + cilindrada" ("brava 110", "mondial 110",
 * "keller 110"): al sacarles los numeros quedan reducidos a la MARCA sola, y
 * entonces cualquier moto de esa marca cae en la familia de ese modelo. Real
 * (conv 3730, 09/09): "brava altino 150 base" resolvia a la familia de la
 * "Brava Nevada 110" — una moto que no tiene nada que ver — y el bot le
 * repreguntaba al cliente citando ese modelo ajeno en vez de escalar.
 */
function coincideFamilia(textoNorm: string, m: MotoCanonica): boolean {
    const palabras = palabrasModelo(m.nombre_completo)

    // Alias COMPLETO (con sus números) presente como secuencia de palabras.
    //
    // La vía de abajo le saca los números al alias para reconocer la familia, y
    // eso deja afuera a los modelos con nombre corto o alfanumérico: la Motomel
    // S2 150 tiene "s2", "s2 150" y "s 2", que sin números quedan en una sola
    // letra y nunca llegan al mínimo de 3. Resultado real (conv 3694, 09/09):
    // `resolverMoto("s2 150")` daba EXACTA, pero la misma moto dentro de la frase
    // del cliente ("para mi s2 150 para hacerlo 190... Año 2025") daba NINGUNA, y
    // el bot le repreguntaba una moto que ya le había dicho.
    //
    // Se exige la secuencia completa y con bordes de palabra: "brava 110" no pega
    // con "brava altino 150" (el falso positivo de la conv 3730) ni "s 2" con
    // "wave s 2022".
    const conBordes = ` ${textoNorm} `
    for (const a of [m.nombre_completo, ...m.aliases]) {
        const aNorm = normalizarTexto(a)
        if (aNorm.length >= 2 && conBordes.includes(` ${aNorm} `)) return true
    }

    for (const a of m.aliases) {
        const aNorm = normalizarTexto(a)
        const soloLetras = aNorm.replace(/[0-9\s]/g, "")
        if (MARCAS.has(soloLetras)) continue // "brava 110" -> "brava": es la marca, no el modelo
        if (soloLetras.length >= 3 && (textoNorm.includes(soloLetras) || palabras.some((p) => p === soloLetras))) {
            // el alias sin numeros aparece en el texto -> misma familia
            if (textoNorm.split(" ").some((w) => w === soloLetras) || textoNorm.includes(` ${soloLetras}`) || textoNorm.startsWith(soloLetras)) {
                return true
            }
        }
    }
    return false
}

/**
 * Typo: una palabra del cliente (4+ letras) está a distancia OSA 1 de una
 * palabra del NOMBRE OFICIAL del modelo. Solo el nombre oficial, no los aliases
 * (los aliases ya traen typos a propósito: hacer fuzzy sobre "bliz" hacía que
 * "biz" (Honda Biz) resolviera a Motomel Blitz).
 *
 * El mínimo era 5 para no colisionar modelos cortos distintos, pero dejaba
 * afuera los nombres de 4 letras del catálogo — Wave, Skua, Trip — y "wawe"
 * (conv 3660, 08/09) caía como moto desconocida y escalaba en silencio.
 * En 4 letras un typo cambia demasiado la palabra, así que ahí se exige
 * ADEMÁS la misma inicial: "wawe"→"wave" pasa, "nave"/"llave" no.
 */
export function palabraUtilParaTypo(w: string): boolean {
    return w.length >= 4 && isNaN(Number(w)) && !MARCAS.has(w)
}

/**
 * Criterio ÚNICO de "esto es un typo de aquello". Vive acá para que
 * `compatibilidad.ts`, que tiene su propio resolvedor, no vuelva a divergir.
 */
export function esTypoDe(tokenCliente: string, palabraNombre: string): boolean {
    if (!palabraUtilParaTypo(tokenCliente) || !palabraUtilParaTypo(palabraNombre)) return false
    if (distanciaOSA(tokenCliente, palabraNombre) !== 1) return false // incluye swap de letras pegadas ("blizt"->"blitz")
    if (Math.min(tokenCliente.length, palabraNombre.length) >= 5) return true
    return tokenCliente[0] === palabraNombre[0]
}

function coincidePorTypo(textoNorm: string, m: MotoCanonica): boolean {
    const tokens = textoNorm.split(" ")
    const nombreWords = normalizarTexto(m.nombre_completo).split(" ")
    for (const tok of tokens) {
        for (const nw of nombreWords) {
            if (esTypoDe(tok, nw)) return true
        }
    }
    return false
}

/**
 * ¿El cliente y alguno de los candidatos comparten al menos una palabra de
 * MODELO (no la marca, no los numeros)? Si no comparten ninguna, el cliente
 * nombro una moto que sencillamente no tenemos: repreguntar "tenes la 110 o la
 * 125?" citando modelos ajenos es peor que escalar, porque le mete al cliente
 * datos de otra moto/kit. Ver conv 3730 (09/09).
 */
function comparteModeloCon(textoNorm: string, candidatos: MotoCanonica[]): boolean {
    const delCliente = palabrasModelo(textoNorm)
    if (delCliente.length === 0) return true // solo dijo marca+cc: la familia es lo unico que hay
    for (const m of candidatos) {
        const propias = [
            ...palabrasModelo(m.nombre_completo),
            ...m.aliases.flatMap((a) => palabrasModelo(a)),
        ]
        for (const w of delCliente) {
            if (propias.some((p) => p === w || esTypoDe(w, p))) return true
        }
    }
    return false
}

/**
 * Resuelve la moto del cliente con nivel de confianza. NO decide compatibilidad
 * — solo dice "que moto es y que tan seguro estoy".
 */
export async function resolverMoto(textoCliente: string): Promise<ResolucionMoto> {
    const textoNorm = normalizarTexto(textoCliente)
    if (!textoNorm) return { confianza: "ninguna", candidatos: [] }

    const modelos = await cargarModelos()
    if (modelos.length === 0) return { confianza: "ninguna", candidatos: [] }

    const ccCliente = cilindradasEn(textoCliente)

    // 1. Match exacto (nombre completo o alias tal cual)
    for (const m of modelos) {
        if (coincideExacto(textoNorm, m)) {
            return { confianza: "exacta", modelo: m, candidatos: [] }
        }
    }

    // 2. Familia: modelos cuyo nombre/alias (sin numeros) aparece en el texto
    const familia = modelos.filter((m) => coincideFamilia(textoNorm, m))

    if (familia.length > 0) {
        // 2.a El cliente dio una cilindrada -> tiene que cerrar con algun modelo de la familia
        if (ccCliente.length > 0) {
            const compatibles = familia.filter((m) => {
                const ccs = cilindradasDe(m)
                return ccCliente.some((c) => ccs.has(c))
            })
            if (compatibles.length === 1) {
                return { confianza: "aproximada", modelo: compatibles[0], candidatos: [] }
            }
            if (compatibles.length > 1) {
                return {
                    confianza: "ambigua",
                    candidatos: compatibles,
                    detalle: `Varios modelos de esa familia comparten la cilindrada ${ccCliente.join("/")}.`,
                }
            }
            // Ninguno de la familia tiene esa cilindrada: el cliente fue MAS
            // especifico que el catalogo, o se confundio.
            // Red de seguridad: si ademas nombro un modelo que no es ninguno de
            // los candidatos ("brava altino" vs "Brava Nevada"), no hay nada que
            // repreguntar — es una moto que no tenemos y va a humano.
            if (!comparteModeloCon(textoNorm, familia)) {
                return { confianza: "ninguna", candidatos: [] }
            }
            return {
                confianza: "ambigua",
                candidatos: familia,
                cilindradaCliente: ccCliente[0],
                detalle: `El cliente dijo ${ccCliente[0]}cc pero no me consta ese modelo con esa cilindrada.`,
            }
        }

        // 2.b Sin cilindrada: si hay una sola en la familia, alcanza
        if (familia.length === 1) {
            return { confianza: "aproximada", modelo: familia[0], candidatos: [] }
        }
        return {
            confianza: "ambigua",
            candidatos: familia,
            detalle: "El cliente nombro la familia pero no cual modelo.",
        }
    }

    // 3. Typo tolerante (Levenshtein) sobre una sola familia
    const porTypo = modelos.filter((m) => coincidePorTypo(textoNorm, m))
    if (porTypo.length === 1) {
        const m = porTypo[0]
        if (ccCliente.length === 0 || ccCliente.some((c) => cilindradasDe(m).has(c))) {
            return { confianza: "aproximada", modelo: m, candidatos: [] }
        }
        return {
            confianza: "ambigua",
            candidatos: porTypo,
            cilindradaCliente: ccCliente[0],
            detalle: `Puede ser ${m.nombre_completo} (typo), pero el cliente dijo ${ccCliente[0]}cc.`,
        }
    }

    return { confianza: "ninguna", candidatos: [] }
}

/** Texto corto para el `mensaje_para_agente`: lista de candidatos. */
export function listarCandidatos(cands: MotoCanonica[]): string {
    return cands.map((c) => c.nombre_completo).join(" / ")
}

/** Marca con mayúscula inicial, para que el texto al cliente no diga "gilera". */
export function marcaLegible(marca: string): string {
    return marca.charAt(0).toUpperCase() + marca.slice(1)
}

/**
 * Guia para la IA cuando el cliente dijo solo la marca. La pregunta es corta y
 * de mostrador ("cual Gilera tenes?"): sin recitar el catalogo interno (mismo
 * criterio que la repregunta por candidatos) y sin pedirle papeles.
 */
export function guiaMarcaSinModelo(marca: string): string {
    const Marca = marcaLegible(marca)
    return [
        `FALTA UN DATO, no escales: el cliente dijo la marca ("${Marca}") pero no el modelo ni la cilindrada.`,
        `Preguntale con naturalidad cual ${Marca} tiene (ej: "cual ${Marca} tenes?" o "que modelo de ${Marca} es?"). Una sola pregunta, corta.`,
        `NO le recites los modelos que tenemos cargados, NO le pidas la cedula, el manual ni ningun papel, y NO le preguntes nada que ya te haya dicho.`,
        `NO confirmes ni niegues compatibilidad todavia. Cuando te diga el modelo o la cilindrada, volve a consultar con ese dato.`,
    ].join("\n")
}

/**
 * La misma guia para el escalon de arriba: marca + cilindrada, sin modelo
 * ("Tengo una Zanella 150"). La pregunta lleva la cilindrada adentro porque el
 * cliente ya la dijo: preguntarle "cual Zanella tenes?" a secas se lee como que
 * no lo escuchamos. Ver `marcaConCilindradaSinModelo` (conv 4525).
 */
export function guiaMarcaConCilindradaSinModelo(motoDicha: string): string {
    const Moto = marcaLegible(motoDicha)
    return [
        `FALTA UN DATO, no escales: el cliente dijo la marca y la cilindrada ("${Moto}") pero no QUE MODELO es, y de esa marca y cilindrada hay varios.`,
        `Preguntale con naturalidad cual ${Moto} tiene (ej: "cual ${Moto} es?" o "que modelo de ${Moto} tenes?"). Una sola pregunta, corta.`,
        `NO le recites los modelos que tenemos cargados, NO le pidas la cedula, el manual ni ningun papel, y NO le vuelvas a preguntar la cilindrada: ya te la dijo.`,
        `NO confirmes ni niegues compatibilidad todavia, y NO le pases ninguna ficha, precio ni producto que dependa de esa moto. Cuando te diga el modelo, volve a consultar con ese dato.`,
    ].join("\n")
}

/**
 * La misma situacion pero ya agotado el tope de repreguntas: el cliente contesto
 * dos veces sin precisar. Insistir una tercera es un interrogatorio; va al equipo.
 */
export function guiaMarcaSinModeloAgotada(marca: string): string {
    return [
        `Ya le preguntaste ${TOPE_REPREGUNTAS_MOTO} veces cual ${marcaLegible(marca)} tiene y sigue sin precisar el modelo.`,
        `NO se lo vuelvas a preguntar. Ejecuta escalar_a_humano(motivo: 'moto_no_registrada') y guarda silencio sobre ese punto.`,
        `Si en el mismo mensaje pregunto otra cosa (precio, envio, demora), esa si contestala.`,
    ].join("\n")
}

/**
 * ¿Lo que se está buscando es la MOTO del cliente y nada más?
 *
 * Por qué existe (conv 4194, 14/09): el cliente preguntó "venden repuestos para
 * la moto rouser ns200" y el modelo buscó el catálogo con `termino_busqueda:
 * "Rouser NS200"`. El scorer del catálogo no sabe qué es una moto: le vio el
 * número 200, lo cruzó con el "kit dakar 200 economico" y devolvió
 * `encontrado: true`. Con eso el bot le contestó que sí vendíamos repuestos
 * para su moto —no vendemos NADA para la NS 200— y le adjuntó la foto de ese
 * kit. Nunca consultó compatibilidad ni escaló.
 *
 * La moto no se busca en el catálogo: se busca en `consultar_compatibilidad`,
 * que es la única tabla que sabe qué le entra a qué. Esta función es el guard
 * determinista que separa un caso del otro.
 *
 * Criterio: hay evidencia ALFABÉTICA de moto (un modelo resuelto o una marca de
 * fábrica) y, sacando las palabras de esa moto, no queda ninguna palabra de
 * producto. Por eso:
 *   - "rouser ns200", "para una gilera"        -> es moto (no hay producto)
 *   - "kit 120", "escape rouser", "tapa cdi"   -> NO (queda "kit"/"escape"/"tapa")
 *   - "120", "170 varillero"                   -> NO (números pelados: cilindrada
 *     de producto, que es justo como se busca el catálogo de siempre)
 * El error por omisión cae del lado de seguir buscando el catálogo, que es el
 * comportamiento de siempre.
 */
export async function terminoEsSoloMoto(texto: string): Promise<{ esMoto: boolean; moto?: string }> {
    const norm = normalizarTexto(texto || "")
    if (!norm) return { esMoto: false }

    const tokens = norm.split(" ").filter(Boolean)
    const alfabeticos = tokens.filter((t) => t.length >= 2 && isNaN(Number(t)) && !RELLENO.has(t))
    // Sin una sola palabra, lo único que hay son números: eso es una cilindrada
    // de kit ("120"), no una moto.
    if (alfabeticos.length === 0) return { esMoto: false }

    const resol = await resolverMoto(norm).catch(() => null)
    const modelos = resol?.modelo ? [resol.modelo] : resol?.candidatos || []
    const hayMarca = alfabeticos.some((t) => MARCAS_MOTO.has(t))
    if (modelos.length === 0 && !hayMarca) return { esMoto: false }

    // Palabras que pertenecen a la(s) moto(s) reconocida(s).
    const identidad = new Set<string>()
    for (const m of modelos) {
        for (const w of normalizarTexto(m.nombre_completo).split(" ")) if (w) identidad.add(w)
        for (const a of m.aliases) for (const w of normalizarTexto(a).split(" ")) if (w) identidad.add(w)
    }

    const restantes = alfabeticos.filter((t) => {
        if (MARCAS_MOTO.has(t) || identidad.has(t)) return false
        for (const p of identidad) if (esTypoDe(t, p)) return false
        return true
    })
    if (restantes.length > 0) return { esMoto: false }

    // Sin modelo resuelto (marca sola, o familia ambigua) se devuelve lo que
    // dijo el cliente pero sin el relleno de la frase: "para una gilera" viaja
    // como "gilera", no como "para una gilera".
    const sinRelleno = tokens.filter((t) => !RELLENO.has(t)).join(" ").trim()
    return { esMoto: true, moto: resol?.modelo?.nombre_completo || sinRelleno || texto.trim() }
}
