import { DefinicionHerramienta, EjecutorHerramienta, HerramientaEjecutadaInfo } from "../tipos"
import { herramientaCompatibilidad } from "./compatibilidad"
import { herramientaCatalogoPrecios } from "./catalogo-precios"
import { herramientaInfoNegocio } from "./info-negocio"
import { herramientaEscalarHumano } from "./escalar-humano"

export const todasLasHerramientas: Record<string, EjecutorHerramienta> = {
    consultar_compatibilidad: herramientaCompatibilidad,
    consultar_catalogo_y_precios: herramientaCatalogoPrecios,
    consultar_info_negocio: herramientaInfoNegocio,
    escalar_a_humano: herramientaEscalarHumano
}

export const definicionesHerramientas: DefinicionHerramienta[] = Object.values(todasLasHerramientas).map(
    (h) => h.definicion
)

/**
 * Ejecuta una herramienta por nombre parseando los argumentos recibidos del LLM
 */
export async function ejecutarHerramienta(
    nombre: string,
    argumentosRaw: string | Record<string, any>
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

    const resultado = await ejecutor.ejecutar(argsParsed)

    return {
        nombre,
        argumentos: argsParsed,
        resultado
    }
}
