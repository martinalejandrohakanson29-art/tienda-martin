import { prisma } from "@/lib/prisma"
import { chatwootConfig } from "@/lib/chatwoot-bot"

// Espejo local de conversaciones reales de Chatwoot en PostgreSQL
// (tabla chatwoot_conversaciones_espejo).
//
// Permite que /admin/chatwoot/chats-vivo cargue de forma instantánea (< 20ms)
// directamente desde la base de datos local, cruzando las categorías con las
// 4 tablas de pendientes, sin bloquear el SSR ni saturar la API externa de
// Chatwoot con loops de paginado síncronos.

const ACCOUNT_ID = 1
const TOPE_PAGINAS_BACKFILL = 8

export type Categoria = "tecnica" | "negocio" | "precio" | "sin_match" | "sin_etiqueta"

export type ConversacionVivo = {
    id: number
    nombre: string
    telefono: string
    iniciales: string
    colorAvatar: string
    categoria: Categoria
    status: string
    ultimoMensaje: string
    ultimoMensajePropio: boolean
    horaEtiqueta: string
    ultimaActividad: string // ISO
    noLeidos: number
    botPausado: boolean
}

export type PanelChatsVivo = {
    conversaciones: ConversacionVivo[]
    periodoDias: number
    actualizadoEn: string
}

const PALETA_AVATAR = [
    "bg-emerald-500",
    "bg-rose-500",
    "bg-indigo-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-teal-500",
    "bg-pink-500",
]

function colorAvatar(id: number) {
    return PALETA_AVATAR[id % PALETA_AVATAR.length]
}

function iniciales(nombre: string) {
    if (!nombre) return "?"
    // Extraer solo letras y números para las iniciales principales
    const limpio = nombre.replace(/[^\p{L}\p{N}\s]/gu, " ").trim()
    const partes = limpio.split(/\s+/).filter(Boolean)
    if (partes.length === 0) {
        // Si no hay letras (ej: nombre compuesto solo de emojis o símbolos), tomar el primer grafema seguro
        const caracteres = Array.from(nombre.trim())
        return (caracteres[0] || "?").toUpperCase()
    }
    if (partes.length === 1) {
        const chars = Array.from(partes[0])
        return chars.slice(0, 2).join("").toUpperCase()
    }
    const c1 = Array.from(partes[0])[0] || ""
    const c2 = Array.from(partes[1])[0] || ""
    return (c1 + c2).toUpperCase()
}

const TZ_ARGENTINA = "America/Argentina/Buenos_Aires"

/** "10:24" si es hoy (hora Argentina), "ayer" si fue ayer, "24/08" si es más viejo. */
function etiquetaHora(epochSeg: number) {
    const fecha = new Date(epochSeg * 1000)
    const diaFecha = fecha.toLocaleDateString("sv-SE", { timeZone: TZ_ARGENTINA })
    const diaHoy = new Date().toLocaleDateString("sv-SE", { timeZone: TZ_ARGENTINA })
    const diaAyer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", { timeZone: TZ_ARGENTINA })

    if (diaFecha === diaHoy) {
        return fecha.toLocaleTimeString("es-AR", { timeZone: TZ_ARGENTINA, hour: "2-digit", minute: "2-digit" })
    }
    if (diaFecha === diaAyer) return "ayer"
    return fecha.toLocaleDateString("es-AR", { timeZone: TZ_ARGENTINA, day: "2-digit", month: "2-digit" })
}

async function chatwootFetch(path: string) {
    const { api, token } = chatwootConfig()
    if (!token) throw new Error("Falta CHATWOOT_API_TOKEN en el entorno de la app")

    const res = await fetch(`${api}${path}`, { headers: { api_access_token: token } })
    if (!res.ok) {
        const detalle = await res.text().catch(() => "")
        throw new Error(`Chatwoot respondió ${res.status} en ${path}: ${detalle.slice(0, 200)}`)
    }
    return res.json()
}

let tablaAsegurada = false

/** Asegura que la tabla chatwoot_conversaciones_espejo exista en PostgreSQL. */
export async function asegurarTablaEspejo() {
    if (tablaAsegurada) return
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS chatwoot_conversaciones_espejo (
                id                  bigint PRIMARY KEY,
                account_id          bigint NOT NULL DEFAULT 1,
                inbox_id            bigint,
                nombre              text NOT NULL,
                telefono            text NOT NULL DEFAULT '',
                status              text NOT NULL DEFAULT 'open',
                ultimo_mensaje      text NOT NULL DEFAULT '',
                ultimo_mensaje_propio boolean NOT NULL DEFAULT false,
                no_leidos           integer NOT NULL DEFAULT 0,
                bot_pausado         boolean NOT NULL DEFAULT false,
                ultima_actividad    timestamptz NOT NULL DEFAULT now(),
                creado_en           timestamptz NOT NULL DEFAULT now(),
                actualizado_en      timestamptz NOT NULL DEFAULT now()
            )
        `)
        await prisma.$executeRawUnsafe(`
            ALTER TABLE chatwoot_conversaciones_espejo
            ADD COLUMN IF NOT EXISTS bot_pausado boolean NOT NULL DEFAULT false
        `)
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS idx_chatwoot_espejo_actividad
                ON chatwoot_conversaciones_espejo (ultima_actividad DESC)
        `)
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS idx_chatwoot_espejo_telefono
                ON chatwoot_conversaciones_espejo (telefono)
        `)
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS idx_chatwoot_espejo_status
                ON chatwoot_conversaciones_espejo (status)
        `)
        tablaAsegurada = true
    } catch (e) {
        console.error("Error asegurando tabla espejo de chatwoot:", e)
        throw e
    }
}

/** Guarda o actualiza conversaciones crudas de Chatwoot en la tabla espejo. */
export async function guardarConversacionesEnEspejo(items: any[]) {
    if (!items || items.length === 0) return
    await asegurarTablaEspejo()

    for (const c of items) {
        try {
            const sender = c?.meta?.sender
            const nombre = (sender?.name || sender?.phone_number || `Conversación ${c.id}`).toString().slice(0, 200)
            const telefono = (sender?.phone_number || "").toString().slice(0, 50)
            const ultimo = c?.last_non_activity_message || c?.messages?.[c.messages?.length - 1]
            let ultimoMensaje = ((ultimo?.content || "").toString().trim()).slice(0, 1000)
            if (!ultimoMensaje) {
                const att = ultimo?.attachments?.[0]
                if (att) {
                    const tipo = (att.file_type || "").toString().toLowerCase()
                    if (tipo === "image") ultimoMensaje = "📷 Foto"
                    else if (tipo === "audio") ultimoMensaje = "🎤 Audio"
                    else if (tipo === "video") ultimoMensaje = "🎥 Video"
                    else ultimoMensaje = "📎 Archivo"
                } else {
                    ultimoMensaje = "(sin texto)"
                }
            }
            const ultimoMensajePropio = ultimo?.message_type === 1 || ultimo?.message_type === "outgoing"
            const noLeidos = Number(c?.unread_count || 0)
            const epochActividad = Number(c?.last_activity_at ?? c?.timestamp ?? 0)
            const fechaActividad = epochActividad > 0 ? new Date(epochActividad * 1000) : new Date()
            const epochCreado = Number(c?.created_at ?? 0)
            const fechaCreado = epochCreado > 0 ? new Date(epochCreado * 1000) : new Date()
            const inboxId = c?.inbox_id ? BigInt(c.inbox_id) : null

            await prisma.$executeRaw`
                INSERT INTO chatwoot_conversaciones_espejo (
                    id, account_id, inbox_id, nombre, telefono, status,
                    ultimo_mensaje, ultimo_mensaje_propio, no_leidos,
                    ultima_actividad, creado_en, actualizado_en
                ) VALUES (
                    ${BigInt(c.id)}, ${BigInt(ACCOUNT_ID)}, ${inboxId}, ${nombre}, ${telefono}, ${status},
                    ${ultimoMensaje}, ${ultimoMensajePropio}, ${noLeidos},
                    ${fechaActividad}, ${fechaCreado}, NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    telefono = EXCLUDED.telefono,
                    status = EXCLUDED.status,
                    ultimo_mensaje = EXCLUDED.ultimo_mensaje,
                    ultimo_mensaje_propio = EXCLUDED.ultimo_mensaje_propio,
                    no_leidos = EXCLUDED.no_leidos,
                    ultima_actividad = EXCLUDED.ultima_actividad,
                    actualizado_en = NOW()
            `
        } catch (err) {
            console.error(`Error guardando conversacion ${c?.id} en espejo:`, err)
        }
    }
}

/** Sincroniza páginas de Chatwoot a la base de datos local en PostgreSQL. */
export async function sincronizarEspejoChatwoot(maxPaginas = 1): Promise<{ total: number }> {
    let totalGuardados = 0
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        try {
            const j = await chatwootFetch(`/accounts/${ACCOUNT_ID}/conversations?status=all&page=${pagina}`)
            const items: any[] = j?.data?.payload || []
            if (items.length === 0) break
            await guardarConversacionesEnEspejo(items)
            totalGuardados += items.length
            if (items.length < 25) break
        } catch (e) {
            console.error(`Error sincronizando pagina ${pagina} de chatwoot:`, e)
            break
        }
    }
    return { total: totalGuardados }
}

/**
 * Categoría por conversación, cruzando contra las 4 tablas de pendientes
 * (mismo criterio que listarPendientesEquipo, pero solo la clasificación, sin
 * traer el detalle). Si una conversación aparece en más de una tabla a la vez
 * (no debería pasar en el flujo normal), gana la más específica: técnica >
 * negocio > precio > sin_match.
 */
async function categoriasPorConversacion(ids: number[]): Promise<Map<number, Categoria>> {
    if (ids.length === 0) return new Map()
    const idsBigint = ids.map((id) => BigInt(id))

    const filas = await prisma.$queryRaw<{ conversation_id: bigint; categoria: string }[]>`
        SELECT DISTINCT conversation_id, 'tecnica' as categoria FROM preguntas_tecnicas_pendientes
        WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        UNION ALL
        SELECT DISTINCT conversation_id, 'negocio' as categoria FROM preguntas_negocio_pendientes
        WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        UNION ALL
        SELECT DISTINCT conversation_id, 'precio' as categoria FROM preguntas_precio_pendientes
        WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        UNION ALL
        SELECT DISTINCT conversation_id, 'sin_match' as categoria FROM preguntas_sin_match_pendientes
        WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
    `

    const peso: Record<string, number> = {
        sin_match: 1,
        precio: 2,
        negocio: 3,
        tecnica: 4,
    }

    const mapa = new Map<number, Categoria>()
    for (const f of filas) {
        const id = Number(f.conversation_id)
        const cat = f.categoria as Categoria
        const catActual = mapa.get(id)
        if (!catActual || (peso[cat] || 0) > (peso[catActual] || 0)) {
            mapa.set(id, cat)
        }
    }
    return mapa
}

/**
 * Trae conversaciones directamente desde la tabla espejo en PostgreSQL en < 10ms.
 * Si la tabla está vacía (primer arranque), efectúa un backfill inicial desde Chatwoot.
 */
export async function listarChatsVivo(periodoDias: number): Promise<PanelChatsVivo> {
    await asegurarTablaEspejo()

    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM chatwoot_conversaciones_espejo
    `

    if (Number(count) === 0) {
        // Backfill inicial si la tabla local está totalmente vacía
        await sincronizarEspejoChatwoot(TOPE_PAGINAS_BACKFILL)
    }

    const cutoffDate = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000)

    const filas = await prisma.$queryRaw<{
        id: bigint
        nombre: string
        telefono: string
        status: string
        ultimo_mensaje: string
        ultimo_mensaje_propio: boolean
        no_leidos: number
        bot_pausado: boolean
        ultima_actividad: Date
    }[]>`
        SELECT id, nombre, telefono, status, ultimo_mensaje, ultimo_mensaje_propio, no_leidos, bot_pausado, ultima_actividad
        FROM chatwoot_conversaciones_espejo
        WHERE ultima_actividad >= ${cutoffDate}
        ORDER BY ultima_actividad DESC
    `

    const ids = filas.map((f) => Number(f.id))
    const categorias = await categoriasPorConversacion(ids)

    const conversaciones: ConversacionVivo[] = filas.map((f) => {
        const idNum = Number(f.id)
        const epochSeg = Math.floor(f.ultima_actividad.getTime() / 1000)
        return {
            id: idNum,
            nombre: f.nombre,
            telefono: f.telefono,
            iniciales: iniciales(f.nombre),
            colorAvatar: colorAvatar(idNum),
            categoria: categorias.get(idNum) ?? "sin_etiqueta",
            status: f.status,
            ultimoMensaje: f.ultimo_mensaje || "(sin texto)",
            ultimoMensajePropio: f.ultimo_mensaje_propio,
            horaEtiqueta: etiquetaHora(epochSeg),
            ultimaActividad: f.ultima_actividad.toISOString(),
            noLeidos: f.no_leidos,
            botPausado: Boolean(f.bot_pausado),
        }
    })

    return { conversaciones, periodoDias, actualizadoEn: new Date().toISOString() }
}

/** Actualiza el estado bot_pausado de una conversación en la tabla espejo. */
export async function actualizarBotPausadoEnEspejo(conversationId: number, botPausado: boolean) {
    await asegurarTablaEspejo()
    await prisma.$executeRaw`
        UPDATE chatwoot_conversaciones_espejo
        SET bot_pausado = ${botPausado}, actualizado_en = NOW()
        WHERE id = ${BigInt(conversationId)}
    `
}

/** Actualiza el último mensaje y pausa del bot al enviar un mensaje saliente manual. */
export async function registrarMensajeSalienteEnEspejo(conversationId: number, contenido: string) {
    await asegurarTablaEspejo()
    await prisma.$executeRaw`
        UPDATE chatwoot_conversaciones_espejo
        SET ultimo_mensaje = ${contenido.slice(0, 1000)},
            ultimo_mensaje_propio = true,
            bot_pausado = true,
            ultima_actividad = NOW(),
            actualizado_en = NOW()
        WHERE id = ${BigInt(conversationId)}
    `
}

/** Pone en 0 el contador de mensajes no leídos para una conversación en la tabla espejo. */
export async function resetearNoLeidosEnEspejo(conversationId: number) {
    await asegurarTablaEspejo()
    await prisma.$executeRaw`
        UPDATE chatwoot_conversaciones_espejo
        SET no_leidos = 0, actualizado_en = NOW()
        WHERE id = ${BigInt(conversationId)}
    `
}
