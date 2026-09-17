import { DefinicionHerramienta, EjecutorHerramienta, HerramientaEjecutadaInfo } from "../tipos"
import { distanciaOSA } from "../nucleo/texto"
import type { NumerosDelTurno } from "../nucleo/numeros-del-mensaje"
import { herramientaCompatibilidad } from "./compatibilidad"
import { herramientaCatalogoPrecios } from "./catalogo-precios"
import { herramientaCotizarSueltas } from "./cotizar-sueltas"
import { herramientaInfoNegocio } from "./info-negocio"
import { herramientaEscalarHumano } from "./escalar-humano"
import { herramientaResolverVariante } from "./resolver-variante"

export const todasLasHerramientas: Record<string, EjecutorHerramienta> = {
    consultar_compatibilidad: herramientaCompatibilidad,
    consultar_catalogo_y_precios: herramientaCatalogoPrecios,
    cotizar_piezas_sueltas: herramientaCotizarSueltas,
    resolver_variante: herramientaResolverVariante,
    consultar_info_negocio: herramientaInfoNegocio,
    escalar_a_humano: herramientaEscalarHumano
}

export const definicionesHerramientas: DefinicionHerramienta[] = Object.values(todasLasHerramientas).map(
    (h) => h.definicion
)

export interface ContextoEjecucion {
    /** ID de la conversación de Chatwoot: el motor lo inyecta, el LLM no lo ve. */
    conversationId?: number
    /**
     * Temas de negocio ya contestados en esta conversación (del estado
     * persistente). El motor lo inyecta; el LLM no lo ve ni lo puede falsear.
     * Hace que `consultar_info_negocio` sepa que no tiene que volver a volcar
     * el bloque entero.
     */
    temasYaRespondidos?: string[]
    /**
     * En qué punto del embudo está la conversación (del estado persistente).
     * Lo inyecta el motor, el LLM no lo ve ni lo puede falsear.
     *
     * Sin esto, `consultar_catalogo_y_precios` devolvía SIEMPRE el libreto de
     * presentación ("PASO 2 — mandá el mensaje oficial tal cual") aunque el
     * cliente ya tuviera la ficha, la foto y el precio desde hace 3 mensajes:
     * la herramienta no sabía en qué punto de la charla estaba y el modelo le
     * hace más caso a la guía de la herramienta que al "no repitas" del prompt.
     * Mismo principio que `temasYaRespondidos` para `consultar_info_negocio`.
     * Ver conv 2763 (08/09).
     */
    embudo?: EstadoEmbudo
    /**
     * En este turno una búsqueda del catálogo ya volvió sin match. Lo lleva el
     * motor: habilita el guard que impide volcar el catálogo entero como
     * reintento. El LLM no lo ve ni lo puede falsear.
     */
    catalogoSinMatch?: boolean
}

/** Lo que ya quedó firme en la charla, para que las tools no re-presenten. */
export interface EstadoEmbudo {
    /**
     * La charla ya venía andando: este NO es el primer mensaje del cliente.
     * Lo lleva el motor (largo del historial), el LLM no lo ve ni lo puede
     * falsear. Lo usa el catálogo para saber cómo entregar una ficha nueva: la
     * plantilla del producto está escrita para el primer mensaje (saluda y
     * termina pidiendo la moto), y en el medio de una conversación ese marco
     * sobra. Los IDs del embudo no alcanzan como proxy: el primer kit de la
     * charla también se presenta sin nada pineado todavía.
     */
    charlaEnCurso?: boolean
    grupoPineadoId?: number | null
    packPresentadoId?: number | null
    varianteResuelta?: { packId: number; etiqueta: string; precio: number } | null
    /**
     * Variante que `resolver_variante` resolvió en ESTE mismo turno (todavía no
     * es estado firme: el cliente la lee recién en la respuesta que se está
     * redactando). Sirve solo para armar la composición con el cilindro/pieza
     * que de verdad se lleva; NO activa el "ya se lo dijiste" de la variante
     * firme. Sin esto, "recorrido corto y qué más trae el kit?" llegaba al
     * catálogo con la variante todavía sin definir, la composición se partía en
     * "las 2 opciones" y la regla de no abrir variantes se comía el cilindro:
     * el bot contestó solo por la tapa (conv 4344, 16/09).
     */
    varianteResueltaEnTurno?: { packId: number; etiqueta: string; precio: number } | null
    /**
     * Moto que ya quedo confirmada compatible en turnos anteriores. La usa
     * `resolver_variante` cuando el modelo no vuelve a pasar `modelo_moto`
     * (el cliente la dijo hace 3 turnos): sin esto, el chequeo de
     * compatibilidad no corre y la variante se resuelve a ciegas.
     */
    motoConfirmada?: string | null
    /**
     * Moto que el cliente nombró en esta charla, de ESTE mensaje o de uno
     * anterior, esté confirmada o no. La usa el aviso del catálogo: sin ella el
     * aviso solo miraba el mensaje del turno, y una moto dicha dos mensajes
     * antes dejaba pasar "para tu 110 DLX tenemos..." sin chequear nada
     * (conv 4206). No afirma compatibilidad: solo dice que hay moto en juego.
     */
    motoMencionada?: string | null
    /**
     * Cuántas veces ya se le repreguntó la moto al cliente en esta charla.
     * Lo lleva el motor (estado persistente): las tools lo usan para no
     * insistir más allá de `TOPE_REPREGUNTAS_MOTO` y derivar al equipo.
     */
    repreguntasMoto?: number
    /**
     * Moto que el cliente nombró en el mensaje de ESTE turno (la resuelve el
     * motor con `resolverMoto`). No es lo mismo que `motoConfirmada`: esa ya
     * pasó por compatibilidad, esta recién se nombró y no la validó nadie.
     * `consultar_catalogo_y_precios` la usa para exigir el chequeo de
     * compatibilidad antes de que el modelo afirme que el producto le sirve.
     */
    motoDelMensaje?: string | null
    /**
     * Los numeros del mensaje de ESTE turno, ya leidos con su rol (la
     * cilindrada de su moto, a cuanto quiere llevarla, la medida que pide). Lo
     * resuelve el motor UNA vez, el LLM no lo ve ni lo puede falsear.
     *
     * Antes cada rama del turno leia el mismo mensaje por su cuenta —la de la
     * plantilla del anuncio en el motor, `resolver_variante` adentro de la
     * tool— y un numero podia terminar con un rol distinto segun por donde
     * entrara la charla. Ver `nucleo/numeros-del-mensaje.ts`: trae el texto
     * sobre el que se leyo, y si no es el mismo la tool lee de nuevo.
     */
    numerosDelMensaje?: NumerosDelTurno | null
    /**
     * Todo lo que el bot ya le dijo al cliente en esta charla, concatenado. Lo
     * lleva el motor (historial), el LLM no lo ve ni lo puede falsear.
     *
     * Es la segunda evidencia de "esto ya se lo mandamos", para cuando los ids
     * del embudo no alcanzan: un combo presentado por el equipo a mano desde el
     * panel, o una charla vieja anterior al pineo, no dejan `grupoPineadoId` y
     * la ficha volvería a salir entera. Ver `fichaPendiente` en
     * `resolver-variante.ts`.
     */
    textoPreviosDelBot?: string | null
}

/**
 * Corrige los nombres de argumentos que el modelo escribe MAL.
 *
 * Por qué existe (conv 3894, 10/09): con `deepseek-flash` el modelo empezó a
 * mandar `kit_nombre_or_id` en vez de `kit_nombre_o_id` — una letra. La clave
 * desconocida se ignoraba en silencio y la tool corría como si nadie hubiera
 * preguntado por un kit: `coincideKitPedido` sin kit acepta CUALQUIER fila, así
 * que a un cliente que preguntaba por el Kit 170 se le contestó con la ficha de
 * la "Leva de calle 7.80". Fueron 6 de 78 llamadas en un día, todas del modelo
 * nuevo — o sea que no es un accidente aislado sino un sesgo del modelo, y va a
 * volver a pasar con la próxima migración y con otro parámetro.
 *
 * La cura no es hardcodear el typo: cualquier clave que no esté en el schema se
 * arrima a la declarada más parecida. Se exige un parecido MUY alto (misma clave
 * salvo separadores, o distancia <= 2 sobre nombres largos) para no reinterpretar
 * un argumento que el modelo mandó a propósito, y nunca se pisa un valor que ya
 * vino bien. Lo que no se puede arrimar a nada se deja como está: que la tool lo
 * ignore es su decisión, no la nuestra.
 */
function corregirClavesArgumentos(
    definicion: DefinicionHerramienta,
    args: Record<string, any>
): { args: Record<string, any>; corregidas: string[] } {
    const declaradas = Object.keys(definicion.function?.parameters?.properties || {})
    if (!declaradas.length) return { args, corregidas: [] }

    // "kit_nombre_o_id" -> "kitnombreoid": el modelo se equivoca con los
    // separadores tanto como con las letras.
    const desnudar = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")
    const porDesnuda = new Map(declaradas.map((d) => [desnudar(d), d]))

    const corregidas: string[] = []
    const salida: Record<string, any> = {}

    for (const [clave, valor] of Object.entries(args)) {
        // `__embudo` y compañía los inyecta el motor, no el modelo.
        if (declaradas.includes(clave) || clave.startsWith("__")) {
            salida[clave] = valor
            continue
        }

        const desnuda = desnudar(clave)
        let destino = porDesnuda.get(desnuda) || null

        if (!destino) {
            for (const d of declaradas) {
                const dd = desnudar(d)
                // Nombres cortos ("id", "combo") quedan afuera: ahí una
                // distancia de 2 ya es otra palabra distinta.
                if (Math.min(dd.length, desnuda.length) < 6) continue
                if (distanciaOSA(desnuda, dd) <= 2) {
                    destino = d
                    break
                }
            }
        }

        // Si el valor bueno ya vino, el parecido no lo pisa.
        if (destino && salida[destino] === undefined && args[destino] === undefined) {
            salida[destino] = valor
            corregidas.push(`${clave} -> ${destino}`)
        } else {
            salida[clave] = valor
        }
    }

    return { args: salida, corregidas }
}

/**
 * Ejecuta una herramienta por nombre parseando los argumentos recibidos del LLM.
 * `contexto` lo aporta el motor (no el modelo) para datos como el conversation_id.
 */
export async function ejecutarHerramienta(
    nombre: string,
    argumentosRaw: string | Record<string, any>,
    contexto: ContextoEjecucion = {}
): Promise<HerramientaEjecutadaInfo> {
    const ejecutor = todasLasHerramientas[nombre]
    if (!ejecutor) {
        throw new Error(`La herramienta '${nombre}' no existe en el registro del agente.`)
    }

    let argsParsed: Record<string, any> = {}
    if (typeof argumentosRaw === "string") {
        try {
            argsParsed = JSON.parse(argumentosRaw)
        } catch (err) {
            argsParsed = { raw: argumentosRaw }
        }
    } else {
        argsParsed = argumentosRaw || {}
    }

    const { args: argsCorregidos, corregidas } = corregirClavesArgumentos(ejecutor.definicion, argsParsed)
    argsParsed = argsCorregidos
    if (corregidas.length) {
        // Queda en el log a propósito: si un modelo nuevo empieza a errarle
        // sistemáticamente a un parámetro, se ve acá antes que en una conversación.
        console.warn(`[herramientas] ${nombre}: argumentos corregidos (${corregidas.join(", ")})`)
    }

    // El motor manda el conversation_id por contexto; se lo pasamos a la tool de
    // escalado para que el pendiente quede linkeado a la conversación real.
    if (nombre === "escalar_a_humano" && contexto.conversationId != null && argsParsed.conversation_id == null) {
        argsParsed.conversation_id = contexto.conversationId
    }

    // Idem: qué temas de negocio ya se contestaron lo sabe el motor (estado
    // persistente), no el modelo. Sin esto la herramienta re-vuelca el bloque.
    if (nombre === "consultar_info_negocio") {
        argsParsed.__temas_ya_respondidos = contexto.temasYaRespondidos || []
    }

    // Idem con el punto del embudo: las tools de catálogo y de variante cambian
    // su guía cuando el kit YA se presentó o la variante YA está resuelta, para
    // no volver a mandar la ficha entera ante una pregunta puntual.
    // `consultar_compatibilidad` lo usa distinto: cuando el modelo no dice de
    // qué kit habla, el embudo sabe cuál se presentó y evita que la pregunta se
    // conteste con la fila de cualquier producto del catálogo.
    if (
        nombre === "consultar_catalogo_y_precios" ||
        nombre === "resolver_variante" ||
        nombre === "consultar_compatibilidad"
    ) {
        argsParsed.__embudo = contexto.embudo || {}
    }

    // Si en ESTE turno ya hubo una búsqueda sin resultado, el catálogo no puede
    // volver a listarse entero como plan B. Ver el guard del volcado en
    // `catalogo-precios.ts` (conv 4206).
    if (nombre === "consultar_catalogo_y_precios" && contexto.catalogoSinMatch) {
        argsParsed.__hubo_sin_match = true
    }

    const resultado = await ejecutor.ejecutar(argsParsed)

    return {
        nombre,
        argumentos: argsParsed,
        resultado
    }
}
