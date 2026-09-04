import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"

export interface ArgsEscalarHumano {
    motivo: string
    resumen_consulta: string
}

export interface ResultadoEscalarHumano {
    escalado: boolean
    motivo: string
    resumen: string
    mensaje_para_agente: string
}

export const definicionEscalarHumano: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "escalar_a_humano",
        description: "Deriva la conversación en silencio al equipo humano de Revolución Motos cuando la consulta es ambigua, técnica compleja sin datos en el sistema, consulta de venta mayorista, reclamo, o cuando no hay certeza de la respuesta. Al ejecutar esta herramienta, el bot NO debe emitir ninguna respuesta pública al cliente.",
        parameters: {
            type: "object",
            properties: {
                motivo: {
                    type: "string",
                    description: "Categoría breve del motivo (ej: 'moto_no_registrada', 'mayorista', 'pieza_no_catalogada', 'reclamo', 'ambiguo')."
                },
                resumen_consulta: {
                    type: "string",
                    description: "Resumen claro en una o dos oraciones de qué necesita el cliente para que el vendedor humano pueda continuar la conversación sin leer todo el historial."
                }
            },
            required: ["motivo", "resumen_consulta"]
        }
    }
}

export async function escalarAHumano(args: ArgsEscalarHumano): Promise<ResultadoEscalarHumano> {
    // En producción acá se inserta la nota privada en Chatwoot / tabla de pendientes
    console.log(`[ESCALADO EN SILENCIO] Motivo: ${args.motivo} | Resumen: ${args.resumen_consulta}`)

    return {
        escalado: true,
        motivo: args.motivo,
        resumen: args.resumen_consulta,
        mensaje_para_agente: "ESCALADO REALIZADO CON ÉXITO. Regla de oro: NO envíes ningún mensaje de texto al cliente. El equipo humano continuará la conversación."
    }
}

export const herramientaEscalarHumano: EjecutorHerramienta<ArgsEscalarHumano, ResultadoEscalarHumano> = {
    definicion: definicionEscalarHumano,
    ejecutar: escalarAHumano
}
