"use server"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { parsearListaCompat } from "@/lib/compatibilidad-texto"

const RUTA = "/admin/chatwoot/catalogo"

function parsePrecio(precio: string): number | null {
    const limpio = precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")
    if (!limpio) return null
    const n = Number(limpio)
    return isNaN(n) ? null : n
}

// --- Artículos ---

// Un "artículo" del catálogo del bot no se tipea a mano: es una referencia a
// un artículo real de articulos_mostrador (nombre siempre en vivo desde ahí,
// nunca se desincroniza) + una capa de anotación propia del chat (alias,
// precio editable, detalle).
export type ChatArticulo = {
    id: number
    articulo_mostrador_id: string
    nombre: string
    alias: string | null
    precio: number | null
    detalle: string | null
    activo: boolean
    creado_en: Date
}

export type ChatArticuloInput = {
    id?: number
    articuloMostradorId: string
    alias: string
    precio: string // vacío = no se vende suelto
    detalle: string
    activo: boolean
}

export type ArticuloMostradorResultado = {
    id: string
    nombre: string
    precio: number
}

// Buscador contra el inventario real (no se carga la lista completa a propósito
// — solo lo que matchea la búsqueda, para elegir el real al crear un artículo
// del catálogo de chat). Excluye packs y artículos ocultos: acá solo interesan
// piezas sueltas reales.
export async function buscarArticulosMostrador(query: string): Promise<ArticuloMostradorResultado[]> {
    await requireAdmin()
    const palabras = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (query.trim().length < 2 || palabras.length === 0) return []

    // Todas las palabras tienen que estar en el nombre, sin importar el orden
    // (ej. "aire filtro" encuentra "Filtro Aire 39x60 First").
    const condiciones = Prisma.join(
        palabras.map((p) => Prisma.sql`nombre ILIKE ${"%" + p + "%"}`),
        " AND "
    )

    return prisma.$queryRaw<ArticuloMostradorResultado[]>(Prisma.sql`
        SELECT id, nombre, precio::float AS precio
        FROM articulos_mostrador
        WHERE "esPack" = false AND oculto = false AND (${condiciones})
        ORDER BY nombre ASC
        LIMIT 15
    `)
}

export async function getChatArticulos(): Promise<ChatArticulo[]> {
    await requireAdmin()
    return prisma.$queryRaw<ChatArticulo[]>`
        SELECT ca.id, ca.articulo_mostrador_id, am.nombre, ca.alias, ca.precio, ca.detalle, ca.activo, ca.creado_en
        FROM chat_articulos ca
        JOIN articulos_mostrador am ON am.id = ca.articulo_mostrador_id
        ORDER BY am.nombre ASC
    `
}

export async function guardarChatArticulo(data: ChatArticuloInput) {
    await requireAdmin()

    const articuloMostradorId = data.articuloMostradorId.trim()
    if (!articuloMostradorId) throw new Error("Elegí un artículo del inventario real")

    const alias = data.alias.trim() || null
    const precio = parsePrecio(data.precio)
    const detalle = data.detalle.trim() || null

    let id = data.id
    if (id) {
        await prisma.$executeRaw`
            UPDATE chat_articulos
            SET alias = ${alias}, precio = ${precio}, detalle = ${detalle}, activo = ${data.activo}
            WHERE id = ${id}
        `
    } else {
        try {
            const inserted = await prisma.$queryRaw<{ id: number }[]>`
                INSERT INTO chat_articulos (articulo_mostrador_id, alias, precio, detalle, activo)
                VALUES (${articuloMostradorId}, ${alias}, ${precio}, ${detalle}, ${data.activo})
                RETURNING id
            `
            id = inserted[0].id
        } catch (error: any) {
            if (error?.code === "P2010" && String(error?.meta?.code) === "23505") {
                throw new Error("Ese artículo ya está cargado en el catálogo.")
            }
            throw error
        }
    }

    revalidatePath(RUTA)
    return { success: true, id }
}

export async function eliminarChatArticulo(id: number) {
    await requireAdmin()

    const enUso = await prisma.$queryRaw<{ pack_nombre: string }[]>`
        SELECT p.nombre AS pack_nombre
        FROM chat_pack_articulos pa
        JOIN chat_packs p ON p.id = pa.pack_id
        WHERE pa.articulo_id = ${id}
    `
    if (enUso.length > 0) {
        const packs = enUso.map((r) => r.pack_nombre).join(", ")
        throw new Error(`Este artículo está enganchado a: ${packs}. Sacalo del pack antes de borrarlo.`)
    }

    await prisma.$executeRaw`DELETE FROM chat_articulos WHERE id = ${id}`
    revalidatePath(RUTA)
}

export async function alternarActivoChatArticulo(id: number, activo: boolean) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE chat_articulos SET activo = ${activo} WHERE id = ${id}`
    revalidatePath(RUTA)
}

// --- Compatibilidad por artículo ---
// No se hereda en vivo del kit (un artículo puede pertenecer a más de un
// kit, y no todas las piezas de un kit comparten compatibilidad) — cada
// artículo tiene su propia lista, editable. El admin puede copiar la lista
// de un kit existente como punto de partida (ver "copiar de un kit" en la
// UI), pero eso es una copia única, no un vínculo.

export type ChatArticuloCompatibilidad = {
    id: number
    articulo_id: number
    modelo_moto: string
    compatible: boolean
    detalle: string | null
}

export async function getChatArticuloCompatibilidades(): Promise<ChatArticuloCompatibilidad[]> {
    await requireAdmin()
    return prisma.$queryRaw<ChatArticuloCompatibilidad[]>`
        SELECT id, articulo_id, modelo_moto, compatible, detalle
        FROM chat_articulo_compatibilidad
        ORDER BY creado_en DESC
    `
}

// Reemplaza todas las filas de compatibilidad de un artículo por lo que dicen
// los dos textareas (compatibles / no compatibles) — mismo criterio que
// sincronizarCompatibilidadesKit para los kits.
export async function sincronizarCompatibilidadArticulo(
    articuloId: number,
    compatiblesTexto: string,
    incompatiblesTexto: string
) {
    await requireAdmin()

    const deseados = [
        ...parsearListaCompat(compatiblesTexto).map((it) => ({ ...it, compatible: true })),
        ...parsearListaCompat(incompatiblesTexto).map((it) => ({ ...it, compatible: false })),
    ]
    const clave = (modelo: string, detalle: string, compatible: boolean) =>
        `${compatible}::${modelo.trim().toLowerCase()}::${detalle.trim().toLowerCase()}`

    const deseadosMap = new Map(deseados.map((it) => [clave(it.modelo, it.detalle, it.compatible), it]))

    const existentes = await prisma.$queryRaw<
        { id: number; modelo_moto: string; detalle: string | null; compatible: boolean }[]
    >`SELECT id, modelo_moto, detalle, compatible FROM chat_articulo_compatibilidad WHERE articulo_id = ${articuloId}`
    const existentesMap = new Map(existentes.map((e) => [clave(e.modelo_moto, e.detalle || "", e.compatible), e]))

    for (const e of existentes) {
        const k = clave(e.modelo_moto, e.detalle || "", e.compatible)
        if (!deseadosMap.has(k)) {
            await prisma.$executeRaw`DELETE FROM chat_articulo_compatibilidad WHERE id = ${e.id}`
        }
    }

    for (const [k, it] of deseadosMap) {
        if (!existentesMap.has(k)) {
            await prisma.$executeRaw`
                INSERT INTO chat_articulo_compatibilidad (articulo_id, modelo_moto, compatible, detalle)
                VALUES (${articuloId}, ${it.modelo}, ${it.compatible}, ${it.detalle})
            `
        }
    }

    revalidatePath(RUTA)
}

// --- Grupos de variantes (mismo anuncio, distinto pack real) ---
// Ej. Kit 120 recorrido corto/largo: mismo anuncio de Instagram, artículo y
// precio real distintos según cuál le toque al cliente. El grupo es la puerta
// de entrada compartida (plantilla + pregunta para desambiguar); cada pack
// colgado del grupo lleva su propia etiqueta corta (criterio_variante). Solo
// datos por ahora — el paso de n8n que usa esto se arma en otra conversación.

export type ChatPackGrupo = {
    id: number
    nombre: string
    plantillas_bienvenida: string | null
    pregunta_desambiguacion: string | null
    activo: boolean
}

export type ChatPackGrupoInput = {
    nombre: string
    plantillasBienvenida: string
    preguntaDesambiguacion: string
}

export async function getChatPackGrupos(): Promise<ChatPackGrupo[]> {
    await requireAdmin()
    return prisma.$queryRaw<ChatPackGrupo[]>`
        SELECT id, nombre, plantillas_bienvenida, pregunta_desambiguacion, activo
        FROM chat_pack_grupos
        ORDER BY nombre ASC
    `
}

export async function crearChatPackGrupo(data: ChatPackGrupoInput): Promise<{ id: number }> {
    await requireAdmin()
    const nombre = data.nombre.trim()
    if (!nombre) throw new Error("El nombre del grupo es obligatorio")

    const inserted = await prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO chat_pack_grupos (nombre, plantillas_bienvenida, pregunta_desambiguacion)
        VALUES (${nombre}, ${data.plantillasBienvenida.trim() || null}, ${data.preguntaDesambiguacion.trim() || null})
        RETURNING id
    `
    revalidatePath(RUTA)
    return { id: inserted[0].id }
}

// --- Packs ---

export type ChatPackComponente = {
    articulo_id: number
    nombre: string
    alias: string | null
    precio: number | null
    cantidad: number
    orden: number
}

export type ChatPack = {
    id: number
    nombre: string
    precio: number
    envio: string | null
    mensaje_bienvenida: string
    foto_url: string | null
    plantillas_bienvenida: string | null
    activo: boolean
    creado_en: Date
    grupo_id: number | null
    criterio_variante: string | null
    componentes: ChatPackComponente[]
}

export type ChatPackInput = {
    id?: number
    nombre: string
    precio: string
    envio: string
    mensajeBienvenida: string
    fotoUrl: string
    plantillasBienvenida: string
    activo: boolean
    grupoId: number | null
    criterioVariante: string
}

export type ChatPackComponenteInput = {
    articuloId: number
    cantidad: number
}

export async function getChatPacks(): Promise<ChatPack[]> {
    await requireAdmin()

    const packs = await prisma.$queryRaw<Omit<ChatPack, "componentes">[]>`
        SELECT id, nombre, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, activo, creado_en, grupo_id, criterio_variante
        FROM chat_packs
        ORDER BY creado_en DESC
    `
    if (packs.length === 0) return []

    const componentes = await prisma.$queryRaw<(ChatPackComponente & { pack_id: number })[]>`
        SELECT pa.pack_id, pa.articulo_id, am.nombre, a.alias, a.precio, pa.cantidad, pa.orden
        FROM chat_pack_articulos pa
        JOIN chat_articulos a ON a.id = pa.articulo_id
        JOIN articulos_mostrador am ON am.id = a.articulo_mostrador_id
        ORDER BY pa.pack_id, pa.orden ASC
    `

    return packs.map((pack) => ({
        ...pack,
        componentes: componentes.filter((c) => c.pack_id === pack.id),
    }))
}

export async function guardarChatPack(data: ChatPackInput, componentes: ChatPackComponenteInput[]) {
    await requireAdmin()

    const nombre = data.nombre.trim()
    const mensajeBienvenida = data.mensajeBienvenida.trim()
    if (!nombre) throw new Error("El nombre del pack es obligatorio")
    if (!mensajeBienvenida) throw new Error("El mensaje predefinido es obligatorio")

    const precio = parsePrecio(data.precio) ?? 0
    const envio = data.envio.trim() || null
    const fotoUrl = data.fotoUrl.trim() || null
    const plantillasBienvenida = data.plantillasBienvenida.trim() || null
    const criterioVariante = data.grupoId ? data.criterioVariante.trim() || null : null
    if (data.grupoId && !criterioVariante) {
        throw new Error("Si el pack pertenece a un grupo, hace falta la etiqueta de variante (ej. \"recorrido corto\")")
    }

    let packId = data.id
    if (packId) {
        await prisma.$executeRaw`
            UPDATE chat_packs
            SET nombre = ${nombre}, precio = ${precio}, envio = ${envio},
                mensaje_bienvenida = ${mensajeBienvenida}, foto_url = ${fotoUrl},
                plantillas_bienvenida = ${plantillasBienvenida}, activo = ${data.activo},
                grupo_id = ${data.grupoId}, criterio_variante = ${criterioVariante}
            WHERE id = ${packId}
        `
    } else {
        const inserted = await prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO chat_packs (nombre, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, activo, grupo_id, criterio_variante)
            VALUES (${nombre}, ${precio}, ${envio}, ${mensajeBienvenida}, ${fotoUrl}, ${plantillasBienvenida}, ${data.activo}, ${data.grupoId}, ${criterioVariante})
            RETURNING id
        `
        packId = inserted[0].id
    }

    await prisma.$executeRaw`DELETE FROM chat_pack_articulos WHERE pack_id = ${packId}`
    let orden = 0
    for (const comp of componentes) {
        await prisma.$executeRaw`
            INSERT INTO chat_pack_articulos (pack_id, articulo_id, cantidad, orden)
            VALUES (${packId}, ${comp.articuloId}, ${comp.cantidad}, ${orden})
        `
        orden++
    }

    revalidatePath(RUTA)
    return { success: true, id: packId }
}

export async function eliminarChatPack(id: number) {
    await requireAdmin()
    await prisma.$executeRaw`DELETE FROM chat_packs WHERE id = ${id}`
    revalidatePath(RUTA)
}

export async function alternarActivoChatPack(id: number, activo: boolean) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE chat_packs SET activo = ${activo} WHERE id = ${id}`
    revalidatePath(RUTA)
}
