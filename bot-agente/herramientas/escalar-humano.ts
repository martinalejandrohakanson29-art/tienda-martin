import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"

export interface ArgsEscalarHumano {
    motivo: string
    resumen_consulta: string
    modelo_moto?: string
    kit?: string
    conversation_id?: number
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
                },
                modelo_moto: {
                    type: "string",
                    description: "Si el motivo es 'moto_no_registrada' o duda de compatibilidad, marca y modelo de la moto que consultó el cliente."
                },
                kit: {
                    type: "string",
                    description: "Si el motivo es 'moto_no_registrada', nombre del kit o pieza consultada."
                }
            },
            required: ["motivo", "resumen_consulta"]
        }
    }
}

export async function escalarAHumano(args: ArgsEscalarHumano): Promise<ResultadoEscalarHumano> {
    console.log(`[ESCALADO EN SILENCIO] Motivo: ${args.motivo} | Resumen: ${args.resumen_consulta}`)

    // Solo se persiste el pendiente si hay una conversación real de Chatwoot a la
    // cual linkearlo. En el simulador y el banco de pruebas (sin conversation_id)
    // se reporta el escalado pero NO se ensucia el panel de pendientes.
    if (args.conversation_id == null) {
        return {
            escalado: true,
            motivo: args.motivo,
            resumen: args.resumen_consulta,
            mensaje_para_agente:
                "ESCALADO (modo prueba, sin conversación real: no se persiste). NO envíes ningún mensaje al cliente."
        }
    }

    // Registrar en la tabla correspondiente para el panel de pendientes de Chatwoot
    try {
        if (args.motivo === "moto_no_registrada" || args.motivo === "tecnica" || args.modelo_moto) {
            await prisma.$executeRawUnsafe(
                `INSERT INTO preguntas_tecnicas_pendientes (conversation_id, modelo_moto, kit, pregunta_original, estado, es_grupo, creado_en)
                 VALUES ($1, $2, $3, $4, 'pendiente', false, NOW())`,
                args.conversation_id || null,
                args.modelo_moto || args.resumen_consulta,
                args.kit || null,
                args.resumen_consulta
            )
        } else if (args.motivo === "pieza_no_catalogada" || args.motivo === "precio") {
            await prisma.$executeRawUnsafe(
                `INSERT INTO preguntas_precio_pendientes (conversation_id, producto, pregunta_original, estado, creado_en)
                 VALUES ($1, $2, $3, 'pendiente', NOW())`,
                args.conversation_id || null,
                args.resumen_consulta,
                args.resumen_consulta
            )
        } else if (args.motivo === "negocio" || args.motivo === "horarios" || args.motivo === "ubicacion") {
            await prisma.$executeRawUnsafe(
                `INSERT INTO preguntas_negocio_pendientes (conversation_id, tema, pregunta_original, estado, creado_en)
                 VALUES ($1, $2, $3, 'pendiente', NOW())`,
                args.conversation_id || null,
                args.motivo,
                args.resumen_consulta
            )
        } else {
            await prisma.$executeRawUnsafe(
                `INSERT INTO preguntas_sin_match_pendientes (conversation_id, pregunta_original, estado, creado_en)
                 VALUES ($1, $2, 'pendiente', NOW())`,
                args.conversation_id || null,
                args.resumen_consulta
            )
        }
    } catch (dbErr) {
        console.error("Error guardando escalado en Postgres:", dbErr)
    }

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
