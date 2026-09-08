import { DefinicionHerramienta, EjecutorHerramienta, HerramientaEjecutadaInfo } from "../tipos"
import { herramientaCompatibilidad } from "./compatibilidad"
import { herramientaCatalogoPrecios } from "./catalogo-precios"
import { herramientaInfoNegocio } from "./info-negocio"
import { herramientaEscalarHumano } from "./escalar-humano"
import { herramientaResolverVariante } from "./resolver-variante"

export const todasLasHerramientas: Record<string, EjecutorHerramienta> = {
    consultar_compatibilidad: herramientaCompatibilidad,
    consultar_catalogo_y_precios: herramientaCatalogoPrecios,
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
    if (nombre === "consultar_catalogo_y_precios" || nombre === "resolver_variante") {
        argsParsed.__embudo = contexto.embudo || {}
    }

    const resultado = await ejecutor.ejecutar(argsParsed)

    return {
        nombre,
        argumentos: argsParsed,
        resultado
    }
}
