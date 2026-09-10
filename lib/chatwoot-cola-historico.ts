import { prisma } from "@/lib/prisma"
import { getHorarios, type HorarioDia } from "@/lib/chatwoot-bot"

// Registro y consulta histórica de las colas de mensajes acumuladas con el bot apagado.
// Desglosado en Bloque Mañana y Bloque Tarde (hora Córdoba, UTC-3).

export type BloqueCola = "manana" | "tarde"
export type EstadoBloqueCola = "acumulando" | "abierto" | "despachado"

export type FilaColaHistorica = {
    id: number
    fecha: string // YYYY-MM-DD
    bloque: BloqueCola
    mensajesEncolados: number
    conversacionesEncoladas: number
    conversacionesIds: number[]
    estado: EstadoBloqueCola
    primeroEn: string | null
    ultimoEn: string | null
    despachadoEn: string | null
    creadoEn: string
    actualizadoEn: string
}

export type ResumenDiaCola = {
    fecha: string // YYYY-MM-DD
    diaNombre: string
    manana: {
        mensajes: number
        conversaciones: number
        estado: EstadoBloqueCola
        primeroEn: string | null
        ultimoEn: string | null
        despachadoEn: string | null
    }
    tarde: {
        mensajes: number
        conversaciones: number
        estado: EstadoBloqueCola
        primeroEn: string | null
        ultimoEn: string | null
        despachadoEn: string | null
    }
    totalMensajes: number
    totalConversaciones: number
}

export type EstadoColaEnVivo = {
    botEncendido: boolean
    bloqueActual: BloqueCola
    fechaOperativa: string
    mensajesEncoladosActual: number
    conversacionesEncoladasActual: number
    conversacionesPendientes: {
        conversationId: number
        nombre: string | null
        telefono: string | null
        ultimoMensaje: string | null
        primerMensajeEn: string
        ultimoMensajeEn: string
    }[]
}

const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

/**
 * Desplaza una fecha UTC 3 horas hacia atrás para obtener la hora fija de Argentina (UTC-3).
 */
export function fechaArgentina(date: Date = new Date()) {
    const desplazado = new Date(date.getTime() - 3 * 60 * 60 * 1000)
    const fechaISO = desplazado.toISOString().slice(0, 10)
    const minutosDelDia = desplazado.getUTCHours() * 60 + desplazado.getUTCMinutes()
    const hora = desplazado.getUTCHours()
    const diaSemana = desplazado.getUTCDay()
    return { fechaISO, minutosDelDia, hora, diaSemana, desplazado }
}

/**
 * Determina para cuál bloque comercial ('manana' | 'tarde') y qué fecha operativa
 * se acumula un mensaje entrante mientras el bot está apagado.
 *
 * Criterio comercial Córdoba:
 * - Si es después del cierre de la tarde (ej: >= 19:00 hs / 1140 min):
 *   El mensaje se acumula para la apertura de la MAÑANA del día siguiente.
 *   (Ej: Miércoles 21:00 hs -> Jueves bloque 'manana').
 * - Si es antes de las 13:30 hs (ej: madrugada o mañana cerrada):
 *   Se acumula para la MAÑANA del día actual.
 * - Si es entre las 13:30 hs y las 19:00 hs (ej: siesta / almuerzo o tarde cerrada):
 *   Se acumula para la TARDE del día actual.
 */
export function determinarBloqueActual(date: Date = new Date()): { fechaOperativa: string; bloque: BloqueCola } {
    const { fechaISO, minutosDelDia, desplazado } = fechaArgentina(date)

    // Cierre habitual de la tarde: 19:00 hs (1140 min).
    // Si llega después de las 19:00 hs, ya espera la apertura de la mañana siguiente.
    if (minutosDelDia >= 1140) {
        const mananaDate = new Date(desplazado.getTime() + 24 * 60 * 60 * 1000)
        return {
            fechaOperativa: mananaDate.toISOString().slice(0, 10),
            bloque: "manana",
        }
    }

    // Si llega entre las 13:30 hs (810 min) y las 19:00 hs (1140 min):
    // Es el bloque de la tarde de hoy.
    if (minutosDelDia >= 810) {
        return {
            fechaOperativa: fechaISO,
            bloque: "tarde",
        }
    }

    // Antes de las 13:30 hs (00:00 a 13:29):
    // Es el bloque de la mañana de hoy.
    return {
        fechaOperativa: fechaISO,
        bloque: "manana",
    }
}

/**
 * Registra atómicamente un mensaje entrante en la tabla `bot_cola_historico`.
 * Realiza un UPSERT que incrementa mensajes y suma la conversación al array sin duplicar.
 */
export async function registrarMensajeEnColaHistorico(params: {
    conversationId: number | bigint
    fecha?: Date
}): Promise<void> {
    const convId = BigInt(params.conversationId)
    const fechaRef = params.fecha || new Date()
    const { fechaOperativa, bloque } = determinarBloqueActual(fechaRef)

    try {
        await prisma.$executeRaw`
            INSERT INTO bot_cola_historico (
                fecha,
                bloque,
                mensajes_encolados,
                conversaciones_encoladas,
                conversaciones_ids,
                estado,
                primero_en,
                ultimo_en,
                actualizado_en
            ) VALUES (
                ${fechaOperativa}::date,
                ${bloque},
                1,
                1,
                ARRAY[${convId}]::bigint[],
                'acumulando',
                ${fechaRef},
                ${fechaRef},
                now()
            )
            ON CONFLICT (fecha, bloque) DO UPDATE SET
                mensajes_encolados = bot_cola_historico.mensajes_encolados + 1,
                conversaciones_ids = CASE
                    WHEN ${convId} = ANY(bot_cola_historico.conversaciones_ids)
                    THEN bot_cola_historico.conversaciones_ids
                    ELSE array_append(bot_cola_historico.conversaciones_ids, ${convId})
                END,
                conversaciones_encoladas = CASE
                    WHEN ${convId} = ANY(bot_cola_historico.conversaciones_ids)
                    THEN bot_cola_historico.conversaciones_encoladas
                    ELSE bot_cola_historico.conversaciones_encoladas + 1
                END,
                ultimo_en = ${fechaRef},
                actualizado_en = now()
        `
    } catch (err) {
        console.error("[cola-historico] Error al registrar mensaje en cola historico:", err)
    }
}

/**
 * Marca el bloque actual o específico como despachado al abrir el bot o iniciar el barrido.
 */
export async function marcarBloqueDespachado(bloque?: BloqueCola, fecha?: Date): Promise<void> {
    const fechaRef = fecha || new Date()
    const meta = determinarBloqueActual(fechaRef)
    const fechaOperativa = meta.fechaOperativa
    const bloqueObjetivo = bloque || meta.bloque

    try {
        await prisma.$executeRaw`
            UPDATE bot_cola_historico
            SET estado = 'despachado',
                despachado_en = now(),
                actualizado_en = now()
            WHERE fecha = ${fechaOperativa}::date
              AND bloque = ${bloqueObjetivo}
              AND estado = 'acumulando'
        `
    } catch (err) {
        console.error("[cola-historico] Error al marcar bloque como despachado:", err)
    }
}

/**
 * Trae las filas consolidadas de `bot_cola_historico` agrupadas por día para los últimos N días.
 */
export async function obtenerHistoricoColas(diasAtras: number = 14): Promise<ResumenDiaCola[]> {
    const { fechaISO: hoyISO } = fechaArgentina(new Date())

    const filas = await prisma.$queryRaw<
        {
            id: number
            fecha: Date
            bloque: string
            mensajes_encolados: number
            conversaciones_encoladas: number
            conversaciones_ids: bigint[]
            estado: string
            primero_en: Date | null
            ultimo_en: Date | null
            despachado_en: Date | null
            creado_en: Date
            actualizado_en: Date
        }[]
    >`
        SELECT *
        FROM bot_cola_historico
        WHERE fecha >= (${hoyISO}::date - (${diasAtras} || ' days')::interval)::date
        ORDER BY fecha DESC, bloque ASC
    `

    const mapa = new Map<string, ResumenDiaCola>()

    // Asegurar estructura para cada uno de los días del rango solicitado
    for (let i = 0; i <= diasAtras; i++) {
        const d = new Date(Date.now() - (3 + i * 24) * 60 * 60 * 1000)
        const fStr = d.toISOString().slice(0, 10)
        const diaSemana = d.getUTCDay()
        mapa.set(fStr, {
            fecha: fStr,
            diaNombre: NOMBRES_DIAS[diaSemana] || "",
            manana: {
                mensajes: 0,
                conversaciones: 0,
                estado: "despachado",
                primeroEn: null,
                ultimoEn: null,
                despachadoEn: null,
            },
            tarde: {
                mensajes: 0,
                conversaciones: 0,
                estado: "despachado",
                primeroEn: null,
                ultimoEn: null,
                despachadoEn: null,
            },
            totalMensajes: 0,
            totalConversaciones: 0,
        })
    }

    for (const f of filas) {
        const fStr = f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : String(f.fecha).slice(0, 10)
        let item = mapa.get(fStr)
        if (!item) {
            const d = new Date(`${fStr}T12:00:00Z`)
            item = {
                fecha: fStr,
                diaNombre: NOMBRES_DIAS[d.getUTCDay()] || "",
                manana: {
                    mensajes: 0,
                    conversaciones: 0,
                    estado: "despachado",
                    primeroEn: null,
                    ultimoEn: null,
                    despachadoEn: null,
                },
                tarde: {
                    mensajes: 0,
                    conversaciones: 0,
                    estado: "despachado",
                    primeroEn: null,
                    ultimoEn: null,
                    despachadoEn: null,
                },
                totalMensajes: 0,
                totalConversaciones: 0,
            }
            mapa.set(fStr, item)
        }

        const bloqueKey = f.bloque === "manana" ? "manana" : "tarde"
        item[bloqueKey] = {
            mensajes: f.mensajes_encolados,
            conversaciones: f.conversaciones_encoladas,
            estado: f.estado as EstadoBloqueCola,
            primeroEn: f.primero_en ? f.primero_en.toISOString() : null,
            ultimoEn: f.ultimo_en ? f.ultimo_en.toISOString() : null,
            despachadoEn: f.despachado_en ? f.despachado_en.toISOString() : null,
        }
    }

    // Calcular totales por día
    const resultado = Array.from(mapa.values())
    for (const r of resultado) {
        r.totalMensajes = r.manana.mensajes + r.tarde.mensajes
        r.totalConversaciones = r.manana.conversaciones + r.tarde.conversaciones
    }

    return resultado.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/**
 * Consulta el estado exacto de la cola acumulándose en tiempo real.
 */
export async function obtenerEstadoColaEnVivo(): Promise<EstadoColaEnVivo> {
    const ahora = new Date()
    const { fechaOperativa, bloque } = determinarBloqueActual(ahora)

    // Leer bot_estado
    const estadoFilas = await prisma.$queryRaw<{ encendido: boolean }[]>`
        SELECT encendido FROM bot_estado WHERE id = 1
    `
    const botEncendido = estadoFilas[0]?.encendido ?? true

    // Leer fila actual en bot_cola_historico si existe
    const colaFilas = await prisma.$queryRaw<
        { mensajes_encolados: number; conversaciones_encoladas: number }[]
    >`
        SELECT mensajes_encolados, conversaciones_encoladas
        FROM bot_cola_historico
        WHERE fecha = ${fechaOperativa}::date AND bloque = ${bloque}
        LIMIT 1
    `

    // Leer conversaciones en bot_agente_entrantes_pendientes con datos del espejo
    const pendientesFilas = await prisma.$queryRaw<
        {
            conversation_id: bigint
            primer_mensaje_en: Date
            ultimo_mensaje_en: Date
            nombre: string | null
            telefono: string | null
            ultimo_mensaje: string | null
        }[]
    >`
        SELECT p.conversation_id, p.primer_mensaje_en, p.ultimo_mensaje_en,
               e.nombre, e.telefono, e.ultimo_mensaje
        FROM bot_agente_entrantes_pendientes p
        LEFT JOIN chatwoot_conversaciones_espejo e ON e.id = p.conversation_id
        ORDER BY p.ultimo_mensaje_en DESC
    `

    const conversacionesPendientes = pendientesFilas.map((p) => ({
        conversationId: Number(p.conversation_id),
        nombre: p.nombre,
        telefono: p.telefono,
        ultimoMensaje: p.ultimo_mensaje,
        primerMensajeEn: p.primer_mensaje_en.toISOString(),
        ultimoMensajeEn: p.ultimo_mensaje_en.toISOString(),
    }))

    const mensajesEncoladosActual = Math.max(
        colaFilas[0]?.mensajes_encolados ?? 0,
        conversacionesPendientes.length
    )
    const conversacionesEncoladasActual = Math.max(
        colaFilas[0]?.conversaciones_encoladas ?? 0,
        conversacionesPendientes.length
    )

    return {
        botEncendido,
        bloqueActual: bloque,
        fechaOperativa,
        mensajesEncoladosActual,
        conversacionesEncoladasActual,
        conversacionesPendientes,
    }
}

/**
 * Realiza un backfill inteligente del histórico a partir de los datos existentes en:
 * 1. `bot_agente_turnos_reales` (resultado_envio = 'encolado')
 * 2. `respuestas_pendientes` (creado_en)
 */
export async function backfillHistoricoDesdeTurnos(): Promise<{ insertados: number }> {
    try {
        // 1. Obtener todos los turnos encolados por local cerrado
        const turnos = await prisma.$queryRaw<
            { conversation_id: bigint; creado_en: Date }[]
        >`
            SELECT conversation_id, creado_en
            FROM bot_agente_turnos_reales
            WHERE resultado_envio = 'encolado'
              AND detalle_envio ILIKE '%cerrado%'
            ORDER BY creado_en ASC
        `

        // 2. Obtener respuestas_pendientes legacy
        const legacy = await prisma.$queryRaw<
            { conversation_id: bigint; creado_en: Date }[]
        >`
            SELECT conversation_id, creado_en
            FROM respuestas_pendientes
            WHERE creado_en < now() - interval '3 days'
            ORDER BY creado_en ASC
        `

        type Acumulador = {
            mensajes: number
            conversaciones: Set<number>
            primeroEn: Date
            ultimoEn: Date
        }

        const mapa = new Map<string, Acumulador>()

        const procesarItem = (item: { conversation_id: bigint; creado_en: Date }) => {
            const convId = Number(item.conversation_id)
            const { fechaOperativa, bloque } = determinarBloqueActual(item.creado_en)
            const clave = `${fechaOperativa}_${bloque}`

            let acc = mapa.get(clave)
            if (!acc) {
                acc = {
                    mensajes: 0,
                    conversaciones: new Set(),
                    primeroEn: item.creado_en,
                    ultimoEn: item.creado_en,
                }
                mapa.set(clave, acc)
            }
            acc.mensajes++
            acc.conversaciones.add(convId)
            if (item.creado_en < acc.primeroEn) acc.primeroEn = item.creado_en
            if (item.creado_en > acc.ultimoEn) acc.ultimoEn = item.creado_en
        }

        for (const t of turnos) procesarItem(t)
        for (const l of legacy) procesarItem(l)

        let insertados = 0
        const { fechaOperativa: activaFecha, bloque: activoBloque } = determinarBloqueActual(new Date())

        for (const [clave, acc] of mapa.entries()) {
            const [fecha, bloque] = clave.split("_")
            const convIds = Array.from(acc.conversaciones).map(BigInt)
            const esActivo = fecha === activaFecha && bloque === activoBloque

            await prisma.$executeRaw`
                INSERT INTO bot_cola_historico (
                    fecha,
                    bloque,
                    mensajes_encolados,
                    conversaciones_encoladas,
                    conversaciones_ids,
                    estado,
                    primero_en,
                    ultimo_en,
                    despachado_en,
                    creado_en,
                    actualizado_en
                ) VALUES (
                    ${fecha}::date,
                    ${bloque},
                    ${acc.mensajes},
                    ${acc.conversaciones.size},
                    ${convIds}::bigint[],
                    ${esActivo ? "acumulando" : "despachado"},
                    ${acc.primeroEn},
                    ${acc.ultimoEn},
                    ${esActivo ? null : acc.ultimoEn},
                    ${acc.primeroEn},
                    now()
                )
                ON CONFLICT (fecha, bloque) DO UPDATE SET
                    mensajes_encolados = GREATEST(bot_cola_historico.mensajes_encolados, EXCLUDED.mensajes_encolados),
                    conversaciones_encoladas = GREATEST(bot_cola_historico.conversaciones_encoladas, EXCLUDED.conversaciones_encoladas),
                    primero_en = LEAST(bot_cola_historico.primero_en, EXCLUDED.primero_en),
                    ultimo_en = GREATEST(bot_cola_historico.ultimo_en, EXCLUDED.ultimo_en),
                    estado = EXCLUDED.estado,
                    despachado_en = EXCLUDED.despachado_en
            `
            insertados++
        }

        return { insertados }
    } catch (err) {
        console.error("[cola-historico] Error en backfillHistoricoDesdeTurnos:", err)
        return { insertados: 0 }
    }
}
