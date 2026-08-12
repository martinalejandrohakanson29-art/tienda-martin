import { prisma } from "@/lib/prisma"
import {
    enviarImagenChatwoot,
    enviarMensajeChatwoot,
    getEstadoBot,
    humanoRespondioDespues,
    type RespuestaPendiente,
} from "@/lib/chatwoot-bot"

// Despachador de la cola de respuestas: se dispara al prender el bot y desde el
// botón "enviar pendientes" de /admin/chatwoot/cola.
//
// Sale escalonado a propósito. Treinta WhatsApps en el mismo segundo a las 9 de
// la mañana se leen como un bot; con unos segundos entre medio se lee como
// alguien que abrió el local y se puso a contestar.

const ESPERA_ENTRE_PARTES_MS = Number(process.env.BOT_COLA_ESPERA_PARTE_MS || 2000)
const ESPERA_ENTRE_CONVERSACIONES_MS = Number(process.env.BOT_COLA_ESPERA_CONVERSACION_MS || 6000)

export type ResultadoDespacho = {
    yaCorria?: boolean
    enviados: number
    descartados: number
    errores: number
    cortadoPorApagado?: boolean
}

// El servidor corre en un solo proceso (mismo supuesto que el store del resumen
// en PDF), así que este flag alcanza para no despachar la misma cola dos veces
// en paralelo — por ejemplo si alguien apreta ON dos veces seguidas.
let despachando = false

export function despachoEnCurso() {
    return despachando
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Reclama la respuesta pendiente más vieja marcándola `enviando` en el mismo
 * UPDATE. Si el proceso se cae después de reclamarla, la fila queda en
 * `enviando` y no se manda sola de nuevo: preferimos que el cliente no reciba
 * dos veces el mismo mensaje y que quede visible en la web para reintentar.
 */
async function reclamarSiguiente(): Promise<RespuestaPendiente | null> {
    const filas = await prisma.$queryRaw<RespuestaPendiente[]>`
        UPDATE respuestas_pendientes
        SET estado = 'enviando'
        WHERE id = (
            SELECT id FROM respuestas_pendientes
            WHERE estado = 'pendiente'
            ORDER BY id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `
    return filas[0] ?? null
}

export async function despacharCola(opciones: { forzar?: boolean } = {}): Promise<ResultadoDespacho> {
    if (despachando) return { yaCorria: true, enviados: 0, descartados: 0, errores: 0 }

    despachando = true
    const resultado: ResultadoDespacho = { enviados: 0, descartados: 0, errores: 0 }
    // Una sola consulta a Chatwoot por conversación por corrida.
    const humanoPorConversacion = new Map<string, boolean>()
    let conversacionAnterior: string | null = null

    try {
        while (true) {
            // Si apagan el bot en el medio, lo que queda se vuelve a encolar
            // para la próxima vez que abran.
            if (!opciones.forzar) {
                const { encendido } = await getEstadoBot()
                if (!encendido) {
                    resultado.cortadoPorApagado = true
                    break
                }
            }

            const fila = await reclamarSiguiente()
            if (!fila) break

            const clave = String(fila.conversation_id)

            if (conversacionAnterior !== null) {
                await dormir(clave === conversacionAnterior ? ESPERA_ENTRE_PARTES_MS : ESPERA_ENTRE_CONVERSACIONES_MS)
            }
            conversacionAnterior = clave

            if (!humanoPorConversacion.has(clave)) {
                humanoPorConversacion.set(
                    clave,
                    await humanoRespondioDespues(fila.account_id, fila.conversation_id, fila.creado_en)
                )
            }

            if (humanoPorConversacion.get(clave)) {
                // Alguien del equipo ya atendió esa charla a mano: mandar ahora
                // la respuesta vieja del bot sería pisarlo.
                const descartadas = await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'descartado', motivo = 'Contestó alguien del equipo en esa conversación'
                    WHERE conversation_id = ${fila.conversation_id}
                      AND estado IN ('pendiente', 'enviando')
                `
                resultado.descartados += Number(descartadas)
                continue
            }

            try {
                await enviarMensajeChatwoot({
                    accountId: fila.account_id,
                    conversationId: fila.conversation_id,
                    content: fila.contenido,
                })

                if (fila.foto_url) {
                    // El texto ya salió: si la foto falla, no lo marcamos como error de
                    // la fila (el cliente ya recibió lo importante), solo lo logueamos.
                    try {
                        await enviarImagenChatwoot({
                            accountId: fila.account_id,
                            conversationId: fila.conversation_id,
                            fotoUrl: fila.foto_url,
                        })
                    } catch (errorFoto) {
                        console.error(`No se pudo mandar la foto de la respuesta ${fila.id} de la cola:`, errorFoto)
                    }
                }

                await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'enviado', enviado_en = now(), motivo = NULL
                    WHERE id = ${fila.id}
                `
                resultado.enviados++
            } catch (error) {
                const motivo = error instanceof Error ? error.message : String(error)
                await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'error', motivo = ${motivo.slice(0, 500)}
                    WHERE id = ${fila.id}
                `
                resultado.errores++
                console.error(`No se pudo enviar la respuesta ${fila.id} de la cola:`, error)
            }
        }
    } finally {
        despachando = false
    }

    return resultado
}

/** Dispara el despacho sin bloquear a quien apretó el botón. */
export function despacharColaEnSegundoPlano(opciones: { forzar?: boolean } = {}) {
    void despacharCola(opciones).catch((error) => {
        console.error("Falló el despacho de la cola de respuestas:", error)
    })
}
