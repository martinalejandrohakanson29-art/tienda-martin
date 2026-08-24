import { prisma } from "@/lib/prisma"
import { chatwootConfig } from "@/lib/chatwoot-bot"

// Lista de conversaciones reales de Chatwoot para /admin/chatwoot/chats-vivo,
// ordenadas por actividad reciente. La "categoría" de cada chat NO sale de un
// label de Chatwoot -- la cuenta real no tiene ninguno puesto todavía (solo
// existe "intervencion", sin usar) -- sale de cruzar el conversation_id contra
// las mismas tablas de pendientes que ya usa /admin/chatwoot/pendientes.

const ACCOUNT_ID = 1
const TOPE_PAGINAS = 8

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
    const partes = nombre.trim().split(/\s+/).filter(Boolean)
    if (partes.length === 0) return "?"
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
    return (partes[0][0] + partes[1][0]).toUpperCase()
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

    const [tecnicas, negocio, precio, sinMatch] = await Promise.all([
        prisma.$queryRaw<{ conversation_id: bigint }[]>`
            SELECT DISTINCT conversation_id FROM preguntas_tecnicas_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        `,
        prisma.$queryRaw<{ conversation_id: bigint }[]>`
            SELECT DISTINCT conversation_id FROM preguntas_negocio_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        `,
        prisma.$queryRaw<{ conversation_id: bigint }[]>`
            SELECT DISTINCT conversation_id FROM preguntas_precio_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        `,
        prisma.$queryRaw<{ conversation_id: bigint }[]>`
            SELECT DISTINCT conversation_id FROM preguntas_sin_match_pendientes
            WHERE estado = 'pendiente' AND conversation_id = ANY(${idsBigint})
        `,
    ])

    const mapa = new Map<number, Categoria>()
    for (const f of sinMatch) mapa.set(Number(f.conversation_id), "sin_match")
    for (const f of precio) mapa.set(Number(f.conversation_id), "precio")
    for (const f of negocio) mapa.set(Number(f.conversation_id), "negocio")
    for (const f of tecnicas) mapa.set(Number(f.conversation_id), "tecnica")
    return mapa
}

/**
 * Trae conversaciones de Chatwoot ordenadas por actividad reciente (orden que
 * ya devuelve la API) hasta juntar `periodoDias` de antigüedad, con un tope de
 * páginas por si un día hay muchísimo volumen. `status=all` incluye
 * abiertas/pendientes/resueltas -- acá interesa "qué se habló últimamente",
 * no el estado de gestión de Chatwoot.
 */
export async function listarChatsVivo(periodoDias: number): Promise<PanelChatsVivo> {
    const cutoffMs = Date.now() - periodoDias * 24 * 60 * 60 * 1000
    const crudo: any[] = []

    for (let pagina = 1; pagina <= TOPE_PAGINAS; pagina++) {
        const j = await chatwootFetch(`/accounts/${ACCOUNT_ID}/conversations?status=all&page=${pagina}`)
        const items: any[] = j?.data?.payload || []
        if (items.length === 0) break
        crudo.push(...items)

        const masVieja = items[items.length - 1]
        const tsMasVieja = Number(masVieja?.last_activity_at ?? masVieja?.timestamp ?? 0) * 1000
        if (tsMasVieja < cutoffMs) break
        if (items.length < 25) break
    }

    const filtradas = crudo.filter((c) => {
        const ts = Number(c?.last_activity_at ?? c?.timestamp ?? 0) * 1000
        return ts >= cutoffMs
    })

    const categorias = await categoriasPorConversacion(filtradas.map((c) => c.id))

    const conversaciones: ConversacionVivo[] = filtradas
        .map((c) => {
            const sender = c?.meta?.sender
            const nombre = sender?.name || sender?.phone_number || `Conversación ${c.id}`
            const ultimo = c?.last_non_activity_message || c?.messages?.[c.messages.length - 1]
            const epoch = Number(c?.last_activity_at ?? c?.timestamp ?? 0)

            return {
                id: c.id,
                nombre,
                telefono: sender?.phone_number || "",
                iniciales: iniciales(nombre),
                colorAvatar: colorAvatar(c.id),
                categoria: categorias.get(c.id) ?? "sin_etiqueta",
                status: c.status,
                ultimoMensaje: (ultimo?.content || "").toString().trim() || "(sin texto)",
                ultimoMensajePropio: ultimo?.message_type === 1,
                horaEtiqueta: etiquetaHora(epoch),
                ultimaActividad: new Date(epoch * 1000).toISOString(),
                noLeidos: Number(c?.unread_count || 0),
            }
        })
        .sort((a, b) => b.ultimaActividad.localeCompare(a.ultimaActividad))

    return { conversaciones, periodoDias, actualizadoEn: new Date().toISOString() }
}
