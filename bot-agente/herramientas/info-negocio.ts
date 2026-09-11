import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { normalizarTexto } from "../nucleo/texto"
import { contieneUrl } from "../guardrails/sanitizador"
import { SINONIMOS_CONFIANZA } from "@/lib/temas-negocio"

/**
 * HERRAMIENTA `consultar_info_negocio` — DEVUELVE DATOS, NO UN GUION
 * ------------------------------------------------------------------
 * Antes devolvía el párrafo oficial completo del tema envuelto en la orden
 * "Redacta con naturalidad basándote estrictamente en este dato". Dos efectos
 * medidos en producción (conv 3561, 07/09):
 *   1. Volcaba TODO el bloque aunque el cliente hubiera preguntado una sola
 *      cosa ("cuánto tarda en llegar" -> le contestó demora + cadete en
 *      Córdoba capital + que se despacha después del pago).
 *   2. Al no saber que ya lo había dicho, en el turno siguiente devolvía el
 *      MISMO bloque literal y el modelo lo repetía entero — la guía de la
 *      herramienta le gana a la regla "no repitas" del prompt.
 *
 * Ahora: el dato oficial se parte en HECHOS numerados (los párrafos que ya
 * carga Martín) y se entregan como fuente, no como libreto. La selección de
 * cuál aplica la hace el modelo (es lo que sabe hacer), guiada por una sola
 * regla y por la pregunta textual del cliente. Y si el tema ya se contestó en
 * esta conversación, la guía cambia entera: "no repitas, contestá el matiz".
 *
 * No crece: un tema nuevo es una fila en `info_negocio`, cero código.
 */

export interface ArgsInfoNegocio {
    tema: "envios" | "ubicacion" | "medios_de_pago" | "horarios" | "garantia" | "general" | string
    /** Lo que preguntó el cliente, textual. Permite contestar solo eso. */
    pregunta_cliente?: string
    /**
     * Inyectado por el motor (NO por el modelo): temas de negocio que ya se le
     * contestaron a este cliente en esta conversación.
     */
    __temas_ya_respondidos?: string[]
}

export interface ResultadoInfoNegocio {
    encontrado: boolean
    tema: string
    respuesta_oficial?: string
    /** Los párrafos del dato oficial, separados. Para el inspector. */
    hechos?: string[]
    /** true si este tema ya se le había contestado antes en esta charla. */
    ya_respondido?: boolean
    mensaje_para_agente: string
}

export const definicionInfoNegocio: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "consultar_info_negocio",
        description: "Consulta las políticas y datos oficiales del negocio cargados en el sistema (ej. envíos a todo el país, ubicación física en Córdoba, formas de pago, horarios de atención, garantías, seguridad y confianza de compra, y nuestras redes y perfiles oficiales: Instagram, TikTok, Google Maps, Mercado Libre).",
        parameters: {
            type: "object",
            properties: {
                tema: {
                    type: "string",
                    description: "El tema a consultar. Ejemplos: 'envios', 'ubicacion', 'pagos', 'horarios', 'garantia' (para dudas de seguridad, estafa o confianza de compra, y también para pedidos de nuestras redes: instagram, tiktok, google maps, mercado libre)."
                },
                pregunta_cliente: {
                    type: "string",
                    description: "Textual, lo que preguntó o dijo el cliente sobre este tema. Sirve para contestarle solo eso y no volcarle toda la política."
                }
            },
            required: ["tema"]
        }
    }
}

/**
 * Parte el dato oficial en hechos independientes. Martín ya los carga separados
 * por renglón en blanco en `info_negocio.respuesta`; si no hay separación, el
 * dato entero es un solo hecho.
 */
export function partirEnHechos(respuesta: string): string[] {
    const partes = (respuesta || "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
    return partes.length > 0 ? partes : [(respuesta || "").trim()].filter(Boolean)
}

/**
 * Arma la guía del turno. Es la ÚNICA regla que la herramienta impone; todo lo
 * demás que entrega son datos.
 */
export function construirGuiaInfoNegocio(params: {
    tema: string
    hechos: string[]
    preguntaCliente?: string
    yaRespondido: boolean
}): string {
    const { tema, hechos, preguntaCliente, yaRespondido } = params
    const listado = hechos.map((h, i) => `[${i + 1}] ${h}`).join("\n")
    const dijo = preguntaCliente?.trim()
        ? `\nEl cliente dijo, textual: "${preguntaCliente.trim()}"`
        : ""

    // Los datos se cuentan con las palabras del vendedor, pero un ENLACE no es
    // redacción: o está carácter por carácter o no funciona. Si el dato oficial
    // trae URLs, la regla del turno lo dice explícito (misma familia que el
    // precio y la negativa de compatibilidad: dato duro, no improvisado).
    const reglaEnlaces = hechos.some((h) => contieneUrl(h))
        ? [
              "",
              "ENLACES: si el dato que vas a dar tiene un link, copialo EXACTO, caracter por caracter, tal como figura arriba.",
              "Prohibido acortarlo, reescribirlo, traducirlo, ponerle formato con corchetes o parentesis, o inventar uno que no este en esta lista.",
              "Mandas UNICAMENTE el link del dato que te pidieron: si pregunto por uno solo, no le pegues los demas."
          ].join("\n")
        : ""

    if (yaRespondido) {
        return [
            `OJO: el tema ${tema.toUpperCase()} YA se lo contestaste antes en esta conversación.`,
            "",
            `Los datos oficiales siguen siendo estos (fuente, no libreto):`,
            listado,
            dijo,
            "",
            "REGLA DE ESTE TURNO: NO repitas lo que ya le dijiste. Contestá SOLO el matiz nuevo que trae (en un renglón). Si no trae nada nuevo, un acuse corto y natural alcanza.",
            "EXCEPCION: si lo que pide es un link (o un dato que todavía no le pasaste de este tema), dáselo igual aunque el tema ya se haya tocado.",
            reglaEnlaces
        ].filter((l) => l !== null).join("\n").trimEnd()
    }

    return [
        `DATOS OFICIALES SOBRE ${tema.toUpperCase()} (son la verdad; el formato NO es un guion para recitar):`,
        listado,
        dijo,
        "",
        "REGLA DE ESTE TURNO: contestá con TUS palabras SOLO el dato que responde lo que preguntó, en 1 o 2 renglones. Los demás datos son contexto tuyo: no los menciones si no los pidió.",
        reglaEnlaces
    ].join("\n").trimEnd()
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

/**
 * Los sinónimos del bloque de confianza (instagram, tiktok, meli, maps...) viven
 * en `lib/temas-negocio` junto a la ficha que muestra el panel: quien edita el
 * texto tiene que ver con qué preguntas se lo va a servir el bot.
 */

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
            if (SINONIMOS_CONFIANZA.some((s) => temaBuscado.includes(s))) {
                return t.includes("garantia") || t.includes("confian")
            }
            return t.includes(temaBuscado)
        })

        if (!candidato) {
            // Intento flexible
            candidato = registros.find((r) => r.tema.toLowerCase().includes(temaBuscado) || temaBuscado.includes(r.tema.toLowerCase()))
        }

        if (candidato) {
            const esHorario = candidato.tema.toLowerCase().includes("horario") || temaBuscado.includes("horario")
            const hechos = partirEnHechos(candidato.respuesta)
            const yaRespondido = (args.__temas_ya_respondidos || []).some(
                (t) => normalizarTexto(t) === normalizarTexto(candidato!.tema)
            )
            let mensajeAgente = construirGuiaInfoNegocio({
                tema: candidato.tema,
                hechos,
                preguntaCliente: args.pregunta_cliente,
                yaRespondido
            })

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
                hechos,
                ya_respondido: yaRespondido,
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
