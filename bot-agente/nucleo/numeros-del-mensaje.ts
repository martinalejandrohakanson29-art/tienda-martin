/**
 * UN SOLO LECTOR DE NUMEROS — que rol cumple cada cilindrada del mensaje.
 * ---------------------------------------------------------------------------
 * Un numero suelto en WhatsApp puede ser tres cosas distintas, y cada una tenia
 * su detector mirando el mismo texto por su cuenta:
 *
 *   moto      la cilindrada que TIENE      "un econor con motor de 110"
 *   objetivo  a cuanto quiere LLEVARLA     "quiero hacerla 140"
 *   producto  la medida que PIDE           "tenes kid de cg 190?"
 *
 * Y un cuarto caso que son DOS numeros juntos, no uno: la conversion que pide
 * ("un kit de 70 a 110"). Ahi el de la izquierda es el motor del que parte —el
 * unico lugar donde ese numero significa algo— y el de la derecha es el
 * objetivo de siempre. Ver `ConversionLeida` y `nucleo/conversion-pedida.ts`.
 *
 * Como cada uno tokenizaba por su lado y corria en un punto distinto del motor,
 * quien se quedaba con un numero dependia de POR DONDE entraba la charla, no de
 * una regla escrita en ningun lado. En la conv 3338 ("potenciar mi 110 a 120")
 * el "110" —que es su moto— se leia como objetivo y mandaba al equipo justo al
 * cliente que queria lo que el kit hace.
 *
 * Medido sobre los turnos reales: el 57% de los mensajes traen una cilindrada y
 * ~1% son un objetivo. La señal es rara y el ruido es enorme, asi que la
 * precedencia se decide UNA vez, aca, y se mide con `pruebas/sweep-numeros.ts`.
 *
 * PRECEDENCIA (de mas fuerte a mas debil)
 * ---------------------------------------
 *   1. moto      es el unico rol respaldado por una TABLA (`motos_modelos`):
 *                si el numero es la cilindrada del modelo que nombro, no es
 *                ninguna otra cosa.
 *   2. objetivo  un verbo explicito ("hacerla", "llevarla a") es mas especifico
 *                que la mera cercania de una palabra.
 *   3. producto  una palabra de producto cerca ("kit 190") es lo mas debil:
 *                alcanza para pedir, no para desempatar.
 *   4. ruido     plata, kilometros, años, milimetros.
 *
 * La conversion se lee al final, sobre lo que quedo: pide que el numero de la
 * izquierda ya tenga rol `moto` o `producto` (o que un verbo ate la cadena),
 * porque sin ese ancla "de 100 a 500" es un envio y no un motor.
 *
 * Los tres detectores de `nucleo/` son consumidores de esto y conservan su
 * firma: el que agrega un caso nuevo lo agrega al banco y a la precedencia de
 * aca, no con un `if` suelto en el detector de turno.
 */

import { normalizarTexto } from "./texto"
import { cilindradasEn, marcaConCilindradaSinModelo, resolverMoto } from "./motos"

export type RolNumero = "moto" | "objetivo" | "producto" | "ruido"

export interface NumeroLeido {
    valor: number
    rol: RolNumero
    /** El pedazo del mensaje que le da el rol, para el resumen del escalado. */
    frase: string
    /** Posicion del token dentro del mensaje normalizado. */
    posicion: number
}

export interface LecturaNumeros {
    /** Todos los numeros del mensaje, en orden, ya con su rol. */
    numeros: NumeroLeido[]
    /** Cilindradas que el resolvedor le atribuye a SU moto. */
    deLaMoto: Set<number>
    /** A cuanto quiere llevar el motor, si lo dijo. */
    objetivo?: NumeroLeido
    /** La medida de otro producto que pide, si la pidio. */
    producto?: NumeroLeido
    /** "de 70 a 110": desde que motor quiere partir y a donde quiere llegar. */
    conversion?: ConversionLeida
}

/**
 * El cliente pide pasar de UN motor a OTRO ("un kit de 70 a 110").
 *
 * Es el unico lugar donde el numero de la IZQUIERDA importa: no es la medida
 * del kit que pide ni ruido, es el motor que tiene hoy. Sin esto el "70" se
 * leia como la medida de un producto y el "110" como ruido, y el turno
 * terminaba ofreciendo los kits que potencian una 110 (conv 4475, 17/09).
 */
export interface ConversionLeida {
    /** El motor del que parte ("de 70"). */
    base: number
    /** A donde quiere llegar ("a 110"). */
    objetivo: number
    /** El pedazo del mensaje que lo dice, para el resumen del escalado. */
    frase: string
}

/**
 * Verbos con los que se dice "llevarla a X". Se aceptan con el pronombre
 * pegado, que es como se escribe en WhatsApp ("hacerla", "pasarlo", "dejarla").
 */
const RX_VERBO_OBJETIVO =
    /^(hacer|haser|aser|llevar|pasar|subir|agrandar|ampliar|aumentar|potenciar|convertir|dejar|trucar|modificar)(la|lo|le|las|los|me|se|mela|melo|sela|selo)?$/

/** Las mismas, conjugadas en primera/tercera persona ("la paso a 140"). */
const RX_VERBO_CONJUGADO =
    /^(hago|hace|hacen|llevo|lleva|paso|pasa|subo|sube|agrando|agranda|potencio|potencia|dejo|deja|quede|quedaria|convierto)$/

/**
 * Verbos de POTENCIA: el cliente no dice que quiere hacerle, dice hasta donde
 * espera que llegue ("con ese kit levanta unos 130?"). Real, en el corpus: ese
 * 130 se leia como un producto que pedia y caia en la bandeja de Precio en vez
 * de la Tecnica.
 *
 * La lista es corta a proposito y se agranda solo con evidencia del corpus:
 * "llega" no entra ("llega a 150 km" es un envio), y "anda" tampoco —el sweep
 * lo delato en el acto: "Le anda a los 110" es una pregunta de compatibilidad
 * con SU moto, no un objetivo.
 */
const RX_VERBO_POTENCIA = /^(levanta|levantar|levantarla|levantarlo|alcanza|alcanzar)$/

/** Imperativo de voseo con el pronombre pegado: "hacela de 140", "pasalo a 150". */
const RX_VERBO_IMPERATIVO =
    /^(hac|has|llev|pas|sub|agrand|ampli|aument|potenci|dej|truc|modific)[ae](la|lo|le|las|los)$/

/**
 * Palabras que pueden ir ENTRE el verbo y el numero sin romper la idea
 * ("llevarla a 140", "dejarla en unos 140"). Cualquier otra palabra corta la
 * cadena: asi "hacer el envio a 140 km" o "lo dejo para el 15" no matchean.
 */
const PUENTE = new Set([
    "a", "al", "de", "del", "en", "hasta", "como", "unos", "unas", "un", "una",
    "el", "la", "los", "las", "mi", "su", "moto", "motor", "cilindrada", "cc",
])

/** Cuantas palabras puente se toleran entre el verbo y el numero. */
const VENTANA_PUENTE = 3

/**
 * Lo que une los dos numeros del "de 110 a 120": el de la izquierda es la moto
 * que tiene, el de la derecha es a donde quiere llegar.
 */
const SALTO_A_OTRO_NUMERO = new Set(["a", "hasta", "en"])

/**
 * Lo que convierte un numero en plata y no en un motor ("140 mil", "200 lucas").
 * Solo se mira para la BASE suelta del "tengo una 70 ... a 110": los demas roles
 * ya se ganan por otra cosa.
 */
const UNIDADES_DE_PLATA = new Set(["mil", "lucas", "luca", "pesos", "palos", "millones", "millon"])

/** Palabras con las que el cliente nombra lo que quiere comprar. */
const PALABRAS_PRODUCTO = new Set([
    "kit", "kits", "kid", "kids", "combo", "cilindro", "cilindros",
    "tapa", "leva", "levas", "piston", "pistones", "carburador", "corona"
])

/**
 * Cuantos tokens puede haber entre la palabra de producto y el numero. Con 3
 * entra "kid de cg 190" y queda afuera "el kit me sirve para hacerla 190?",
 * que ya se lleva el rol `objetivo` por el verbo.
 */
const VENTANA_PRODUCTO = 3

/** El token es una cilindrada ("120", "120cc"), o no. */
export function numeroDeCilindrada(token: string): number | null {
    const m = token.match(/^(\d{2,4})(cc)?$/)
    if (!m) return null
    const n = Number(m[1])
    return n >= 50 && n <= 2000 ? n : null
}

/** Cilindradas que el resolvedor le atribuye a la moto que nombro el cliente. */
async function cilindradasDeSuMoto(mensaje: string, conAliases: boolean, textoCrudo?: string): Promise<Set<number>> {
    const moto = await resolverMoto(mensaje).catch(() => null)
    const cc = new Set<number>()
    // Marca + cilindrada sin modelo ("tengo una zanella 150"): no resuelve a
    // ningun modelo, asi que `resolverMoto` no aporta nada y ese numero caia en
    // "ruido" aunque sea, textualmente, la cilindrada de su moto (conv 4525).
    // El marcador explicito lo exige la propia funcion: sin el, el numero del
    // kit ("para una honda, el 120?") entraria como la moto del cliente.
    // Sobre el texto CRUDO: la rafaga llega con un renglon por mensaje de
    // WhatsApp y el detector mira renglon por renglon; normalizado se pierden
    // los cortes y 'Tengo una Zanella 150' queda enterrado en la frase larga.
    const marcaYCilindrada = marcaConCilindradaSinModelo(textoCrudo || mensaje, { exigirMarcador: true })
    if (marcaYCilindrada) for (const n of cilindradasEn(marcaYCilindrada)) cc.add(n)
    for (const m of [moto?.modelo, ...(moto?.candidatos || [])]) {
        if (!m) continue
        if (m.cilindrada) cc.add(m.cilindrada)
        for (const n of cilindradasEn(m.nombre_completo)) cc.add(n)
        if (conAliases) for (const a of m.aliases || []) for (const n of cilindradasEn(a)) cc.add(n)
    }
    return cc
}

/**
 * Lee el mensaje UNA vez y devuelve cada cilindrada con su rol.
 *
 * `conAliasesDeLaMoto`: los alias suman cilindradas de golpe (una Rouser NS 200
 * trae el 125 del escape Paolucci entre sus alias). Sirven para NO tomar por
 * producto un numero que en realidad es de su moto, pero ensucian cuando lo
 * unico que se quiere es la cilindrada del modelo. Viaja como opcion porque los
 * detectores no coincidian en esto y el sweep lo deja a la vista.
 */
/**
 * La lectura de ESTE turno, lista para viajar en el embudo hasta las tools.
 *
 * Es plana a proposito (arrays, no Sets): el embudo se serializa para quedar
 * registrado junto a la llamada de la herramienta, y un Set ahi se guarda como
 * `{}`.
 *
 * Lleva el TEXTO sobre el que se hizo porque no siempre es el mismo: la rama de
 * la plantilla del anuncio lee el "resto" —lo que el cliente escribio ademas de
 * la plantilla— y los numeros de la plantilla no los dijo el. Guardar el texto
 * es lo que permite reusar la lectura sin arriesgarse a servir la de otro.
 */
export interface NumerosDelTurno {
    texto: string
    numeros: NumeroLeido[]
    deLaMoto: number[]
    /** No se deriva de los roles: la base del "de 70 a 110" no tiene rol propio. */
    conversion?: ConversionLeida
}

export function empaquetarLectura(texto: string | null | undefined, lectura: LecturaNumeros): NumerosDelTurno {
    return {
        texto: normalizarTexto(texto || ""),
        numeros: lectura.numeros,
        deLaMoto: [...lectura.deLaMoto],
        conversion: lectura.conversion
    }
}

/**
 * ¿La lectura que viene en el embudo es la de ESTE texto?
 *
 * Devuelve la lectura lista para usar, o `null` si el texto es otro y hay que
 * leerlo de nuevo. Nunca adivina: preferimos pagar la lectura de nuevo antes
 * que clasificar los numeros de un mensaje con los roles de otro.
 */
export function lecturaYaHecha(
    paquete: NumerosDelTurno | null | undefined,
    texto: string | null | undefined
): LecturaNumeros | null {
    if (!paquete) return null
    if (paquete.texto !== normalizarTexto(texto || "")) return null
    return {
        numeros: paquete.numeros,
        deLaMoto: new Set(paquete.deLaMoto),
        objetivo: paquete.numeros.find((n) => n.rol === "objetivo"),
        producto: paquete.numeros.find((n) => n.rol === "producto"),
        conversion: paquete.conversion
    }
}

export async function leerNumeros(
    mensaje: string | null | undefined,
    opciones?: { conAliasesDeLaMoto?: boolean }
): Promise<LecturaNumeros> {
    const vacio: LecturaNumeros = { numeros: [], deLaMoto: new Set() }
    const norm = normalizarTexto(mensaje || "")
    if (!norm) return vacio

    const tokens = norm.split(" ").filter(Boolean)
    const posiciones = tokens
        .map((t, i) => ({ valor: numeroDeCilindrada(t), posicion: i }))
        .filter((x): x is { valor: number; posicion: number } => x.valor != null)
    if (posiciones.length === 0) return vacio

    const deLaMoto = await cilindradasDeSuMoto(norm, opciones?.conAliasesDeLaMoto !== false, mensaje || undefined)

    const rol = new Map<number, { rol: RolNumero; frase: string }>()

    // 1. MOTO: el unico rol con una tabla atras.
    for (const p of posiciones) {
        if (deLaMoto.has(p.valor)) rol.set(p.posicion, { rol: "moto", frase: tokens[p.posicion] })
    }

    // 2. OBJETIVO: verbo explicito + numero, saltando el "de X a Y".
    let objetivo: NumeroLeido | undefined
    let conversion: ConversionLeida | undefined
    let base: number | undefined
    for (let i = 0; i < tokens.length && !objetivo; i++) {
        const esVerbo =
            RX_VERBO_OBJETIVO.test(tokens[i]) ||
            RX_VERBO_CONJUGADO.test(tokens[i]) ||
            RX_VERBO_IMPERATIVO.test(tokens[i]) ||
            RX_VERBO_POTENCIA.test(tokens[i])
        if (!esVerbo) continue

        for (let j = i + 1; j <= i + 1 + VENTANA_PUENTE && j < tokens.length; j++) {
            const n = numeroDeCilindrada(tokens[j])
            if (n != null) {
                // "potenciar mi 110 a 120": el primero es SU MOTO y el objetivo
                // es el ultimo de la cadena (conv 3338).
                let fin = j
                let valor = n
                while (
                    fin + 2 < tokens.length &&
                    SALTO_A_OTRO_NUMERO.has(tokens[fin + 1]) &&
                    numeroDeCilindrada(tokens[fin + 2]) != null
                ) {
                    // Hubo salto: lo de la izquierda es el motor del que parte.
                    // El verbo ya ancla la cadena, asi que la conversion sale de
                    // aca y el paso 4 no tiene que volver a buscarla.
                    base = valor
                    valor = numeroDeCilindrada(tokens[fin + 2]) as number
                    fin += 2
                }
                objetivo = {
                    valor,
                    rol: "objetivo",
                    frase: tokens.slice(i, fin + 1).join(" "),
                    posicion: fin
                }
                rol.set(fin, { rol: "objetivo", frase: objetivo.frase })
                if (base != null && valor > base) conversion = { base, objetivo: valor, frase: objetivo.frase }
                break
            }
            if (!PUENTE.has(tokens[j])) break
        }
    }

    // 3. PRODUCTO: palabra de producto cerca, sobre lo que quedo sin rol.
    let producto: NumeroLeido | undefined
    for (const p of posiciones) {
        if (rol.has(p.posicion)) continue
        for (let j = Math.max(0, p.posicion - VENTANA_PRODUCTO); j < p.posicion; j++) {
            if (!PALABRAS_PRODUCTO.has(tokens[j])) continue
            const frase = tokens.slice(j, p.posicion + 1).join(" ")
            rol.set(p.posicion, { rol: "producto", frase })
            if (!producto) producto = { valor: p.valor, rol: "producto", frase, posicion: p.posicion }
            break
        }
    }

    // 4. CONVERSION: "un kit de 70 a 110" — dos numeros unidos por un salto, sin
    //    ningun verbo que los ate. El de la izquierda no es la medida de un kit
    //    nuestro: es el motor que TIENE hoy. El de la derecha es a donde quiere
    //    llegar, y hasta ahora quedaba en `ruido` (conv 4475): el turno leia
    //    "kit de 70" + un 110 sin rol y terminaba ofreciendo los combos que
    //    potencian una 110.
    //
    //    Solo se lee como conversion si el numero de la izquierda ya tiene un
    //    rol que lo ancle al motor o al pedido (`moto` o `producto`). Sin ese
    //    ancla, "de 100 a 500" es un envio o una plata, no un motor.
    // 4.a La base tambien puede estar SUELTA, antes del objetivo y sin ningun
    //     "a" que la ate: "tengo una 70 y la quiero llevar a 110". Ese 70 es el
    //     motor que tiene —el dato que decide si hay algo que venderle— y hasta
    //     ahora quedaba en `ruido`.
    //
    //     Solo se toma un numero SIN rol (si ya es su moto o la medida de un
    //     producto, el rol manda) y que no sea plata: "me lo hacen por 140 mil,
    //     la quiero hacer 150" no dice que tenga un motor de 140.
    if (!conversion && objetivo) {
        for (const p of posiciones) {
            if (p.posicion >= objetivo.posicion) break
            if (rol.has(p.posicion)) continue
            if (UNIDADES_DE_PLATA.has(tokens[p.posicion + 1] || "")) continue
            if (p.valor >= objetivo.valor) continue
            conversion = {
                base: p.valor,
                objetivo: objetivo.valor,
                frase: tokens.slice(p.posicion, objetivo.posicion + 1).join(" ")
            }
            break
        }
    }

    if (!conversion && !objetivo) {
        for (let i = 0; i + 2 < tokens.length && !conversion; i++) {
            const base = numeroDeCilindrada(tokens[i])
            if (base == null) continue
            if (!SALTO_A_OTRO_NUMERO.has(tokens[i + 1])) continue
            const destino = numeroDeCilindrada(tokens[i + 2])
            if (destino == null || destino <= base) continue

            const rolBase = rol.get(i)?.rol
            if (rolBase !== "moto" && rolBase !== "producto") continue

            const desde = i > 0 && tokens[i - 1] === "de" ? i - 1 : i
            const frase = tokens.slice(desde, i + 3).join(" ")
            conversion = { base, objetivo: destino, frase }

            // El destino pasa a ser el objetivo del turno: es exactamente lo
            // mismo que dice "llevarla a 110", solo que sin el verbo.
            if (!rol.has(i + 2)) {
                rol.set(i + 2, { rol: "objetivo", frase })
                objetivo = { valor: destino, rol: "objetivo", frase, posicion: i + 2 }
            }
        }
    }

    const numeros: NumeroLeido[] = posiciones.map((p) => {
        const r = rol.get(p.posicion)
        return {
            valor: p.valor,
            rol: r?.rol ?? "ruido",
            frase: r?.frase ?? tokens[p.posicion],
            posicion: p.posicion
        }
    })

    return { numeros, deLaMoto, objetivo, producto, conversion }
}
