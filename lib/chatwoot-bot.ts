import { prisma } from "@/lib/prisma"

// Capa compartida entre el endpoint que llama n8n (/api/chatwoot/enviar), el
// despachador de la cola y la pantalla de administración. Todo lo que sabe
// hablar con Chatwoot vive acá.
//
// Tablas: bot_estado y respuestas_pendientes (ver n8n-workflows/bot-onoff.sql).

export type OrigenRespuesta =
    | "respuesta"
    | "aprendizaje_tecnico"
    | "aprendizaje_negocio"
    | "aprendizaje_precio"
    | "saludo_kit"
    | "pregunta_ambigua"

export type EstadoRespuesta = "pendiente" | "enviando" | "enviado" | "descartado" | "error"

export type RespuestaPendiente = {
    id: number
    conversation_id: bigint
    account_id: bigint
    contacto: string | null
    contenido: string
    origen: string
    foto_url: string | null
    estado: EstadoRespuesta
    motivo: string | null
    creado_en: Date
    enviado_en: Date | null
}

export type EstadoBot = {
    encendido: boolean
    actualizadoEn: Date | null
    actualizadoPor: string | null
    horarioAutomatico: boolean
}

export type HorarioDia = {
    diaSemana: number // 0=domingo ... 6=sábado, igual que Date.getUTCDay()
    activo: boolean
    abreMinutos: number // minutos desde medianoche, hora Argentina
    cierraMinutos: number
}

export function chatwootConfig() {
    const api = process.env.CHATWOOT_API_URL || "https://chat.revolucionmotos.tech/api/v1"
    const token = process.env.CHATWOOT_API_TOKEN || ""
    // El workflow distingue "contestó un humano" de "es el eco de mi propio
    // mensaje" comparando sender.id contra este id (nodo Config Chatwoot).
    const botUserId = Number(process.env.CHATWOOT_BOT_USER_ID || 2)
    return { api: api.replace(/\/$/, ""), token, botUserId }
}

/**
 * Token de un agente humano (no el del bot) para que la app pueda responder
 * las notas privadas de escalado en nombre del equipo. Tiene que ser una
 * identidad de Chatwoot distinta al usuario Bot: el nodo "¿Es respuesta de mi
 * equipo?" del workflow ignora a propósito cualquier mensaje cuyo sender.id
 * coincida con CHATWOOT_BOT_USER_ID, para no confundir el eco del propio bot
 * con una respuesta real. Si se reutilizara CHATWOOT_API_TOKEN acá, n8n
 * descartaría la nota en silencio.
 */
function chatwootConfigEquipo() {
    const { api } = chatwootConfig()
    const token = process.env.CHATWOOT_ADMIN_API_TOKEN || ""
    return { api, token }
}

export function tieneTokenEquipo() {
    return Boolean(chatwootConfigEquipo().token)
}

export async function getEstadoBot(): Promise<EstadoBot> {
    const filas = await prisma.$queryRaw<
        { encendido: boolean; actualizado_en: Date; actualizado_por: string | null; horario_automatico: boolean }[]
    >`
        SELECT encendido, actualizado_en, actualizado_por, horario_automatico FROM bot_estado WHERE id = 1
    `
    // Sin fila (base recién creada) el bot se considera encendido: es el
    // comportamiento que tenía antes de existir el botón.
    if (filas.length === 0) return { encendido: true, actualizadoEn: null, actualizadoPor: null, horarioAutomatico: false }
    return {
        encendido: filas[0].encendido,
        actualizadoEn: filas[0].actualizado_en,
        actualizadoPor: filas[0].actualizado_por,
        horarioAutomatico: filas[0].horario_automatico,
    }
}

export async function setEstadoBot(encendido: boolean, quien: string) {
    await prisma.$executeRaw`
        INSERT INTO bot_estado (id, encendido, actualizado_en, actualizado_por)
        VALUES (1, ${encendido}, now(), ${quien})
        ON CONFLICT (id) DO UPDATE
        SET encendido = ${encendido}, actualizado_en = now(), actualizado_por = ${quien}
    `
}

/**
 * Prende o apaga el modo horario automático. Con el automático activo, el
 * horario cargado en bot_horario manda solo sobre bot_estado.encendido (ver
 * sincronizarHorarioAutomatico) y el botón manual queda deshabilitado en la
 * UI: evita la ambigüedad de "quién decidió el estado actual".
 */
export async function setHorarioAutomatico(activo: boolean, quien: string) {
    await prisma.$executeRaw`
        INSERT INTO bot_estado (id, encendido, actualizado_en, actualizado_por, horario_automatico)
        VALUES (1, true, now(), ${quien}, ${activo})
        ON CONFLICT (id) DO UPDATE
        SET horario_automatico = ${activo}, actualizado_en = now(), actualizado_por = ${quien}
    `
}

export async function getHorarios(): Promise<HorarioDia[]> {
    const filas = await prisma.$queryRaw<
        { dia_semana: number; activo: boolean; abre_minutos: number; cierra_minutos: number }[]
    >`
        SELECT dia_semana, activo, abre_minutos, cierra_minutos FROM bot_horario ORDER BY dia_semana
    `
    return filas.map((f) => ({
        diaSemana: f.dia_semana,
        activo: f.activo,
        abreMinutos: f.abre_minutos,
        cierraMinutos: f.cierra_minutos,
    }))
}

export async function guardarHorarios(dias: HorarioDia[]) {
    for (const dia of dias) {
        if (dia.diaSemana < 0 || dia.diaSemana > 6) throw new Error(`día inválido: ${dia.diaSemana}`)
        if (dia.activo && dia.cierraMinutos <= dia.abreMinutos) {
            throw new Error("El horario de cierre tiene que ser posterior al de apertura")
        }
        await prisma.$executeRaw`
            UPDATE bot_horario
            SET activo = ${dia.activo}, abre_minutos = ${dia.abreMinutos}, cierra_minutos = ${dia.cierraMinutos}
            WHERE dia_semana = ${dia.diaSemana}
        `
    }
}

/** Día de la semana (0=domingo..6=sábado) y minuto del día, en hora Argentina
 * (UTC-3 fijo, sin horario de verano — mismo criterio que el resto del
 * proyecto, ver getEtiquetasPreparadas en app/actions/envios.ts). Se calcula
 * corriendo el reloj UTC 3 horas para atrás en vez de usar la zona horaria
 * del proceso, así da igual dónde corra el servidor. */
function ahoraEnArgentina() {
    const desplazado = new Date(Date.now() - 3 * 60 * 60 * 1000)
    return {
        diaSemana: desplazado.getUTCDay(),
        minutosDelDia: desplazado.getUTCHours() * 60 + desplazado.getUTCMinutes(),
    }
}

export function calcularDebeEstarAbierto(
    horarios: HorarioDia[],
    ahora: { diaSemana: number; minutosDelDia: number }
): boolean {
    const dia = horarios.find((h) => h.diaSemana === ahora.diaSemana)
    if (!dia || !dia.activo) return false
    return ahora.minutosDelDia >= dia.abreMinutos && ahora.minutosDelDia < dia.cierraMinutos
}

/**
 * Punto de entrada para que el horario automático se aplique solo: se llama
 * desde cualquier lugar que ya iba a leer el estado del bot (cada mensaje que
 * llega por /api/chatwoot/enviar, y cada carga de /admin/chatwoot). Si el
 * automático está activo y el horario dice algo distinto de lo que hay
 * guardado, corrige bot_estado ahí mismo — no depende de un cron aparte.
 */
export async function sincronizarHorarioAutomatico(): Promise<EstadoBot & { cambio: boolean }> {
    const estado = await getEstadoBot()
    if (!estado.horarioAutomatico) return { ...estado, cambio: false }

    const horarios = await getHorarios()
    const debeEstarAbierto = calcularDebeEstarAbierto(horarios, ahoraEnArgentina())
    if (debeEstarAbierto === estado.encendido) return { ...estado, cambio: false }

    await setEstadoBot(debeEstarAbierto, "horario automático")
    return { ...estado, encendido: debeEstarAbierto, cambio: true }
}

/** Manda el mensaje al cliente por Chatwoot. Tira si Chatwoot no lo acepta. */
export async function enviarMensajeChatwoot(params: {
    accountId: number | bigint
    conversationId: number | bigint
    content: string
}) {
    const { api, token } = chatwootConfig()
    if (!token) throw new Error("Falta CHATWOOT_API_TOKEN en el entorno de la app")

    const url = `${api}/accounts/${params.accountId}/conversations/${params.conversationId}/messages`
    const res = await fetch(url, {
        method: "POST",
        headers: { api_access_token: token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: params.content, message_type: "outgoing" }),
    })

    if (!res.ok) {
        const detalle = await res.text().catch(() => "")
        throw new Error(`Chatwoot respondió ${res.status}: ${detalle.slice(0, 300)}`)
    }
    return res.json().catch(() => ({}))
}

const FOTO_TAMANO_MAXIMO = 5 * 1024 * 1024 // 5MB, límite típico de imagen en WhatsApp/Chatwoot
const FOTO_TIMEOUT_MS = 15000

/**
 * Manda una foto al cliente por Chatwoot como adjunto (sin caption, se manda
 * siempre justo después de un mensaje de texto). A diferencia de
 * enviarMensajeChatwoot, la API de creación de mensajes de Chatwoot no acepta
 * una URL para el adjunto: hay que bajar los bytes de la imagen (sea una URL
 * externa que pegó el admin, o la de nuestro propio proxy de S3) y mandarlos
 * como multipart/form-data. Tira si no se puede bajar la imagen o Chatwoot no
 * la acepta — el llamador decide si eso debe tumbar el resto de la respuesta
 * (no debería: el texto ya se mandó antes).
 */
export async function enviarImagenChatwoot(params: {
    accountId: number | bigint
    conversationId: number | bigint
    fotoUrl: string
}) {
    const { api, token } = chatwootConfig()
    if (!token) throw new Error("Falta CHATWOOT_API_TOKEN en el entorno de la app")

    let url: URL
    try {
        url = new URL(params.fotoUrl)
    } catch {
        throw new Error(`foto_url inválida: ${params.fotoUrl}`)
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`foto_url tiene que ser http(s): ${params.fotoUrl}`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FOTO_TIMEOUT_MS)
    let bytes: ArrayBuffer
    let contentType: string
    try {
        const descarga = await fetch(url, { signal: controller.signal })
        if (!descarga.ok) throw new Error(`No se pudo descargar la foto (${descarga.status})`)
        contentType = descarga.headers.get("content-type") || "image/jpeg"
        const contentLength = Number(descarga.headers.get("content-length") || 0)
        if (contentLength > FOTO_TAMANO_MAXIMO) throw new Error("La foto del kit supera los 5MB")
        bytes = await descarga.arrayBuffer()
        if (bytes.byteLength > FOTO_TAMANO_MAXIMO) throw new Error("La foto del kit supera los 5MB")
    } finally {
        clearTimeout(timeoutId)
    }

    const extension = (contentType.split("/")[1] || "jpg").split(";")[0]
    const form = new FormData()
    form.append("message_type", "outgoing")
    form.append("attachments[]", new Blob([bytes], { type: contentType }), `kit.${extension}`)

    const chatwootUrl = `${api}/accounts/${params.accountId}/conversations/${params.conversationId}/messages`
    const res = await fetch(chatwootUrl, {
        method: "POST",
        headers: { api_access_token: token },
        body: form,
    })

    if (!res.ok) {
        const detalle = await res.text().catch(() => "")
        throw new Error(`Chatwoot respondió ${res.status} al mandar la foto: ${detalle.slice(0, 300)}`)
    }
    return res.json().catch(() => ({}))
}

/**
 * Manda una nota privada a Chatwoot como si la escribiera el equipo a mano,
 * para resolver una pregunta pendiente que el bot escaló (ver
 * "Escalar - Nota Privada" / "¿Es respuesta de mi equipo?" en el workflow).
 * Usa CHATWOOT_ADMIN_API_TOKEN (identidad de un agente real), nunca el token
 * del bot. El cliente no ve esta nota — la respuesta que sí le llega la arma
 * y la manda el workflow una vez que extrae el dato de acá.
 */
export async function enviarNotaPrivadaChatwoot(params: {
    accountId: number | bigint
    conversationId: number | bigint
    content: string
}) {
    const { api } = chatwootConfig()
    const { token } = chatwootConfigEquipo()
    if (!token) throw new Error("Falta CHATWOOT_ADMIN_API_TOKEN en el entorno de la app")

    const url = `${api}/accounts/${params.accountId}/conversations/${params.conversationId}/messages`
    const res = await fetch(url, {
        method: "POST",
        headers: { api_access_token: token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: params.content, message_type: "outgoing", private: true }),
    })

    if (!res.ok) {
        const detalle = await res.text().catch(() => "")
        throw new Error(`Chatwoot respondió ${res.status}: ${detalle.slice(0, 300)}`)
    }
    return res.json().catch(() => ({}))
}

/**
 * ¿Contestó un humano en esta conversación después de `desde`?
 *
 * Reemplaza al chequeo de `bot_pausado` en Redis (que la app no lee) y de paso
 * es más confiable: pregunta por los mensajes reales de la conversación en vez
 * de por una marca que pudo no llegar a escribirse. Un mensaje saliente de un
 * agente que no sea el usuario "Bot" significa que alguien del equipo ya
 * atendió esa charla a mano: la respuesta pre-generada se descarta.
 *
 * Si Chatwoot no contesta, devuelve false (preferimos mandar la respuesta antes
 * que perderla por un error de red).
 */
export async function humanoRespondioDespues(
    accountId: number | bigint,
    conversationId: number | bigint,
    desde: Date
): Promise<boolean> {
    const { api, token, botUserId } = chatwootConfig()
    if (!token) return false

    try {
        const res = await fetch(`${api}/accounts/${accountId}/conversations/${conversationId}/messages`, {
            headers: { api_access_token: token },
        })
        if (!res.ok) return false

        const data = await res.json()
        const mensajes: any[] = Array.isArray(data?.payload) ? data.payload : []

        return mensajes.some((m) => {
            // message_type: 0 = incoming, 1 = outgoing, 2 = activity.
            const esSaliente = m?.message_type === 1 || m?.message_type === "outgoing"
            if (!esSaliente || m?.private) return false
            if (m?.sender?.type !== "user") return false
            if (Number(m?.sender?.id) === botUserId) return false
            const creado = typeof m?.created_at === "number" ? m.created_at * 1000 : Date.parse(m?.created_at ?? "")
            return Number.isFinite(creado) && creado > desde.getTime()
        })
    } catch (error) {
        console.error("No se pudo consultar la conversación en Chatwoot:", error)
        return false
    }
}

export async function encolarRespuesta(params: {
    accountId: number
    conversationId: number
    contacto: string | null
    contenido: string
    origen: string
    fotoUrl?: string | null
}) {
    const filas = await prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO respuestas_pendientes (conversation_id, account_id, contacto, contenido, origen, foto_url)
        VALUES (${params.conversationId}, ${params.accountId}, ${params.contacto}, ${params.contenido}, ${params.origen}, ${params.fotoUrl ?? null})
        RETURNING id
    `
    return filas[0].id
}

/**
 * ¿La app tiene con qué hablarle a Chatwoot? Sin token el bot igual encola todo,
 * pero al prenderlo cada respuesta falla de a una. Conviene avisarlo antes.
 */
export function tieneTokenChatwoot() {
    return Boolean(chatwootConfig().token)
}

export async function contarPendientes(): Promise<number> {
    const filas = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM respuestas_pendientes WHERE estado IN ('pendiente', 'enviando', 'error')
    `
    return Number(filas[0]?.n ?? 0)
}
