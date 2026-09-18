"use server"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { parsearListaCompat } from "@/lib/compatibilidad-texto"
import { validarPack, validarCatalogo, type ReporteCatalogo } from "@/lib/validacion-catalogo"
import { resolverMoto } from "@/bot-agente/nucleo/motos"

const RUTA = "/admin/chatwoot/catalogo"

function parsePrecio(precio: string): number | null {
    const limpio = precio.trim().replace(/[^\d.,]/g, "").replace(",", ".")
    if (!limpio) return null
    const n = Number(limpio)
    return isNaN(n) ? null : n
}

/**
 * Cilindradas para las que sirve un producto ("110", "125, 150, 190").
 *
 * Es la red que evita que una fila positiva confirme un kit a una moto de otro
 * motor: si la moto del cliente resuelve a una cilindrada que no está acá, el
 * bot no la confirma y deriva (ver `bot-agente/herramientas/compatibilidad.ts`
 * y `n8n-workflows/chat-catalogo-cilindrada-base.sql`). Vacío = no filtra.
 */
function parseCilindradas(txt: string | undefined): number[] {
    const nums = (txt || "")
        .split(/[^\d]+/)
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0 && n < 2000)
    return [...new Set(nums)].sort((a, b) => a - b)
}

/**
 * Lee `cilindradas_base` de una tabla del catálogo en una query aparte (Prisma
 * no tipa la columna array en el modelo generado).
 */
async function cilindradasBasePorId(tabla: "chat_articulos" | "chat_packs" | "chat_pack_grupos"): Promise<Map<number, number[]>> {
    const filas = await prisma.$queryRawUnsafe<{ id: number; cilindradas_base: number[] | null }[]>(
        `SELECT id, cilindradas_base FROM ${tabla}`
    )
    return new Map(filas.map((f) => [Number(f.id), f.cilindradas_base || []]))
}

/**
 * El UPDATE va sin red a propósito.
 *
 * Antes estaba envuelto en un `try {} catch {}` vacío, por si la migración de
 * la columna todavía no había corrido. Esa red dejó de proteger algo real (las
 * columnas existen desde hace meses) y pasó a tapar el peor modo de falla
 * posible para este panel: el formulario dice "guardado", la pantalla muestra
 * el valor nuevo, y en la base sigue el viejo. Para un campo del que depende un
 * veredicto de compatibilidad, un error ruidoso es infinitamente mejor que un
 * dato silenciosamente perdido.
 */
async function guardarCilindradasBase(
    tabla: "chat_articulos" | "chat_packs" | "chat_pack_grupos",
    id: number,
    cilindradas: number[]
) {
    await prisma.$executeRawUnsafe(`UPDATE ${tabla} SET cilindradas_base = $1 WHERE id = $2`, cilindradas, id)
}

/**
 * Impide dos packs (o dos grupos) con el mismo nombre.
 *
 * El nombre es la clave semántica del catálogo: el motor resuelve de qué kit
 * habla el cliente por nombre, y filtra por nombre qué filas de compatibilidad
 * le corresponden. Dos nombres iguales no son un problema de prolijidad — son
 * dos kits que el bot no puede distinguir, y cualquiera de los dos precios
 * puede salir para cualquiera de los dos productos.
 *
 * Se compara normalizado (sin tildes, sin mayúsculas, sin espacios de más)
 * porque el matching del motor también normaliza.
 */
async function verificarNombreLibre(tabla: "chat_packs" | "chat_pack_grupos", nombre: string, idPropio?: number) {
    const filas = await prisma.$queryRawUnsafe<{ id: number; nombre: string }[]>(
        `SELECT id, nombre FROM ${tabla}`
    )
    const norm = (t: string) =>
        t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()
    const choque = filas.find((f) => Number(f.id) !== Number(idPropio ?? -1) && norm(f.nombre) === norm(nombre))
    if (choque) {
        const que = tabla === "chat_packs" ? "pack" : "grupo"
        throw new Error(
            `Ya existe un ${que} llamado "${choque.nombre}". El bot busca los kits por nombre: con dos iguales no puede distinguirlos ni saber qué compatibilidad le corresponde a cada uno.`
        )
    }
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
    titulo_comercial: string | null
    alias: string | null
    precio: number | null
    detalle: string | null
    categoria: string | null
    // Política de envío de la pieza VENDIDA SOLA. Tri-estado a propósito:
    // true = gratis, false = lo paga el cliente, null = todavía no se definió.
    // El bot no puede afirmar nada sobre envío mientras esté en null (conv 3860).
    envio_gratis: boolean | null
    envio: string | null
    activo: boolean
    creado_en: Date
    es_pack: boolean
    /** Para qué motor es la pieza (110, 150...). Vacío = no filtra por cilindrada. */
    cilindradas_base: number[]
}

export type ChatArticuloInput = {
    id?: number
    articuloMostradorId: string
    tituloComercial?: string
    alias: string
    precio: string // vacío = no se vende suelto
    detalle: string
    categoria: string // vacío = sin categoría
    envioGratis: "si" | "no" | "" // "" = sin definir
    envio: string // aclaración opcional (transporte, demora, costo)
    activo: boolean
    cilindradasBase: string // "110" / "125, 150" — vacío = no filtra
}

export type ArticuloMostradorResultado = {
    id: string
    nombre: string
    precio: number
    esPack: boolean
}

// Buscador contra el inventario real (no se carga la lista completa a propósito
// — solo lo que matchea la búsqueda, para elegir el real al crear un artículo
// del catálogo de chat). Incluye tanto piezas sueltas como packs armados en
// /admin/listas/packs (mismo "articulos_mostrador", solo cambia esPack) — un
// pack se referencia igual que una pieza suelta, un solo articulo_mostrador_id.
// Excluye únicamente los artículos ocultos.
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
        SELECT id, nombre, precio::float AS precio, COALESCE("esPack", false) AS "esPack"
        FROM articulos_mostrador
        WHERE oculto = false AND (${condiciones})
        ORDER BY nombre ASC
        LIMIT 15
    `)
}

export async function getChatArticulos(): Promise<ChatArticulo[]> {
    await requireAdmin()
    const [filas, cilindradas] = await Promise.all([
        prisma.$queryRaw<Omit<ChatArticulo, "cilindradas_base">[]>`
            SELECT ca.id, ca.articulo_mostrador_id, am.nombre, ca.titulo_comercial, ca.alias, ca.precio, ca.detalle, ca.categoria,
                   ca.envio_gratis, ca.envio, ca.activo, ca.creado_en,
                   COALESCE(am."esPack", false) AS es_pack
            FROM chat_articulos ca
            JOIN articulos_mostrador am ON am.id = ca.articulo_mostrador_id
            ORDER BY am.nombre ASC
        `,
        cilindradasBasePorId("chat_articulos"),
    ])
    return filas.map((f) => ({ ...f, cilindradas_base: cilindradas.get(Number(f.id)) ?? [] }))
}

export async function guardarChatArticulo(data: ChatArticuloInput) {
    await requireAdmin()

    const articuloMostradorId = data.articuloMostradorId.trim()
    if (!articuloMostradorId) throw new Error("Elegí un artículo del inventario real")

    const tituloComercial = data.tituloComercial?.trim() || null
    const alias = data.alias.trim() || null
    const precio = parsePrecio(data.precio)
    const detalle = data.detalle.trim() || null
    const categoria = data.categoria.trim() || null
    const envioGratis = data.envioGratis === "si" ? true : data.envioGratis === "no" ? false : null
    const envio = data.envio?.trim() || null

    let id = data.id
    if (id) {
        await prisma.$executeRaw`
            UPDATE chat_articulos
            SET titulo_comercial = ${tituloComercial}, alias = ${alias}, precio = ${precio}, detalle = ${detalle}, categoria = ${categoria},
                envio_gratis = ${envioGratis}, envio = ${envio}, activo = ${data.activo}
            WHERE id = ${id}
        `
    } else {
        try {
            const inserted = await prisma.$queryRaw<{ id: number }[]>`
                INSERT INTO chat_articulos (articulo_mostrador_id, titulo_comercial, alias, precio, detalle, categoria, envio_gratis, envio, activo)
                VALUES (${articuloMostradorId}, ${tituloComercial}, ${alias}, ${precio}, ${detalle}, ${categoria}, ${envioGratis}, ${envio}, ${data.activo})
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

    await guardarCilindradasBase("chat_articulos", id!, parseCilindradas(data.cilindradasBase))

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

/**
 * Cambia el envío de una pieza suelta desde la propia tabla del listado, sin
 * abrir el formulario. Tri-estado: `null` (sin definir) -> true (gratis) ->
 * false (lo paga el cliente) -> `null`.
 *
 * El "sin definir" se conserva a propósito aunque sea un click de más: es el
 * estado en el que el bot NO promete ni niega envío, y es donde tiene que caer
 * un artículo recién cargado hasta que alguien lo decida.
 */
export async function alternarEnvioChatArticulo(id: number, envioGratis: boolean | null) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE chat_articulos SET envio_gratis = ${envioGratis} WHERE id = ${id}`
    revalidatePath(RUTA)
    return { ok: true, envioGratis }
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

// --- Compatibilidad a nivel de combo completo (grupo o kit sin grupo) ---
// Distinta de chat_articulo_compatibilidad (compatibilidad por pieza suelta):
// una pieza periférica (filtro de aire, codo de admisión) puede entrar en una
// moto aunque la pieza central del combo (el cilindro) no entre sin modificar
// el motor -- esto carga el resultado real del combo completo, para que el
// bot no confunda "alguna pieza entra" con "el combo que se anuncia sirve".
// Nivel de match: GRUPO (no pack individual) porque la compatibilidad con una
// moto es la misma para el recorrido corto y el largo de un mismo grupo; para
// un kit sin variantes (sin grupo) el nivel es directamente el kit.

export type ChatComboCompatibilidad = {
    id: number
    grupo_id: number | null
    kit_id: number | null
    modelo_moto: string
    compatible: boolean
    detalle: string | null
}

export async function getChatComboCompatibilidades(): Promise<ChatComboCompatibilidad[]> {
    await requireAdmin()
    return prisma.$queryRaw<ChatComboCompatibilidad[]>`
        SELECT id, grupo_id, kit_id, modelo_moto, compatible, detalle
        FROM chat_combo_compatibilidad
        ORDER BY creado_en DESC
    `
}

// Reemplaza todas las filas de compatibilidad de un GRUPO por lo que dicen los
// dos textareas — mismo criterio que sincronizarCompatibilidadArticulo.
export async function sincronizarCompatibilidadGrupo(
    grupoId: number,
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
    >`SELECT id, modelo_moto, detalle, compatible FROM chat_combo_compatibilidad WHERE grupo_id = ${grupoId}`
    const existentesMap = new Map(existentes.map((e) => [clave(e.modelo_moto, e.detalle || "", e.compatible), e]))

    for (const e of existentes) {
        const k = clave(e.modelo_moto, e.detalle || "", e.compatible)
        if (!deseadosMap.has(k)) {
            await prisma.$executeRaw`DELETE FROM chat_combo_compatibilidad WHERE id = ${e.id}`
        }
    }

    for (const [k, it] of deseadosMap) {
        if (!existentesMap.has(k)) {
            await prisma.$executeRaw`
                INSERT INTO chat_combo_compatibilidad (grupo_id, modelo_moto, compatible, detalle)
                VALUES (${grupoId}, ${it.modelo}, ${it.compatible}, ${it.detalle})
            `
        }
    }

    revalidatePath(RUTA)
}

// Mismo criterio, para un KIT sin grupo (pack suelto, sin variantes).
export async function sincronizarCompatibilidadKit(
    kitId: number,
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
    >`SELECT id, modelo_moto, detalle, compatible FROM chat_combo_compatibilidad WHERE kit_id = ${kitId}`
    const existentesMap = new Map(existentes.map((e) => [clave(e.modelo_moto, e.detalle || "", e.compatible), e]))

    for (const e of existentes) {
        const k = clave(e.modelo_moto, e.detalle || "", e.compatible)
        if (!deseadosMap.has(k)) {
            await prisma.$executeRaw`DELETE FROM chat_combo_compatibilidad WHERE id = ${e.id}`
        }
    }

    for (const [k, it] of deseadosMap) {
        if (!existentesMap.has(k)) {
            await prisma.$executeRaw`
                INSERT INTO chat_combo_compatibilidad (kit_id, modelo_moto, compatible, detalle)
                VALUES (${kitId}, ${it.modelo}, ${it.compatible}, ${it.detalle})
            `
        }
    }

    revalidatePath(RUTA)
}

// --- Grupos de variantes (mismo anuncio, distinto pack real) ---
// Ej. Kit 120 recorrido corto/largo: mismo anuncio de Instagram, artículo y
// precio real distintos según cuál le toque al cliente. El grupo es la puerta
// de entrada compartida: la plantilla exacta, y el mensaje de bienvenida
// genérico (saludo + qué es el combo + la pregunta para desambiguar — se
// manda como un solo mensaje de WhatsApp, sin precio porque ahí está la
// ambigüedad). Cada pack colgado del grupo lleva su propia etiqueta corta
// (criterio_variante). Solo datos por ahora — el paso de n8n que usa esto se
// arma en otra conversación.

export type ChatPackGrupo = {
    id: number
    nombre: string
    plantillas_bienvenida: string | null
    plantillas_referral: string | null
    mensaje_bienvenida: string | null
    pregunta_variante: string | null
    pregunta_variante_reintento: string | null
    foto_url: string | null
    categoria: string | null
    activo: boolean
    /** Para qué motor es el combo (110, 150...). Vacío = no filtra por cilindrada. */
    cilindradas_base: number[]
}

export type ChatPackGrupoInput = {
    id?: number
    nombre: string
    plantillasBienvenida: string
    plantillasReferral: string
    mensajeBienvenida: string
    preguntaVariante: string
    preguntaVarianteReintento: string
    fotoUrl: string
    categoria: string
    cilindradasBase: string // "110" / "125, 150" — vacío = no filtra
}

export async function getChatPackGrupos(): Promise<ChatPackGrupo[]> {
    await requireAdmin()
    const [filas, cilindradas] = await Promise.all([
        prisma.$queryRaw<Omit<ChatPackGrupo, "cilindradas_base">[]>`
            SELECT id, nombre, plantillas_bienvenida, plantillas_referral, mensaje_bienvenida, pregunta_variante, pregunta_variante_reintento, foto_url, categoria, activo
            FROM chat_pack_grupos
            ORDER BY nombre ASC
        `,
        cilindradasBasePorId("chat_pack_grupos"),
    ])
    return filas.map((f) => ({ ...f, cilindradas_base: cilindradas.get(Number(f.id)) ?? [] }))
}

export async function guardarChatPackGrupo(data: ChatPackGrupoInput): Promise<{ id: number }> {
    await requireAdmin()
    const nombre = data.nombre.trim()
    if (!nombre) throw new Error("El nombre del grupo es obligatorio")
    await verificarNombreLibre("chat_pack_grupos", nombre, data.id)

    const plantillasBienvenida = data.plantillasBienvenida.trim() || null
    const plantillasReferral = data.plantillasReferral.trim() || null
    const mensajeBienvenida = data.mensajeBienvenida.trim() || null
    const preguntaVariante = data.preguntaVariante.trim() || null
    const preguntaVarianteReintento = data.preguntaVarianteReintento.trim() || null
    const fotoUrl = data.fotoUrl.trim() || null
    const categoria = data.categoria.trim() || null

    if (data.id) {
        await prisma.$executeRaw`
            UPDATE chat_pack_grupos
            SET nombre = ${nombre}, plantillas_bienvenida = ${plantillasBienvenida},
                plantillas_referral = ${plantillasReferral},
                mensaje_bienvenida = ${mensajeBienvenida}, pregunta_variante = ${preguntaVariante},
                pregunta_variante_reintento = ${preguntaVarianteReintento},
                foto_url = ${fotoUrl}, categoria = ${categoria}
            WHERE id = ${data.id}
        `
        await guardarCilindradasBase("chat_pack_grupos", data.id, parseCilindradas(data.cilindradasBase))
        revalidatePath(RUTA)
        return { id: data.id }
    }

    const inserted = await prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO chat_pack_grupos (nombre, plantillas_bienvenida, plantillas_referral, mensaje_bienvenida, pregunta_variante, pregunta_variante_reintento, foto_url, categoria)
        VALUES (${nombre}, ${plantillasBienvenida}, ${plantillasReferral}, ${mensajeBienvenida}, ${preguntaVariante}, ${preguntaVarianteReintento}, ${fotoUrl}, ${categoria})
        RETURNING id
    `
    await guardarCilindradasBase("chat_pack_grupos", inserted[0].id, parseCilindradas(data.cilindradasBase))
    revalidatePath(RUTA)
    return { id: inserted[0].id }
}

export async function eliminarChatPackGrupo(id: number) {
    await requireAdmin()

    const enUso = await prisma.$queryRaw<{ nombre: string }[]>`
        SELECT nombre FROM chat_packs WHERE grupo_id = ${id}
    `
    if (enUso.length > 0) {
        const packs = enUso.map((r) => r.nombre).join(", ")
        throw new Error(`Este grupo tiene packs enganchados: ${packs}. Sacalos del grupo antes de borrarlo.`)
    }

    await prisma.$executeRaw`DELETE FROM chat_pack_grupos WHERE id = ${id}`
    revalidatePath(RUTA)
}

export async function alternarActivoChatPackGrupo(id: number, activo: boolean) {
    await requireAdmin()
    await prisma.$executeRaw`UPDATE chat_pack_grupos SET activo = ${activo} WHERE id = ${id}`
    revalidatePath(RUTA)
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
    plantillas_referral: string | null
    detalle: string | null
    activo: boolean
    creado_en: Date
    grupo_id: number | null
    criterio_variante: string | null
    sinonimos_variante: string[] | null
    /** Lo que este pack NO puede cambiar, ej. "recorrido corto" (ver chat-catalogo-atributo-fijo.sql). */
    atributo_fijo: string | null
    /** Sinónimos que desmienten el atributo fijo: si el cliente dice uno, este pack no le sirve. */
    atributo_fijo_contradice: string[] | null
    categoria: string | null
    /** Para qué motor es el pack (110, 150...). Vacío = no filtra por cilindrada. */
    cilindradas_base: number[]
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
    plantillasReferral: string
    detalle: string
    activo: boolean
    grupoId: number | null
    criterioVariante: string
    sinonimosVariante: string
    atributoFijo: string
    atributoFijoContradice: string
    categoria: string
    cilindradasBase: string // "110" / "125, 150" — vacío = no filtra
}

export type ChatPackComponenteInput = {
    articuloId: number
    cantidad: number
}

export async function getChatPacks(): Promise<ChatPack[]> {
    await requireAdmin()

    const packs = await prisma.$queryRaw<
        Omit<ChatPack, "componentes" | "sinonimos_variante" | "atributo_fijo" | "atributo_fijo_contradice" | "cilindradas_base">[]
    >`
        SELECT id, nombre, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral, detalle, activo, creado_en, grupo_id, criterio_variante, categoria
        FROM chat_packs
        ORDER BY creado_en DESC
    `
    if (packs.length === 0) return []

    // Sinónimos de variante y atributo fijo. Iban en queries "tolerantes" con
    // catch vacío por si las migraciones no habían corrido; hoy las columnas
    // existen y ese catch solo servía para mostrar un pack sin sus sinónimos
    // como si no los tuviera — y sobrescribirlos al guardar.
    const sinRows = await prisma.$queryRaw<{ id: number; sinonimos_variante: string[] | null }[]>`
        SELECT id, sinonimos_variante FROM chat_packs
    `
    const sinonimosPorPack = new Map(sinRows.map((r) => [r.id, r.sinonimos_variante || []]))

    const fijoRows = await prisma.$queryRaw<
        { id: number; atributo_fijo: string | null; atributo_fijo_contradice: string[] | null }[]
    >`
        SELECT id, atributo_fijo, atributo_fijo_contradice FROM chat_packs
    `
    const fijoPorPack = new Map(fijoRows.map((r) => [r.id, r]))

    const componentes = await prisma.$queryRaw<(ChatPackComponente & { pack_id: number })[]>`
        SELECT pa.pack_id, pa.articulo_id, am.nombre, a.alias, a.precio, pa.cantidad, pa.orden
        FROM chat_pack_articulos pa
        JOIN chat_articulos a ON a.id = pa.articulo_id
        JOIN articulos_mostrador am ON am.id = a.articulo_mostrador_id
        ORDER BY pa.pack_id, pa.orden ASC
    `

    const cilindradasPorPack = await cilindradasBasePorId("chat_packs")

    return packs.map((pack) => ({
        ...pack,
        cilindradas_base: cilindradasPorPack.get(Number(pack.id)) ?? [],
        sinonimos_variante: sinonimosPorPack.get(pack.id) ?? [],
        atributo_fijo: fijoPorPack.get(pack.id)?.atributo_fijo ?? null,
        atributo_fijo_contradice: fijoPorPack.get(pack.id)?.atributo_fijo_contradice ?? [],
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
    const plantillasReferral = data.plantillasReferral.trim() || null
    const detalle = data.detalle.trim() || null
    const criterioVariante = data.grupoId ? data.criterioVariante.trim() || null : null
    if (data.grupoId && !criterioVariante) {
        throw new Error("Si el pack pertenece a un grupo, hace falta la etiqueta de variante (ej. \"recorrido corto\")")
    }

    // El nombre no es una etiqueta: es la clave con la que el motor encuentra el
    // kit y con la que filtra qué filas de compatibilidad le corresponden
    // (`composicionDelKitPedido`). Dos packs con el mismo nombre son dos kits
    // indistinguibles para el bot, que va a contestar por cualquiera de los dos.
    await verificarNombreLibre("chat_packs", nombre, data.id)
    // La categoría del combo es del grupo cuando el pack pertenece a uno
    // (mismo criterio que mensaje_bienvenida) — acá solo se guarda propia si
    // es un pack sin grupo.
    const categoria = data.grupoId ? null : data.categoria.trim() || null
    const sinonimosVariante = data.grupoId
        ? (data.sinonimosVariante || "")
              .split(/[\n,]/)
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
        : []

    let packId = data.id
    if (packId) {
        await prisma.$executeRaw`
            UPDATE chat_packs
            SET nombre = ${nombre}, precio = ${precio}, envio = ${envio},
                mensaje_bienvenida = ${mensajeBienvenida}, foto_url = ${fotoUrl},
                plantillas_bienvenida = ${plantillasBienvenida}, plantillas_referral = ${plantillasReferral},
                detalle = ${detalle}, activo = ${data.activo},
                grupo_id = ${data.grupoId}, criterio_variante = ${criterioVariante}, categoria = ${categoria}
            WHERE id = ${packId}
        `
    } else {
        const inserted = await prisma.$queryRaw<{ id: number }[]>`
            INSERT INTO chat_packs (nombre, precio, envio, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral, detalle, activo, grupo_id, criterio_variante, categoria)
            VALUES (${nombre}, ${precio}, ${envio}, ${mensajeBienvenida}, ${fotoUrl}, ${plantillasBienvenida}, ${plantillasReferral}, ${detalle}, ${data.activo}, ${data.grupoId}, ${criterioVariante}, ${categoria})
            RETURNING id
        `
        packId = inserted[0].id
    }

    // Sinónimos de variante: statement aparte (por el tipo array), pero sin red.
    // Si esto falla, el pack queda sin la forma en que el cliente nombra la
    // variante y el bot repregunta en loop: tiene que fallar el guardado entero.
    await prisma.$executeRawUnsafe(
        `UPDATE chat_packs SET sinonimos_variante = $1 WHERE id = $2`,
        sinonimosVariante,
        packId
    )

    // Atributo fijo (n8n-workflows/chat-catalogo-atributo-fijo.sql).
    // Sin atributo cargado no se guarda ninguna contradicción — una lista de
    // frases que descartan el pack sin decir de qué atributo hablan no se
    // puede explicar después ni al equipo ni al modelo.
    const atributoFijo = data.atributoFijo?.trim() || null
    const atributoFijoContradice = atributoFijo
        ? (data.atributoFijoContradice || "")
              .split(/[\n,]/)
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
        : []
    await prisma.$executeRawUnsafe(
        `UPDATE chat_packs SET atributo_fijo = $1, atributo_fijo_contradice = $2 WHERE id = $3`,
        atributoFijo,
        atributoFijoContradice,
        packId
    )

    // Cilindrada del pack: solo para los packs SUELTOS. Si pertenece a un
    // grupo, el motor la toma del grupo (mismo criterio que la categoría).
    await guardarCilindradasBase("chat_packs", packId!, data.grupoId ? [] : parseCilindradas(data.cilindradasBase))

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

/**
 * Publica (o pausa) un pack.
 *
 * Publicar no es un toggle más: el bot lo empieza a ofrecer en el siguiente
 * mensaje. Por eso activar pasa antes por el validador y se frena si hay
 * bloqueantes — un pack sin precio, sin mensaje o sin artículos no responde
 * "de menos", responde mal. `forzar` existe porque la decisión final es de
 * quien carga, pero tiene que ser explícita y queda registrada en el motivo.
 */
export async function alternarActivoChatPack(id: number, activo: boolean, forzar = false) {
    await requireAdmin()

    if (activo && !forzar) {
        const reporte = await validarPack(id)
        const bloqueantes = reporte.hallazgos.filter((h) => h.severidad === "bloqueante")
        if (bloqueantes.length > 0) {
            const detalle = bloqueantes.map((b) => `• ${b.entidadNombre}: ${b.titulo} — ${b.consecuencia}`).join("\n")
            throw new Error(`No se puede publicar todavía:\n${detalle}`)
        }
    }

    await prisma.$executeRaw`UPDATE chat_packs SET activo = ${activo} WHERE id = ${id}`
    revalidatePath(RUTA)
}

export type MotoAnalizada = {
    texto: string
    /** "exacta" | "aproximada" resuelven; "ambigua" | "ninguna" no. */
    confianza: string
    resuelve: boolean
    /** A qué moto del catálogo resolvió, cuando resolvió. */
    modelo: string | null
    /** Entre qué motos dudó, cuando quedó ambigua: sirve para ofrecer el alias. */
    candidatos: { id: number; nombre: string }[]
}

/**
 * Pasa cada grafía escrita en los textareas de compatibilidad por el MISMO
 * resolvedor que usa el bot en vivo.
 *
 * Existe porque `modelo_moto` es texto libre y nadie avisa cuando no resuelve:
 * una fila con "Chilera 110" o "110 wave" se guarda igual, se ve igual en el
 * panel, y simplemente nunca se aplica — o se aplica por parecido a otra moto.
 * Validarlo en el cliente con una lista sería peor que no validarlo: aprobaría
 * grafías que el motor después no reconoce.
 */
export async function analizarMotosCompat(textos: string[]): Promise<MotoAnalizada[]> {
    await requireAdmin()
    const unicos = [...new Set(textos.map((t) => t.trim()).filter(Boolean))]
    const salida: MotoAnalizada[] = []
    for (const texto of unicos) {
        const r = await resolverMoto(texto)
        salida.push({
            texto,
            confianza: r.confianza,
            resuelve: r.confianza === "exacta" || r.confianza === "aproximada",
            modelo: r.modelo?.nombre_completo ?? null,
            candidatos: (r.candidatos || []).slice(0, 5).map((c) => ({ id: Number(c.id), nombre: c.nombre_completo })),
        })
    }
    return salida
}

/** Revisión previa de un pack, para el diálogo de publicación. */
export async function validarPackAction(id: number): Promise<ReporteCatalogo> {
    await requireAdmin()
    return validarPack(id)
}

/** Revisión de todo el catálogo activo, para el panel de salud. */
export async function validarCatalogoAction(): Promise<ReporteCatalogo> {
    await requireAdmin()
    return validarCatalogo()
}
