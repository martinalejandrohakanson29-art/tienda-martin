import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"

export interface ArgsInfoNegocio {
    tema: "envios" | "ubicacion" | "medios_de_pago" | "horarios" | "garantia" | "general" | string
}

export interface ResultadoInfoNegocio {
    encontrado: boolean
    tema: string
    respuesta_oficial?: string
    mensaje_para_agente: string
}

export const definicionInfoNegocio: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "consultar_info_negocio",
        description: "Consulta las políticas oficiales del negocio cargadas en el sistema (ej. envíos a todo el país, ubicación física en Córdoba, formas de pago, horarios de atención, garantías).",
        parameters: {
            type: "object",
            properties: {
                tema: {
                    type: "string",
                    description: "El tema a consultar. Ejemplos: 'envios', 'ubicacion', 'pagos', 'horarios', 'garantia'."
                }
            },
            required: ["tema"]
        }
    }
}

export async function consultarInfoNegocio(args: ArgsInfoNegocio): Promise<ResultadoInfoNegocio> {
    const temaBuscado = (args.tema || "").toLowerCase().trim()

    try {
        const registros = await prisma.$queryRaw<
            { id: number; tema: string; respuesta: string; creado_en: Date }[]
        >`
            SELECT id, tema, respuesta, creado_en
            FROM info_negocio
            ORDER BY creado_en DESC
        `

        if (!registros || registros.length === 0) {
            return {
                encontrado: false,
                tema: temaBuscado,
                mensaje_para_agente: "No hay información institucional cargada en la tabla info_negocio."
            }
        }

        // Buscar el mejor match
        // Caso especial envíos: evitar traer 'Datos para envío' (el form de dni/nombre) en lugar de la política
        let candidato = registros.find((r) => {
            const t = r.tema.toLowerCase()
            if (temaBuscado.includes("envio")) {
                return t === "envios" || t.includes("politica de envio") || (t.includes("envio") && !t.includes("datos"))
            }
            if (temaBuscado.includes("ubic") || temaBuscado.includes("donde") || temaBuscado.includes("direccion")) {
                return t.includes("ubic") || t.includes("direccion") || t.includes("local")
            }
            if (temaBuscado.includes("pago") || temaBuscado.includes("tarjeta") || temaBuscado.includes("transferencia")) {
                return t.includes("pago") || t.includes("medio")
            }
            return t.includes(temaBuscado)
        })

        if (!candidato) {
            // Intento flexible
            candidato = registros.find((r) => r.tema.toLowerCase().includes(temaBuscado) || temaBuscado.includes(r.tema.toLowerCase()))
        }

        if (candidato) {
            return {
                encontrado: true,
                tema: candidato.tema,
                respuesta_oficial: candidato.respuesta,
                mensaje_para_agente: `INFORMACIÓN OFICIAL SOBRE ${candidato.tema.toUpperCase()}:\n"${candidato.respuesta}"\n(Redacta con naturalidad basándote estrictamente en este dato).`
            }
        }

        return {
            encontrado: false,
            tema: temaBuscado,
            mensaje_para_agente: `No se encontró información oficial sobre el tema '${args.tema}'. Si no sabes el dato certero, escala al equipo en silencio.`
        }
    } catch (error: any) {
        console.error("Error en consultarInfoNegocio:", error)
        return {
            encontrado: false,
            tema: temaBuscado,
            mensaje_para_agente: "Error al consultar las políticas del negocio."
        }
    }
}

export const herramientaInfoNegocio: EjecutorHerramienta<ArgsInfoNegocio, ResultadoInfoNegocio> = {
    definicion: definicionInfoNegocio,
    ejecutar: consultarInfoNegocio
}
