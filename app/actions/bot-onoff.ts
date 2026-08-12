"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-guard"
import {
    contarPendientes,
    getEstadoBot,
    getHorarios,
    guardarHorarios,
    setEstadoBot,
    setHorarioAutomatico,
    tieneTokenChatwoot,
    type EstadoRespuesta,
    type HorarioDia,
    type RespuestaPendiente,
} from "@/lib/chatwoot-bot"
import { despachoEnCurso, despacharColaEnSegundoPlano, sincronizarEstadoBot } from "@/lib/chatwoot-cola"

// Botón ON/OFF del bot de WhatsApp y manejo de la cola de respuestas que se
// generaron con el local cerrado. Ver n8n-workflows/bot-onoff.sql.

export type RespuestaEnCola = {
    id: number
    conversationId: number
    accountId: number
    contacto: string | null
    contenido: string
    origen: string
    fotoUrl: string | null
    estado: EstadoRespuesta
    motivo: string | null
    creadoEn: string
    enviadoEn: string | null
}

export type PanelBot = {
    encendido: boolean
    actualizadoEn: string | null
    actualizadoPor: string | null
    horarioAutomatico: boolean
    pendientes: number
    despachando: boolean
    /** false = falta CHATWOOT_API_TOKEN en el servicio de la web */
    tokenChatwoot: boolean
    cola: RespuestaEnCola[]
}

const ERROR_TABLAS =
    "No se pudo leer bot_estado / respuestas_pendientes. Si es la primera vez, corré " +
    "n8n-workflows/bot-onoff.sql una vez en el Postgres del bot."

function serializar(fila: RespuestaPendiente): RespuestaEnCola {
    return {
        id: fila.id,
        conversationId: Number(fila.conversation_id),
        accountId: Number(fila.account_id),
        contacto: fila.contacto,
        contenido: fila.contenido,
        origen: fila.origen,
        fotoUrl: fila.foto_url,
        estado: fila.estado,
        motivo: fila.motivo,
        creadoEn: fila.creado_en.toISOString(),
        enviadoEn: fila.enviado_en ? fila.enviado_en.toISOString() : null,
    }
}

async function quienSoy() {
    const session = await requireAdmin()
    return session.user?.name || (session.user as any)?.email || "admin"
}

export async function obtenerPanelBot(): Promise<PanelBot> {
    await requireAdmin()
    try {
        // sincronizarEstadoBot (no getEstadoBot) para que cargar esta pantalla
        // también dispare la reconciliación del horario automático, igual que
        // cada mensaje entrante.
        const estado = await sincronizarEstadoBot()
        const pendientes = await contarPendientes()
        // Lo ya enviado se muestra un rato para poder confirmar que salió; más
        // atrás no interesa (el historial real está en Chatwoot).
        const cola = await prisma.$queryRaw<RespuestaPendiente[]>`
            SELECT * FROM respuestas_pendientes
            WHERE estado IN ('pendiente', 'enviando', 'error')
               OR (estado IN ('enviado', 'descartado') AND creado_en > now() - interval '2 days')
            ORDER BY id
        `
        return {
            encendido: estado.encendido,
            actualizadoEn: estado.actualizadoEn ? estado.actualizadoEn.toISOString() : null,
            actualizadoPor: estado.actualizadoPor,
            horarioAutomatico: estado.horarioAutomatico,
            pendientes,
            despachando: despachoEnCurso(),
            tokenChatwoot: tieneTokenChatwoot(),
            cola: cola.map(serializar),
        }
    } catch (error) {
        console.error("Error al leer el estado del bot:", error)
        throw new Error(ERROR_TABLAS)
    }
}

export async function alternarBot(encendido: boolean) {
    const quien = await quienSoy()

    const estadoActual = await getEstadoBot()
    if (estadoActual.horarioAutomatico) {
        throw new Error("El horario automático está activo — apagalo para tomar control manual del bot.")
    }

    await setEstadoBot(encendido, quien)

    let pendientes = 0
    if (encendido) {
        pendientes = await contarPendientes()
        // No bloqueamos la respuesta al navegador: el despacho es escalonado y
        // puede tardar minutos si hay muchas respuestas juntas.
        if (pendientes > 0) despacharColaEnSegundoPlano()
    }

    revalidatePath("/admin/chatwoot")
    revalidatePath("/admin/chatwoot/cola")
    return { encendido, pendientes }
}

/** Manda lo que haya en la cola aunque el bot esté apagado. */
export async function despacharColaAhora() {
    await requireAdmin()
    despacharColaEnSegundoPlano({ forzar: true })
    return { success: true }
}

export async function descartarRespuesta(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`
        UPDATE respuestas_pendientes
        SET estado = 'descartado', motivo = 'Descartada a mano desde la web'
        WHERE id = ${id} AND estado IN ('pendiente', 'enviando', 'error')
    `
    revalidatePath("/admin/chatwoot/cola")
}

export async function descartarConversacion(conversationId: number) {
    await requireAdmin()
    await prisma.$executeRaw`
        UPDATE respuestas_pendientes
        SET estado = 'descartado', motivo = 'Descartada a mano desde la web'
        WHERE conversation_id = ${conversationId} AND estado IN ('pendiente', 'enviando', 'error')
    `
    revalidatePath("/admin/chatwoot/cola")
}

export async function descartarTodo() {
    await requireAdmin()
    const filas = await prisma.$executeRaw`
        UPDATE respuestas_pendientes
        SET estado = 'descartado', motivo = 'Descartada a mano desde la web'
        WHERE estado IN ('pendiente', 'enviando', 'error')
    `
    revalidatePath("/admin/chatwoot/cola")
    return { descartadas: Number(filas) }
}

/** Vuelve a poner en cola algo que quedó en error o trabado en "enviando". */
export async function reintentarRespuesta(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`
        UPDATE respuestas_pendientes
        SET estado = 'pendiente', motivo = NULL
        WHERE id = ${id} AND estado IN ('error', 'enviando', 'descartado')
    `
    revalidatePath("/admin/chatwoot/cola")
}

/**
 * Vuelve a encolar todo lo que falló de una. Es lo que hace falta después de
 * arreglar la causa común (por ejemplo, cargar el token de Chatwoot que le
 * faltaba a la app): sin esto habría que reintentar respuesta por respuesta.
 */
export async function reintentarFallidas() {
    await requireAdmin()
    const filas = await prisma.$executeRaw`
        UPDATE respuestas_pendientes
        SET estado = 'pendiente', motivo = NULL
        WHERE estado IN ('error', 'enviando')
    `
    const { encendido } = await getEstadoBot()
    if (encendido && Number(filas) > 0) despacharColaEnSegundoPlano()

    revalidatePath("/admin/chatwoot")
    revalidatePath("/admin/chatwoot/cola")
    return { reencoladas: Number(filas) }
}

/** Corrige el texto antes de que salga (por ejemplo si cambió un precio). */
export async function editarRespuesta(id: number, contenido: string) {
    await requireAdmin()
    const texto = contenido.trim()
    if (!texto) throw new Error("El mensaje no puede quedar vacío")
    await prisma.$executeRaw`
        UPDATE respuestas_pendientes
        SET contenido = ${texto}
        WHERE id = ${id} AND estado IN ('pendiente', 'error')
    `
    revalidatePath("/admin/chatwoot/cola")
}

// Horario comercial automático. Ver n8n-workflows/bot-horario.sql.

export type HorarioBot = {
    automatico: boolean
    dias: HorarioDia[]
}

export async function obtenerHorarioBot(): Promise<HorarioBot> {
    await requireAdmin()
    const estado = await getEstadoBot()
    const dias = await getHorarios()
    return { automatico: estado.horarioAutomatico, dias }
}

/**
 * Prende o apaga el modo automático. Al prenderlo, reconcilia el estado del
 * bot contra el horario ahí mismo (no hace falta esperar al próximo mensaje
 * o a la próxima carga de pantalla para que el cambio se note).
 */
export async function alternarHorarioAutomatico(activo: boolean) {
    const quien = await quienSoy()
    await setHorarioAutomatico(activo, quien)
    if (activo) await sincronizarEstadoBot()

    revalidatePath("/admin/chatwoot")
    revalidatePath("/admin/chatwoot/horario")
    return { automatico: activo }
}

export async function guardarHorarioBot(dias: HorarioDia[]) {
    await requireAdmin()
    await guardarHorarios(dias)

    // Si el automático ya estaba prendido, un cambio de horario puede abrir o
    // cerrar el bot en el acto (ej. extender el cierre de hoy).
    await sincronizarEstadoBot()

    revalidatePath("/admin/chatwoot")
    revalidatePath("/admin/chatwoot/horario")
}
