import { prisma } from "@/lib/prisma"
import {
    enviarImagenChatwoot,
    enviarMensajeChatwoot,
    estadoConversacionDesde,
    getEstadoBot,
    sincronizarHorarioAutomatico,
    type EstadoBot,
    type EstadoConversacionDesde,
    type RespuestaPendiente,
} from "@/lib/chatwoot-bot"

// Único origen que representa un saludo sin contenido propio ("Hola bro! En
// qué te podemos ayudar?", sin datos de kit/precio) -- el único caso donde
// tiene sentido descartar un pendiente solo porque el bot ya contestó algo
// más nuevo en la misma conversación. Los demás orígenes (bienvenida de kit,
// respuesta de compatibilidad, etc.) sí pueden ser distintos entre sí aunque
// el bot ya haya hablado, así que no entran en este chequeo.
const ORIGEN_SALUDO_GENERICO = "saludo_generico_2_0"

// Despachador de la cola de respuestas: se dispara al prender el bot y desde el
// botón "enviar pendientes" de /admin/chatwoot/cola.
//
// Sale escalonado a propósito. Treinta WhatsApps en el mismo segundo a las 9 de
// la mañana se leen como un bot; con unos segundos entre medio se lee como
// alguien que abrió el local y se puso a contestar.

const ESPERA_ENTRE_PARTES_MS = Number(process.env.BOT_COLA_ESPERA_PARTE_MS || 2000)
const ESPERA_ENTRE_CONVERSACIONES_MS = Number(process.env.BOT_COLA_ESPERA_CONVERSACION_MS || 6000)

// WhatsApp solo acepta texto libre dentro de las 24hs desde el ultimo mensaje
// del cliente; pasado eso, Chatwoot devuelve "24-hour customer service window
// is closed" y el mensaje queda en `failed` sin llegar. Encontrado en el
// piloto del 06/09 reprocesando la cola vieja: 14 de 18 fallaron por esto. En
// vez de gastar el intento (y dejar la fila en `error` como si fuera un
// problema nuestro), se descarta apenas se detecta para que quede claro que
// hace falta una plantilla aprobada o que el cliente vuelva a escribir.
const VENTANA_24HS_MARGEN_MS = 23 * 60 * 60 * 1000

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
//
// Se guarda el MOMENTO en que se tomó, no un booleano: si un envío se cuelga
// (fetch sin respuesta) el `finally` nunca corre y el flag quedaba pegado en
// true para siempre, matando la cola hasta un redeploy (pasó el 07/09). Pasado
// `DESPACHO_MAX_MS` asumimos que ese run murió y dejamos arrancar otro.
const DESPACHO_MAX_MS = 5 * 60 * 1000
let despachandoDesde: number | null = null

function despachoVivo(): boolean {
    return despachandoDesde !== null && Date.now() - despachandoDesde < DESPACHO_MAX_MS
}

export function despachoEnCurso() {
    return despachoVivo()
}

/**
 * Solo `despacharCola` pone filas en `enviando`. Si acá no hay ningún despacho
 * vivo, toda fila en `enviando` es de un run que murió (proceso reiniciado o
 * envío colgado): vuelve a `pendiente` para que se reintente en orden.
 */
async function recuperarFilasTrabadas(): Promise<void> {
    try {
        const n = await prisma.$executeRaw`
            UPDATE respuestas_pendientes SET estado = 'pendiente' WHERE estado = 'enviando'
        `
        if (Number(n) > 0) console.warn(`[cola] ${n} fila(s) recuperadas de 'enviando' trabado`)
    } catch (error) {
        console.error("[cola] no se pudieron recuperar filas trabadas:", error)
    }
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
    if (despachoVivo()) return { yaCorria: true, enviados: 0, descartados: 0, errores: 0 }
    if (despachandoDesde !== null) {
        console.warn(`[cola] el despacho anterior no cerró en ${DESPACHO_MAX_MS}ms; se asume muerto y se arranca otro`)
    }

    despachandoDesde = Date.now()
    // Antes de reclamar la primera fila: rescatar las que quedaron en `enviando`
    // de un run que murió (si llegamos acá, no hay despacho vivo).
    await recuperarFilasTrabadas()

    const resultado: ResultadoDespacho = { enviados: 0, descartados: 0, errores: 0 }
    // Una sola consulta a Chatwoot por conversación por corrida.
    const estadoPorConversacion = new Map<string, EstadoConversacionDesde>()
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

            if (!estadoPorConversacion.has(clave)) {
                estadoPorConversacion.set(
                    clave,
                    await estadoConversacionDesde(fila.account_id, fila.conversation_id, fila.creado_en)
                )
            }
            const estado = estadoPorConversacion.get(clave)!

            if (estado.humanoRespondio) {
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

            if (Date.now() - fila.creado_en.getTime() > VENTANA_24HS_MARGEN_MS) {
                const descartadas = await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'descartado', motivo = 'Ventana de 24hs de WhatsApp cerrada (mas de 23hs desde que se genero). Requiere plantilla aprobada o que el cliente vuelva a escribir.'
                    WHERE id = ${fila.id}
                `
                resultado.descartados += Number(descartadas)
                continue
            }

            if (fila.origen === ORIGEN_SALUDO_GENERICO && estado.botRespondio) {
                // El bot ya mandó algo más nuevo en esta conversación (típico:
                // un saludo quedó en cola fuera de horario y después, al
                // prenderse, contestó en vivo otro saludo del mismo cliente) --
                // mandar este saludo genérico también repetiría el mismo texto
                // dos veces seguidas sin aportar nada.
                const descartada = await prisma.$executeRaw`
                    UPDATE respuestas_pendientes
                    SET estado = 'descartado', motivo = 'Ya saludamos en esta conversación con un mensaje más nuevo'
                    WHERE id = ${fila.id}
                `
                resultado.descartados += Number(descartada)
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
        despachandoDesde = null
    }

    return resultado
}

/** Dispara el despacho sin bloquear a quien apretó el botón. */
export function despacharColaEnSegundoPlano(opciones: { forzar?: boolean } = {}) {
    void despacharCola(opciones).catch((error) => {
        console.error("Falló el despacho de la cola de respuestas:", error)
    })
}

/**
 * Punto único que deberían usar /api/chatwoot/enviar y el panel de admin en
 * vez de leer bot_estado directo: además de resolver si el horario
 * automático cambió el estado, dispara la cola si ese cambio fue un pasaje a
 * encendido (mismo criterio que alternarBot cuando lo prende una persona).
 * No depende de un cron aparte — cada mensaje entrante o carga de la pantalla
 * es la oportunidad en la que se reconcilia solo.
 */
export async function sincronizarEstadoBot(): Promise<EstadoBot> {
    const resultado = await sincronizarHorarioAutomatico()
    if (resultado.cambio && resultado.encendido) {
        despacharColaEnSegundoPlano()
        // El local acaba de abrir: además de la cola legacy, responder
        // consolidadas las conversaciones que escribieron con el local cerrado
        // (motor bot-agente). Import dinámico para no acoplar la cola genérica
        // con el motor (que arrastra todo el agente).
        void import("@/lib/bot-agente-tiempo-real")
            .then((m) => m.responderPendientesDeAperturaEnSegundoPlano())
            .catch((err) => console.error("[cola] no se pudo disparar la pasada de apertura:", err))
    }
    const { cambio, ...estado } = resultado
    return estado
}

/**
 * Empujón oportunista a la cola: reconcilia el horario y, si el bot está
 * encendido y hay algo pendiente sin un despacho vivo, lo arranca. Se llama
 * desde el webhook con CADA mensaje entrante del cliente — reemplaza al ping
 * que antes hacía n8n vía /api/chatwoot/enviar y cubre el caso de que el flip
 * de horario no lo haya agarrado ningún request en vuelo (pasó el 07/09).
 */
export async function empujarCola(): Promise<void> {
    try {
        const { encendido } = await sincronizarEstadoBot()
        if (!encendido || despachoEnCurso()) return
        const filas = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*)::bigint n FROM respuestas_pendientes WHERE estado IN ('pendiente', 'enviando')
        `
        if (Number(filas[0]?.n ?? 0) > 0) despacharColaEnSegundoPlano()
    } catch (error) {
        console.error("[cola] empujarCola falló:", error)
    }
}
