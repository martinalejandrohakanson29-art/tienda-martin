/**
 * Prueba de un kit recién cargado contra el motor real, antes de publicarlo.
 *
 * El checklist del validador dice qué campos faltan; esto muestra lo que va a
 * ver el cliente, que es lo único que se puede juzgar de verdad. Son las cinco
 * preguntas con las que se cae un kit mal cargado:
 *
 *   1. el precio            (sale $0 si el precio quedó vacío)
 *   2. qué trae             (escala si no hay artículos enganchados)
 *   3. una moto que SÍ      (deriva si no hay compatibilidad cargada)
 *   4. una moto que NO      (confirma de más si falta `cilindradas_base`)
 *   5. envío                (promete o niega lo que nadie cargó)
 *
 * Las motos no se inventan: la del punto 3 sale de la compatibilidad cargada
 * para este kit, y la del 4 de sus incompatibles o de una moto de otra
 * cilindrada. Si el kit no tiene compatibilidad cargada, esos dos turnos se
 * saltean y se dice por qué — preguntar por una moto al azar mediría otra cosa.
 *
 * Corre sobre una conversación de juguete (`estadoKey` propio, que se borra al
 * terminar): no toca el estado de ningún cliente real y no manda nada a
 * WhatsApp — `ejecutarTurnoAgente` solo genera la respuesta, el envío es otro
 * camino.
 */

import { prisma } from "@/lib/prisma"
import { ejecutarTurnoAgente } from "@/bot-agente/motor"
import { limpiarEstadoConversacion } from "@/bot-agente/nucleo/estado-persistente"
import type { MensajeChat } from "@/bot-agente/tipos"

export interface TurnoPrueba {
    titulo: string
    /** Qué se está midiendo con este turno. */
    mide: string
    pregunta: string
    respuesta: string
    herramientas: string[]
    escalado: boolean
    /** Cuando el turno no se pudo armar (falta el dato del que depende). */
    salteado?: string
}

export interface ResultadoPruebaKit {
    packId: number
    packNombre: string
    turnos: TurnoPrueba[]
    error?: string
}

interface PackPrueba {
    id: number
    nombre: string
    grupo_id: number | null
    cilindradas_base: number[] | null
}

async function motosDelKit(pack: PackPrueba): Promise<{ si: string | null; no: string | null }> {
    const filas = await prisma.$queryRaw<{ modelo_moto: string; compatible: boolean }[]>`
        SELECT modelo_moto, compatible
        FROM chat_combo_compatibilidad
        WHERE kit_id = ${pack.id} OR (${pack.grupo_id}::int IS NOT NULL AND grupo_id = ${pack.grupo_id}::int)
    `
    const si = filas.find((f) => f.compatible)?.modelo_moto ?? null
    const no = filas.find((f) => !f.compatible)?.modelo_moto ?? null

    if (no) return { si, no }

    // Sin incompatibles cargados, la prueba del "no" se hace con una moto de
    // otra cilindrada: es el error que más caro sale (confirmar un kit de 110 a
    // una 150) y el que `cilindradas_base` tiene que atajar.
    const ccPropias = pack.cilindradas_base || []
    if (ccPropias.length === 0) return { si, no: null }
    const otras = await prisma.$queryRaw<{ nombre_completo: string }[]>`
        SELECT nombre_completo FROM motos_modelos
        WHERE cilindrada IS NOT NULL AND NOT (cilindrada = ANY(${ccPropias}))
        ORDER BY cilindrada DESC
        LIMIT 1
    `
    return { si, no: otras[0]?.nombre_completo ?? null }
}

export async function probarKitConBot(packId: number): Promise<ResultadoPruebaKit> {
    const [pack] = await prisma.$queryRaw<PackPrueba[]>`
        SELECT p.id, p.nombre, p.grupo_id,
               COALESCE(NULLIF(p.cilindradas_base, '{}'), g.cilindradas_base) AS cilindradas_base
        FROM chat_packs p
        LEFT JOIN chat_pack_grupos g ON g.id = p.grupo_id
        WHERE p.id = ${packId}
    `
    if (!pack) return { packId, packNombre: `#${packId}`, turnos: [], error: "El pack no existe" }

    const { si, no } = await motosDelKit(pack)

    const guion: { titulo: string; mide: string; pregunta: string | null; salteado?: string }[] = [
        {
            titulo: "Precio",
            mide: "Que salga el precio cargado, en pesos y sin inventar.",
            pregunta: `hola, cuanto sale el ${pack.nombre}?`,
        },
        {
            titulo: "Qué trae",
            mide: "Que enumere las piezas enganchadas al pack, no una parte.",
            pregunta: "y que trae exactamente?",
        },
        {
            titulo: "Moto compatible",
            mide: "Que confirme con la fila cargada, sin agregar condiciones que nadie escribió.",
            pregunta: si ? `le va a una ${si}?` : null,
            salteado: si ? undefined : "Este kit no tiene ninguna moto compatible cargada.",
        },
        {
            titulo: "Moto que no corresponde",
            mide: "Que NO lo confirme: es donde se ve si falta la cilindrada de destino.",
            pregunta: no ? `y a una ${no} le sirve?` : null,
            salteado: no
                ? undefined
                : "No hay motos incompatibles cargadas ni cilindrada de destino con la cual contrastar.",
        },
        {
            titulo: "Envío",
            mide: "Que no prometa ni niegue envío si no está cargado.",
            pregunta: "hacen envios a todo el pais?",
        },
    ]

    const estadoKey = `prueba-kit-${packId}-${Date.now()}`
    const historial: MensajeChat[] = []
    const turnos: TurnoPrueba[] = []

    try {
        for (const paso of guion) {
            if (!paso.pregunta) {
                turnos.push({
                    titulo: paso.titulo,
                    mide: paso.mide,
                    pregunta: "",
                    respuesta: "",
                    herramientas: [],
                    escalado: false,
                    salteado: paso.salteado,
                })
                continue
            }

            const r = await ejecutarTurnoAgente(paso.pregunta, historial, { estadoKey })
            historial.push({ rol: "user", contenido: paso.pregunta } as MensajeChat)
            historial.push({ rol: "assistant", contenido: r.mensajeFinal || "" } as MensajeChat)

            turnos.push({
                titulo: paso.titulo,
                mide: paso.mide,
                pregunta: paso.pregunta,
                respuesta: r.mensajeFinal || "(silencio: el bot decidió no contestar)",
                herramientas: (r.herramientasEjecutadas || []).map((h) => h.nombre),
                escalado: Boolean(r.escaladoHumano),
            })
        }
    } catch (e) {
        return {
            packId,
            packNombre: pack.nombre,
            turnos,
            error: e instanceof Error ? e.message : "Error al correr la prueba",
        }
    } finally {
        // La conversación de juguete no tiene que quedar en la memoria del bot.
        await limpiarEstadoConversacion(estadoKey).catch(() => {})
    }

    return { packId, packNombre: pack.nombre, turnos }
}
