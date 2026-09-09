import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { BandejaEscalado, MOTIVOS_CANONICOS, clasificarMotivoEscalado } from "../nucleo/motivos-escalado"
import { resolverDestinoPorNombre } from "@/lib/aprendizaje-compatibilidad"

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
    /** Bandeja de pendientes en la que quedó registrado (etiqueta en chats-vivo) */
    bandeja: BandejaEscalado
    resumen: string
    mensaje_para_agente: string
}

export const definicionEscalarHumano: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "escalar_a_humano",
        description: "Deriva EN SILENCIO al equipo humano de Revolución Motos la consulta puntual que no podés resolver: dato técnico que no está en el sistema, venta mayorista, reclamo, o cuando no hay certeza de la respuesta. Deriva SOLO esa consulta, no la conversación entera: si el cliente preguntó otra cosa en el mismo mensaje y una herramienta te da el dato, esa parte se contesta igual. Nunca le anuncies al cliente que derivaste algo.",
        parameters: {
            type: "object",
            properties: {
                motivo: {
                    type: "string",
                    // Enum cerrado: el motivo decide en qué bandeja del panel de
                    // pendientes cae la conversación (Técnica / Precio / Negocio /
                    // Sin resolver). Con texto libre el modelo inventaba variantes
                    // que caían todas en "Sin resolver" (conv 3599).
                    enum: Object.keys(MOTIVOS_CANONICOS),
                    description:
                        "Motivo del escalado, exactamente uno de la lista. " +
                        "Técnica: 'moto_no_registrada' (no sabemos si le entra a esa moto), 'compatibilidad_dudosa', 'consulta_tecnica'. " +
                        "Precio: 'producto_no_catalogado' (pide un kit/pieza que no está en el catálogo), 'consulta_precio', 'stock'. " +
                        "Negocio: 'mayorista', 'envio', 'pago', 'reclamo', 'horarios', 'ubicacion'. " +
                        "Si no encaja en ninguno: 'ambiguo' u 'otro'."
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
    console.log(
        `[ESCALADO EN SILENCIO] Motivo: ${args.motivo} -> bandeja ${clasificarMotivoEscalado(args.motivo)} | Resumen: ${args.resumen_consulta}`
    )

    // Solo se persiste el pendiente si hay una conversación real de Chatwoot a la
    // cual linkearlo. En el simulador y el banco de pruebas (sin conversation_id)
    // se reporta el escalado pero NO se ensucia el panel de pendientes.
    if (args.conversation_id == null) {
        return {
            escalado: true,
            motivo: args.motivo,
            bandeja: clasificarMotivoEscalado(args.motivo),
            resumen: args.resumen_consulta,
            mensaje_para_agente:
                "ESCALADO (modo prueba, sin conversación real: no se persiste). El equipo humano se hace cargo de ESA consulta."
        }
    }

    // Registrar en la bandeja de pendientes que corresponde. El motivo se
    // normaliza primero: si el modelo mandó algo fuera del enum, igual cae en la
    // bandeja correcta en vez del cajón genérico.
    const bandeja = clasificarMotivoEscalado(args.motivo)

    try {
        if (bandeja === "tecnica") {
            // `kit_id` / `es_grupo` son lo que después le permite al equipo cargar
            // la compatibilidad desde el chat sin adivinar a qué kit corresponde
            // (ver lib/aprendizaje-compatibilidad.ts). El modelo escala con el
            // nombre del kit en texto libre, así que se resuelve acá contra el
            // catálogo; si no matchea con claridad quedan en null y el formulario
            // pide elegir el kit a mano.
            const destino = args.kit ? await resolverDestinoPorNombre(args.kit).catch(() => null) : null
            await prisma.$executeRawUnsafe(
                `INSERT INTO preguntas_tecnicas_pendientes (conversation_id, modelo_moto, kit, kit_id, pregunta_original, estado, es_grupo, creado_en)
                 VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, NOW())`,
                args.conversation_id || null,
                args.modelo_moto || args.resumen_consulta,
                args.kit || null,
                destino?.id ?? null,
                args.resumen_consulta,
                destino?.tipo === "grupo"
            )
        } else if (bandeja === "precio") {
            await prisma.$executeRawUnsafe(
                `INSERT INTO preguntas_precio_pendientes (conversation_id, producto, pregunta_original, estado, creado_en)
                 VALUES ($1, $2, $3, 'pendiente', NOW())`,
                args.conversation_id || null,
                args.kit || args.resumen_consulta,
                args.resumen_consulta
            )
        } else if (bandeja === "negocio") {
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
        bandeja,
        resumen: args.resumen_consulta,
        mensaje_para_agente: "ESCALADO REALIZADO CON ÉXITO. El equipo humano se hace cargo de ESA consulta."
    }
}

export const herramientaEscalarHumano: EjecutorHerramienta<ArgsEscalarHumano, ResultadoEscalarHumano> = {
    definicion: definicionEscalarHumano,
    ejecutar: escalarAHumano
}
