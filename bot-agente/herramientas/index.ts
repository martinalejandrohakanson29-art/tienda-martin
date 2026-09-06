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

    const resultado = await ejecutor.ejecutar(argsParsed)

    return {
        nombre,
        argumentos: argsParsed,
        resultado
    }
}
