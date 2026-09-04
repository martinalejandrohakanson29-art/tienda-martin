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

export function calcularContextoHorarioCordoba(fechaReferencia: Date = new Date()): {
    diaSemana: string
    horaFormateada: string
    situacionActual: string
} {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Argentina/Cordoba",
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hour12: false
    })

    const parts = formatter.formatToParts(fechaReferencia)
    const weekday = parts.find((p) => p.type === "weekday")?.value || "Mon"
    let hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10)
    if (hour === 24) hour = 0
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10)
    const minutosDelDia = hour * 60 + minute

    const diasNombresEs: Record<string, string> = {
        Mon: "lunes",
        Tue: "martes",
        Wed: "miércoles",
        Thu: "jueves",
        Fri: "viernes",
        Sat: "sábado",
        Sun: "domingo"
    }
    const diaNombre = diasNombresEs[weekday] || "hoy"
    const horaFormateada = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} hs`

    let situacionActual = ""

    if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) {
        if (minutosDelDia < 540) {
            situacionActual = `Hoy ${diaNombre} abrimos a las 9 hs (estamos de 9 a 13:30 hs y de 16 a 19 hs).`
        } else if (minutosDelDia >= 540 && minutosDelDia < 810) {
            situacionActual = `Hoy ahora estamos atendiendo hasta las 13:30 hs (y a la tarde volvemos de 16 a 19 hs).`
        } else if (minutosDelDia >= 810 && minutosDelDia < 960) {
            situacionActual = `Ahora al mediodía el local está en receso. Hoy a la tarde volvemos a abrir de 16 a 19 hs.`
        } else if (minutosDelDia >= 960 && minutosDelDia < 1140) {
            situacionActual = `Hoy ahora estamos atendiendo hasta las 19:00 hs.`
        } else {
            if (weekday === "Fri") {
                situacionActual = `Hoy ya cerramos (estuvimos hasta las 19 hs). Mañana sábado abrimos de 9 a 13 hs.`
            } else {
                situacionActual = `Hoy ya cerramos (estuvimos hasta las 19 hs). Mañana volvemos a abrir de 9 a 13:30 hs y de 16 a 19 hs.`
            }
        }
    } else if (weekday === "Sat") {
        if (minutosDelDia < 540) {
            situacionActual = `Hoy sábado abrimos a las 9 hs (estamos hasta las 13 hs).`
        } else if (minutosDelDia >= 540 && minutosDelDia < 780) {
            situacionActual = `Hoy sábado estamos atendiendo hasta las 13:00 hs.`
        } else {
            situacionActual = `Hoy sábado ya cerramos (atendimos de 9 a 13 hs). El domingo estamos cerrados y volvemos a abrir el lunes de 9 a 13:30 hs.`
        }
    } else {
        situacionActual = `Hoy domingo estamos cerrados. Abrimos mañana lunes de 9 a 13:30 hs y de 16 a 19 hs.`
    }

    return {
        diaSemana: diaNombre,
        horaFormateada,
        situacionActual
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
            const esHorario = candidato.tema.toLowerCase().includes("horario") || temaBuscado.includes("horario")
            let mensajeAgente = `INFORMACIÓN OFICIAL SOBRE ${candidato.tema.toUpperCase()}:\n"${candidato.respuesta}"\n(Redacta con naturalidad basándote estrictamente en este dato).`

            if (esHorario) {
                const contexto = calcularContextoHorarioCordoba()
                mensajeAgente = `INFORMACIÓN OFICIAL SOBRE HORARIOS:
Horarios generales del local:
"${candidato.respuesta}"

SITUACIÓN ACTUAL DEL LOCAL EN TIEMPO REAL (Córdoba: hoy ${contexto.diaSemana}, ${contexto.horaFormateada}):
👉 ${contexto.situacionActual}

INSTRUCCIÓN VITAL PARA EL VENDEDOR (UBICARSE EN TIEMPO Y ESPACIO ACTUAL):
- Si el cliente pregunta específicamente por hoy o por el momento actual (ej: "hasta qué hora están hoy?", "están abiertos ahora?", "a qué hora abren a la tarde?", "atienden hoy?"):
  Respondé PRIMERO de forma directa y natural la situación exacta de hoy ("Hoy ahora estamos hasta las 19 hs..." o la situación correspondiente en tiempo real).
  Luego podés agregar brevemente los horarios generales ("si no, de lunes a viernes atendemos de...").
- CERO mensajes fríos de máquina o recitados genéricos de toda la semana cuando preguntan por hoy.`
            }

            return {
                encontrado: true,
                tema: candidato.tema,
                respuesta_oficial: candidato.respuesta,
                mensaje_para_agente: mensajeAgente
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
