import { DefinicionHerramienta, EjecutorHerramienta, HerramientaEjecutadaInfo } from "../tipos"
import { distanciaOSA } from "../nucleo/texto"
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
}

/** Lo que ya quedó firme en la charla, para que las tools no re-presenten. */
export interface EstadoEmbudo {
    grupoPineadoId?: number | null
    packPresentadoId?: number | null
    varianteResuelta?: { packId: number; etiqueta: string; precio: number } | null
    /**
     * Moto que ya quedo confirmada compatible en turnos anteriores. La usa
     * `resolver_variante` cuando el modelo no vuelve a pasar `modelo_moto`
     * (el cliente la dijo hace 3 turnos): sin esto, el chequeo de
     * compatibilidad no corre y la variante se resuelve a ciegas.
     */
    motoConfirmada?: string | null
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

    const resultado = await ejecutor.ejecutar(argsParsed)

    return {
        nombre,
        argumentos: argsParsed,
        resultado
    }
}
