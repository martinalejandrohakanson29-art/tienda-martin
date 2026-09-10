import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import type { EstadoEmbudo } from "./index"
import { normalizarTexto, puntuarItemCatalogo, formatearPrecioAR } from "../nucleo/texto"

export interface ArgsCatalogoPrecios {
    termino_busqueda?: string
    pack_id?: number
    grupo_id?: number
    /**
     * Lo inyecta el motor (no el LLM): en qué punto del embudo está la charla.
     * Ver `ContextoEjecucion.embudo` en herramientas/index.ts.
     */
    __embudo?: EstadoEmbudo
}

export interface PackInfo {
    id: number
    nombre: string
    precio: number
    envio: string | null
    mensaje_bienvenida?: string
    foto_url?: string | null
    grupo_id?: number | null
    criterio_variante?: string | null
    articulos_sueltos?: ArticuloSueltoInfo[]
}

export interface ArticuloSueltoInfo {
    id: number
    nombre: string
    categoria: string | null
    alias: string | null
    precio: number
    detalle?: string | null
    /**
     * Envío de la pieza VENDIDA SOLA. Tri-estado: true = gratis,
     * false = lo paga el cliente, null/undefined = no se cargó.
     *
     * El envío gratis de un kit NO se hereda a sus piezas sueltas: es una
     * decisión comercial distinta. Antes esta línea no existía y el bloque de
     * piezas sueltas viajaba al modelo con precio pelado, rodeado de "Envío
     * gratis a todo el país" del kit: o callaba (conv 3860) o lo prometía por
     * arrastre.
     */
    envio_gratis?: boolean | null
    envio?: string | null
}

export interface GrupoInfo {
    id: number
    nombre: string
    mensaje_bienvenida?: string
    pregunta_variante?: string | null
    pregunta_variante_reintento?: string | null
    foto_url?: string | null
    variantes: {
        id: number
        nombre: string
        criterio_variante?: string | null
        precio: number
        articulos_sueltos?: ArticuloSueltoInfo[]
    }[]
    articulos_sueltos?: ArticuloSueltoInfo[]
}

export interface ResultadoCatalogoPrecios {
    encontrado: boolean
    packs: PackInfo[]
    grupos: GrupoInfo[]
    mensaje_para_agente: string
}

export const definicionCatalogoPrecios: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "consultar_catalogo_y_precios",
        description: "Consulta los kits, combos y repuestos activos, sus precios vigentes, opciones de variantes (ej. recorrido corto/largo) y políticas de envío asociadas al kit.",
        parameters: {
            type: "object",
            properties: {
                termino_busqueda: {
                    type: "string",
                    description: "Término para filtrar kits (ej: '120', 'tapa cdi', '170 varillero', 'escape', 'leva'). Si se omite, devuelve el catálogo principal."
                },
                pack_id: {
                    type: "number",
                    description: "ID puntual del pack/kit si ya se conoce."
                },
                grupo_id: {
                    type: "number",
                    description: "ID del grupo de variantes si aplica."
                }
            },
            required: []
        }
    }
}

function formatearPrecio(monto: number): string {
    return formatearPrecioAR(monto)
}

/**
 * Costo único del envío de piezas sueltas (chat_config.costo_envio_sueltas),
 * editable en /admin/chatwoot/catalogo. Es por PAQUETE, no por pieza.
 *
 * Sin cargar devuelve null, y ahí el bot dice que el envío corre por cuenta del
 * cliente pero no inventa un monto: el mismo criterio que `envio_gratis` NULL.
 */
export async function obtenerCostoEnvioSueltas(): Promise<number | null> {
    try {
        const filas = await prisma.$queryRaw<{ valor: string }[]>`
            SELECT valor FROM chat_config WHERE clave = 'costo_envio_sueltas' LIMIT 1
        `
        const crudo = filas?.[0]?.valor
        if (!crudo) return null
        const n = Number(String(crudo).replace(/[^\d.-]/g, ""))
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null
    } catch (err) {
        console.error("Error leyendo costo_envio_sueltas:", err)
        return null
    }
}

/**
 * COMPOSICIÓN OFICIAL DE UN KIT ("viene con leva?")
 * -------------------------------------------------
 * Qué trae un kit es un DATO, no algo que el modelo pueda deducir del nombre
 * ("Kit 170 varillero + leva") ni de otro kit parecido del catálogo. Sale de
 * las dos fuentes que son la verdad: las viñetas de la ficha cargada en la app
 * (`mensaje_bienvenida`) y los artículos vinculados en `chat_pack_articulos`.
 *
 * Por qué existe: la ficha viajaba al modelo SOLO en el paso de presentación.
 * Un turno después (kit ya presentado) la herramienta se la ocultaba a
 * propósito para que no la re-mandara, y ahí el modelo se quedaba sin ningún
 * dato de composición: ante "con la leva no viene no?" contestaba de memoria.
 * En la conv 3583 (08/09) afirmó que el kit dakar 200 traía leva. No la trae.
 */
function lineasComposicion(
    mensajeBienvenida: string | null | undefined,
    articulos: ArticuloSueltoInfo[] | undefined
): string[] {
    const salida: string[] = []
    const vistos = new Set<string>()

    const agregar = (texto: string) => {
        const limpio = texto.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "")
        if (!limpio) return
        const clave = normalizarTexto(limpio)
        if (!clave || vistos.has(clave)) return
        vistos.add(clave)
        salida.push(limpio)
    }

    // Los artículos van PRIMERO y con su `detalle`: desde que se hereda, el
    // artículo es la fuente más completa de las dos (la ficha del combo 3 no
    // nombra ni el pistón ni la corona; los detalles de sus piezas, sí).
    const nombresDeArticulos: string[] = []
    for (const art of articulos || []) {
        if (!normalizarTexto(art.nombre)) continue
        nombresDeArticulos.push(art.nombre)
        agregar(lineaPieza(art))
    }

    // Después las viñetas de la ficha, salteando las que repiten una pieza que
    // ya se listó arriba ("Cilindro Dakar 200" vs "Cilindro Dakar 200: Carrera
    // larga (63.5mm)").
    for (const linea of (mensajeBienvenida || "").split(/\n/)) {
        const bruto = linea.trim()
        if (!/^(✅|✔|•|👉🏼|👉|-|\*)/.test(bruto)) continue
        const sinVineta = bruto.replace(/^(✅|✔|•|👉🏼|👉|-|\*)+/, "").trim()
        // Las viñetas de precio / envío no son composición.
        if (!sinVineta || /\$|precio|cuesta|env[ií]o|transferencia|efectivo/i.test(sinVineta)) continue
        const clave = normalizarTexto(sinVineta)
        const yaListada = nombresDeArticulos.some((nombre) => {
            const n = normalizarTexto(nombre)
            return n && (clave.includes(n) || n.includes(clave))
        })
        if (!yaListada) agregar(sinVineta)
    }

    return salida
}

/**
 * Una pieza de la composición, con lo que trae por dentro.
 *
 * El `detalle` del artículo va ENTERO, sin parsear. Es prosa que escribió
 * Martín ("va completo con juntas de cabezal, perno de pistón, aros, seguros y
 * pistón en supermedida 54mm") y cualquier regex que intente extraerle "las
 * piezas" se rompe con la redacción del artículo siguiente: es el mismo error
 * que ya cometió el parser de viñetas de la ficha, que se comió la corona de
 * regalo del combo 3 por estar en un párrafo sin viñeta.
 */
function lineaPieza(art: ArticuloSueltoInfo): string {
    const detalle = (art.detalle || "").replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "")
    return detalle ? `${art.nombre} — ${detalle}` : art.nombre
}

/** Artículos que están en TODAS las variantes (van siempre, sea cual sea la que lleve). */
function articulosComunes(variantes: VarianteComposicion[]): ArticuloSueltoInfo[] {
    if (variantes.length === 0) return []
    const [primera, ...resto] = variantes
    return (primera.articulos || []).filter((art) =>
        resto.every((v) => (v.articulos || []).some((a) => a.id === art.id))
    )
}

interface VarianteComposicion {
    packId: number
    etiqueta: string
    articulos: ArticuloSueltoInfo[]
}

interface OpcionesComposicion {
    mensajeBienvenida?: string | null
    /** Kit simple: sus artículos. En un combo con variantes se pasa `variantes`. */
    articulos?: ArticuloSueltoInfo[]
    variantes?: VarianteComposicion[]
    /** Variante ya definida en el embudo: la composición se arma SOLO con esa. */
    varianteResueltaPackId?: number | null
    yaPresentado: boolean
    /** Categorías de pieza que el catálogo vende por separado (para la regla de negación). */
    categoriasCatalogo: string[]
}

/**
 * Bloque de composición + las reglas para usarla, para el `mensaje_para_agente`.
 *
 * En un combo con variantes la composición NO se aplana: el cliente se lleva UNA
 * variante, no todas. Aplanada, el bot le ofreció a un cliente "los dos
 * cilindros (el corto y el largo)" por el precio de uno (conv 3707, 09/09).
 */
function bloqueComposicion(opciones: OpcionesComposicion): string[] {
    const { mensajeBienvenida, yaPresentado, categoriasCatalogo } = opciones
    const variantes = opciones.variantes || []

    // Con la variante ya definida el combo se trata como un kit simple: el de
    // esa variante. La otra no se menciona, ni para contrastar.
    const resuelta = opciones.varianteResueltaPackId
        ? variantes.find((v) => v.packId === opciones.varianteResueltaPackId)
        : undefined

    const encabezado = yaPresentado
        ? `   - QUÉ TRAE (composición oficial — dato para contestar con precisión, NO la reenvíes como lista salvo que pregunte justo por eso):`
        : `   - QUÉ TRAE (composición oficial de este kit):`

    const cuerpo: string[] = []
    let hayEjeDeVariante = false

    if (variantes.length > 1 && !resuelta) {
        const comunes = articulosComunes(variantes)
        const piezasComunes = lineasComposicion(mensajeBienvenida, comunes).map(
            (p) => `     ✔ ${p}`
        )
        // Las piezas que difieren se listan bajo su variante, nunca sueltas en
        // la misma lista que las comunes.
        const propias = variantes
            .map((v) => ({
                etiqueta: v.etiqueta,
                piezas: (v.articulos || []).filter((a) => !comunes.some((c) => c.id === a.id))
            }))
            .filter((v) => v.piezas.length > 0)

        if (piezasComunes.length > 0) {
            cuerpo.push(`     En las ${variantes.length} opciones por igual:`, ...piezasComunes)
        }
        if (propias.length > 0) {
            hayEjeDeVariante = true
            cuerpo.push(`     Según la variante (el cliente se lleva UNA sola, NO las dos):`)
            for (const v of propias) {
                for (const art of v.piezas) cuerpo.push(`     • ${v.etiqueta} → ${lineaPieza(art)}`)
            }
        }
    } else {
        const articulos = resuelta ? resuelta.articulos : opciones.articulos
        const piezas = lineasComposicion(mensajeBienvenida, articulos)
        cuerpo.push(...piezas.map((p) => `     ✔ ${p}`))
    }

    if (cuerpo.length === 0) return []

    const categorias = categoriasCatalogo.filter((c) => c && c !== "otro")
    const listaCategorias = categorias.length > 0 ? categorias.join(", ") : "leva, escape, carburador, tapa, cilindro"

    const reglas = [
        // Nivel 1: lo que el catálogo vende suelto. Si no está vinculado al kit,
        // NO viene, y eso es dato duro (el fix del kit dakar 200 que "traía" leva).
        `   - Si el cliente pregunta por una PIEZA ENTERA que no figura arriba (${listaCategorias}: cosas que vendemos por separado), la respuesta es que NO viene incluida. PROHIBIDO afirmar que la incluye porque otro kit del catálogo la traiga o porque el nombre del kit suene parecido. Si figura abajo como artículo suelto, podés decirle que va aparte.`,
        // Nivel 2: sub-piezas. La lista NO es exhaustiva hacia adentro: nadie
        // escribió "no trae seguros". Negar acá es inventar (conv 3707: el bot
        // dijo que el cilindro no traía pistón; el detalle dice que sí).
        `   - Si pregunta por algo que va DENTRO de una de esas piezas (pistón, aros, perno, juntas, seguros, válvulas, resortes, retenes...), la respuesta está en el texto de la pieza, arriba: si ahí figura, confirmáselo; si el texto NO lo menciona, no tenés el dato — PROHIBIDO decirle que no viene: ejecutá escalar_a_humano(motivo: 'consulta_tecnica') y guardá silencio.`,
        `   - Los textos de cada pieza son dato para que contestes con precisión, NO son un libreto: contestá SOLO lo que preguntó, con tus palabras, en 1 o 2 renglones. Nunca los recites enteros ni agregues milímetros, medidas o frases de venta que no te pidió.`
    ]

    if (hayEjeDeVariante) {
        reglas.push(
            `   - Si pregunta por algo que cambia según la variante y todavía no sabés cuál lleva: contestale las dos y cerrá preguntándole cuál tiene, en el MISMO renglón (ej: "el pistón va 54mm en el corto y 52.4 en el largo, sabés cuál tenés?"). PROHIBIDO contestar una sola de las dos al azar.`
        )
    }

    return [encabezado, ...cuerpo, ...reglas]
}

/**
 * Dato del anuncio de Meta por el que entró el cliente (click-to-WhatsApp).
 * Chatwoot lo guarda en `content_attributes.referral` del mensaje entrante:
 * el TEXTO del cliente no dice de qué kit viene, el anuncio sí.
 */
export type ReferralAnuncioEntrante = {
    titulo?: string | null
    cuerpo?: string | null
}

/**
 * Resuelve el kit del anuncio a partir del referral de Meta (headline + body),
 * NO del texto del cliente.
 *
 * Es para lo que existe la columna `plantillas_referral` del catálogo, pero
 * nadie le pasaba el referral: el bot solo veía "Hola quiero más información" o
 * "Tengo una skua 150" y adivinaba el kit o preguntaba de cero (convs 3357 y
 * 3664, 08/09).
 *
 * Si el texto del anuncio pega con más de un kit (dos packs cargados con la
 * misma plantilla), devuelve `ambiguo`: no se entrega ninguna bienvenida y el
 * anuncio queda solo como contexto para el modelo.
 */
export async function detectarPlantillaPorReferral(referral: ReferralAnuncioEntrante | null | undefined): Promise<
    | { ambiguo: true; candidatos: string[] }
    | {
          ambiguo: false
          tipo: "pack" | "grupo"
          id: number
          nombre: string
          mensajeBienvenida: string
          fotoUrl?: string | null
          precio?: number
      }
    | null
> {
    // El CUERPO manda: Meta reusa el mismo titulo entre anuncios de productos
    // distintos, asi que resolver el kit por el titulo puede presentar el combo
    // equivocado. El titulo solo se prueba si el cuerpo no resolvio nada (es lo
    // mismo que dice el placeholder del panel: "NO pegues el titulo").
    const cuerpoNorm = normalizarTexto(referral?.cuerpo)
    const tituloNorm = normalizarTexto(referral?.titulo)
    const porPrioridad = [cuerpoNorm, tituloNorm].filter((t) => t.length >= 8)
    if (porPrioridad.length === 0) return null

    // Contención SOLA no alcanza: el body de un anuncio suele ser genérico
    // ("POTENCIA TU 110 CON ESTE COMBO!") y entra dentro de la plantilla de
    // cualquier kit de 110 — así se le ofrecía un combo que no era el del
    // anuncio (conv 3357). Se exige que los dos textos sean casi el mismo: si
    // no, el anuncio queda solo como contexto y el modelo lo busca en el
    // catálogo, que es lo honesto cuando no estamos seguros.
    const CASI_IGUAL = 0.8
    const pega = (plantilla: string | null | undefined, parte: string): boolean => {
        const norm = normalizarTexto(plantilla)
        if (norm.length < 8) return false
        if (parte === norm) return true
        if (!parte.includes(norm) && !norm.includes(parte)) return false
        const corto = Math.min(parte.length, norm.length)
        const largo = Math.max(parte.length, norm.length)
        return corto / largo >= CASI_IGUAL
    }

    try {
        const grupos = await prisma.$queryRaw<
            { id: number; nombre: string; mensaje_bienvenida: string; foto_url: string | null; plantillas_referral: string | null }[]
        >`
            SELECT id, nombre, mensaje_bienvenida, foto_url, plantillas_referral
            FROM chat_pack_grupos
            WHERE activo = true
        `
        const packs = await prisma.$queryRaw<
            { id: number; nombre: string; precio: any; mensaje_bienvenida: string; foto_url: string | null; plantillas_referral: string | null }[]
        >`
            SELECT id, nombre, precio, mensaje_bienvenida, foto_url, plantillas_referral
            FROM chat_packs
            WHERE activo = true
        `

        const buscar = (parte: string) => [
            ...grupos.filter((g) => pega(g.plantillas_referral, parte)).map((g) => ({
                ambiguo: false as const,
                tipo: "grupo" as const,
                id: g.id,
                nombre: g.nombre,
                mensajeBienvenida: g.mensaje_bienvenida,
                fotoUrl: g.foto_url
            })),
            ...packs.filter((p) => pega(p.plantillas_referral, parte)).map((p) => ({
                ambiguo: false as const,
                tipo: "pack" as const,
                id: p.id,
                nombre: p.nombre,
                mensajeBienvenida: p.mensaje_bienvenida,
                fotoUrl: p.foto_url,
                precio: Number(p.precio) || 0
            }))
        ]

        for (const parte of porPrioridad) {
            const candidatos = buscar(parte)
            if (candidatos.length === 0) continue
            if (candidatos.length > 1) {
                return { ambiguo: true, candidatos: candidatos.map((c) => c.nombre) }
            }
            return candidatos[0].mensajeBienvenida ? candidatos[0] : null
        }
        return null
    } catch (err) {
        console.error("Error en detectarPlantillaPorReferral:", err)
        return null
    }
}

/**
 * Detecta si un mensaje recibido coincide con una plantilla publicitaria de Instagram.
 *
 * Dos direcciones, con criterios distintos a propósito:
 *  - el mensaje CONTIENE la plantilla: el cliente mandó el texto del anuncio y
 *    encima su pregunta (la ráfaga típica). Match bueno.
 *  - la plantilla CONTIENE al mensaje: solo si es casi todo el texto. Sin ese
 *    corte, un "Hola quiero más información" pelado entra dentro de la plantilla
 *    de cualquier kit y el bot presentaba el primero que encontraba, un combo
 *    que el cliente nunca pidió (conv 3357, 08/09).
 *
 * Si el mensaje pega con más de un kit, no se entrega ninguna bienvenida: es
 * demasiado genérico para saber de cuál habla.
 */
export async function detectarPlantillaAnuncio(mensajeUsuario: string): Promise<{
    esPlantilla: boolean
    tipo: "pack" | "grupo"
    id: number
    nombre: string
    mensajeBienvenida: string
    fotoUrl?: string | null
    precio?: number
    /** Texto normalizado de la plantilla que dio el match (para separar el resto de la ráfaga). */
    plantillaNormalizada?: string
} | null> {
    const textoNorm = normalizarTexto(mensajeUsuario)
    if (!textoNorm || textoNorm.length < 5) return null

    const CASI_TODA_LA_PLANTILLA = 0.8

    /** Devuelve la plantilla que dio match, o null. */
    const matchear = (...plantillas: (string | null | undefined)[]): string | null => {
        for (const plantilla of plantillas) {
            const norm = normalizarTexto(plantilla)
            if (!norm) continue
            if (textoNorm === norm) return norm
            if (textoNorm.includes(norm)) return norm
            if (norm.includes(textoNorm) && textoNorm.length / norm.length >= CASI_TODA_LA_PLANTILLA) return norm
        }
        return null
    }

    try {
        const grupos = await prisma.$queryRaw<
            { id: number; nombre: string; mensaje_bienvenida: string; foto_url: string | null; plantillas_bienvenida: string | null; plantillas_referral: string | null }[]
        >`
            SELECT id, nombre, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral
            FROM chat_pack_grupos
            WHERE activo = true
        `
        const packs = await prisma.$queryRaw<
            { id: number; nombre: string; precio: any; mensaje_bienvenida: string; foto_url: string | null; plantillas_bienvenida: string | null; plantillas_referral: string | null }[]
        >`
            SELECT id, nombre, precio, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral
            FROM chat_packs
            WHERE activo = true
        `

        const candidatos: NonNullable<Awaited<ReturnType<typeof detectarPlantillaAnuncio>>>[] = []

        for (const g of grupos) {
            const plantilla = matchear(g.plantillas_bienvenida, g.plantillas_referral)
            if (plantilla) {
                candidatos.push({
                    esPlantilla: true,
                    tipo: "grupo",
                    id: g.id,
                    nombre: g.nombre,
                    mensajeBienvenida: g.mensaje_bienvenida,
                    fotoUrl: g.foto_url,
                    plantillaNormalizada: plantilla
                })
            }
        }

        for (const p of packs) {
            const plantilla = matchear(p.plantillas_bienvenida, p.plantillas_referral)
            if (plantilla) {
                candidatos.push({
                    esPlantilla: true,
                    tipo: "pack",
                    id: p.id,
                    nombre: p.nombre,
                    mensajeBienvenida: p.mensaje_bienvenida,
                    fotoUrl: p.foto_url,
                    precio: Number(p.precio) || 0,
                    plantillaNormalizada: plantilla
                })
            }
        }

        if (candidatos.length === 0) return null
        if (candidatos.length > 1) {
            // Empate: gana un match exacto si hay uno solo; si no, nadie.
            const exactos = candidatos.filter((c) => c.plantillaNormalizada === textoNorm)
            if (exactos.length !== 1) {
                console.warn(
                    `[catalogo] el mensaje pega con varias plantillas (${candidatos.map((c) => c.nombre).join(", ")}): no se entrega bienvenida`
                )
                return null
            }
            return exactos[0]
        }
        return candidatos[0]
    } catch (err) {
        console.error("Error en detectarPlantillaAnuncio:", err)
        return null
    }
}

export async function consultarCatalogoPrecios(args: ArgsCatalogoPrecios): Promise<ResultadoCatalogoPrecios> {
    try {
        // Consultar packs simples activos incluyendo plantillas y detalles
        const packsRaw = await prisma.$queryRaw<
            {
                id: number
                nombre: string
                precio: any
                envio: string | null
                mensaje_bienvenida: string
                foto_url: string | null
                grupo_id: number | null
                criterio_variante: string | null
                plantillas_bienvenida: string | null
                plantillas_referral: string | null
            }[]
        >`
            SELECT id, nombre, precio, envio, mensaje_bienvenida, foto_url, grupo_id, criterio_variante, plantillas_bienvenida, plantillas_referral
            FROM chat_packs
            WHERE activo = true
            ORDER BY id ASC
        `

        // Consultar grupos activos incluyendo plantillas
        const gruposRaw = await prisma.$queryRaw<
            {
                id: number
                nombre: string
                mensaje_bienvenida: string
                pregunta_variante: string | null
                pregunta_variante_reintento: string | null
                foto_url: string | null
                plantillas_bienvenida: string | null
                plantillas_referral: string | null
            }[]
        >`
            SELECT id, nombre, mensaje_bienvenida, pregunta_variante, pregunta_variante_reintento, foto_url, plantillas_bienvenida, plantillas_referral
            FROM chat_pack_grupos
            WHERE activo = true
            ORDER BY nombre ASC
        `

        // Consultar artículos sueltos vinculados a cada pack (chat_pack_articulos + chat_articulos)
        const articulosRaw = await prisma.$queryRaw<
            {
                pack_id: number
                articulo_id: number
                nombre_mostrador: string | null
                titulo_comercial: string | null
                categoria: string | null
                alias: string | null
                precio: any
                detalle: string | null
                envio_gratis: boolean | null
                envio: string | null
            }[]
        >`
            SELECT 
                cpa.pack_id,
                ca.id as articulo_id,
                am.nombre as nombre_mostrador,
                ca.titulo_comercial,
                ca.categoria,
                ca.alias,
                ca.precio,
                ca.detalle,
                ca.envio_gratis,
                ca.envio
            FROM chat_pack_articulos cpa
            JOIN chat_articulos ca ON ca.id = cpa.articulo_id
            LEFT JOIN articulos_mostrador am ON am.id = ca.articulo_mostrador_id
            WHERE ca.activo = true
            ORDER BY cpa.pack_id, cpa.orden ASC
        `

        const articulosPorPack = new Map<number, ArticuloSueltoInfo[]>()
        for (const a of articulosRaw || []) {
            if (!articulosPorPack.has(a.pack_id)) {
                articulosPorPack.set(a.pack_id, [])
            }
            articulosPorPack.get(a.pack_id)!.push({
                id: a.articulo_id,
                nombre: a.titulo_comercial || a.categoria || a.nombre_mostrador || "Pieza suelta",
                categoria: a.categoria,
                alias: a.alias,
                precio: Number(a.precio) || 0,
                // Qué trae la pieza por dentro ("el cilindro va completo con
                // juntas, perno, aros, seguros y pistón"). Se pedía en el SELECT
                // y se descartaba acá: la composición quedaba en tres títulos
                // pelados y el bot NEGABA piezas que sí vienen (conv 3707).
                detalle: a.detalle,
                envio_gratis: a.envio_gratis,
                envio: a.envio
            })
        }

        const packs: (PackInfo & { plantillas_bienvenida?: string | null; plantillas_referral?: string | null })[] = (packsRaw || []).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precio) || 0,
            envio: p.envio,
            mensaje_bienvenida: p.mensaje_bienvenida,
            foto_url: p.foto_url,
            grupo_id: p.grupo_id,
            criterio_variante: p.criterio_variante,
            plantillas_bienvenida: p.plantillas_bienvenida,
            plantillas_referral: p.plantillas_referral,
            articulos_sueltos: articulosPorPack.get(p.id) || []
        }))

        const grupos: (GrupoInfo & { plantillas_bienvenida?: string | null; plantillas_referral?: string | null })[] = (gruposRaw || []).map((g) => {
            const variantes = packs
                .filter((p) => p.grupo_id === g.id)
                .map((v) => ({
                    id: v.id,
                    nombre: v.nombre,
                    criterio_variante: v.criterio_variante ?? null,
                    precio: v.precio,
                    articulos_sueltos: v.articulos_sueltos
                }))

            const packIdsDelGrupo = packs.filter((p) => p.grupo_id === g.id).map((p) => p.id)
            const mapArticulosGrupo = new Map<number, ArticuloSueltoInfo>()
            for (const pid of packIdsDelGrupo) {
                const arts = articulosPorPack.get(pid) || []
                for (const art of arts) {
                    if (!mapArticulosGrupo.has(art.id)) {
                        mapArticulosGrupo.set(art.id, art)
                    }
                }
            }
            const articulosGrupo = Array.from(mapArticulosGrupo.values())

            return {
                id: g.id,
                nombre: g.nombre,
                mensaje_bienvenida: g.mensaje_bienvenida,
                pregunta_variante: g.pregunta_variante,
                pregunta_variante_reintento: g.pregunta_variante_reintento,
                foto_url: g.foto_url,
                plantillas_bienvenida: g.plantillas_bienvenida,
                plantillas_referral: g.plantillas_referral,
                variantes,
                articulos_sueltos: articulosGrupo
            }
        })

        // Filtrar según argumentos si se envió término de búsqueda
        let packsFiltrados = packs.filter((p) => !p.grupo_id)
        let gruposFiltrados = grupos

        if (args.pack_id) {
            packsFiltrados = packs.filter((p) => p.id === args.pack_id)
            gruposFiltrados = []
        } else if (args.grupo_id) {
            gruposFiltrados = grupos.filter((g) => g.id === args.grupo_id)
            packsFiltrados = []
        } else if (args.termino_busqueda) {
            // Scorer unico y compartido: ver bot-agente/nucleo/texto.ts
            const puntuarItem = (nombre: string, corpusExtra: string): number =>
                puntuarItemCatalogo(args.termino_busqueda!, nombre, corpusExtra)

            const scoredGrupos = gruposFiltrados.map((g) => {
                const corpusArticulosG = (g.articulos_sueltos || []).map((a) => `${a.nombre} ${a.categoria || ""} ${a.alias || ""}`).join(" ")
                const corpusGrupo = `${g.nombre} ${g.plantillas_bienvenida || ""} ${g.plantillas_referral || ""} ${g.mensaje_bienvenida || ""} ${g.variantes.map((v) => `${v.nombre} ${v.criterio_variante || ""}`).join(" ")} ${corpusArticulosG}`
                return { item: g, score: puntuarItem(g.nombre, corpusGrupo) }
            })

            const scoredPacks = packsFiltrados.map((p) => {
                const corpusArticulos = (p.articulos_sueltos || []).map((a) => `${a.nombre} ${a.categoria || ""} ${a.alias || ""}`).join(" ")
                const corpusPack = `${p.nombre} ${p.criterio_variante || ""} ${p.plantillas_bienvenida || ""} ${p.plantillas_referral || ""} ${p.mensaje_bienvenida || ""} ${corpusArticulos}`
                return { item: p, score: puntuarItem(p.nombre, corpusPack) }
            })

            const allScores = [...scoredGrupos.map((s) => s.score), ...scoredPacks.map((s) => s.score)]
            const maxScore = Math.max(...allScores, 0)

            if (maxScore >= 30) {
                gruposFiltrados = scoredGrupos.filter((s) => s.score > 0 && s.score >= maxScore * 0.75).map((s) => s.item)
                packsFiltrados = scoredPacks.filter((s) => s.score > 0 && s.score >= maxScore * 0.75).map((s) => s.item)
            } else {
                gruposFiltrados = []
                packsFiltrados = []
            }
        }

        if (packsFiltrados.length === 0 && gruposFiltrados.length === 0) {
            return {
                encontrado: false,
                packs: [],
                grupos: [],
                mensaje_para_agente: `No hubo match en el catálogo para '${args.termino_busqueda || ""}'. OJO: esto NO significa que no lo vendamos — puede ser un problema de cómo se escribió la búsqueda o un producto real que todavía no está cargado. PROHIBIDO decirle al cliente "no lo tenemos", "no figura en el catálogo" o "no existe". Si tenés dudas de a qué producto se refiere, probá otra búsqueda más simple (ej: solo el número de cilindrada). Si sigue sin aparecer, ejecutá escalar_a_humano con motivo 'producto_no_encontrado' y guardá silencio.`
            }
        }

        // Resumen formateado para que el agente redacte con precisión
        const totalOpciones = packsFiltrados.length + gruposFiltrados.length
        if (totalOpciones > 1) {
            const nombresOpciones = [
                ...gruposFiltrados.map((g) => g.nombre),
                ...packsFiltrados.map((p) => p.nombre)
            ]
            const cierrePregunta = nombresOpciones.length === 2 ? "Cuál de los dos estás buscando?" : "Cuál de estas estás buscando?"
            const bloqueParaCliente = [
                ...nombresOpciones.map((n) => `👉🏼 ${n}`),
                "",
                cierrePregunta
            ].join("\n")

            const lineasOpciones: string[] = [
                `CATÁLOGO OFICIAL — PASO 1: IDENTIFICAR EL KIT.`,
                `El cliente todavía no eligió. Tu único objetivo es que elija cuál opción quiere.`,
                ``,
                `TEXTO PARA ENVIAR AL CLIENTE (mandalo TAL CUAL, respetando cada 👉🏼 en su renglón; solo podés ajustar el saludo inicial):`,
                bloqueParaCliente,
                ``,
                `REGLAS:`,
                `- PROHIBIDO dar precios o variantes todavía.`,
                `- Si el cliente NO mencionó su moto: NO preguntes por la moto todavía.`,
                `- No agregues descripciones de lo que incluye cada kit: solo los nombres.`
            ]

            return {
                encontrado: true,
                packs: packsFiltrados,
                grupos: gruposFiltrados,
                mensaje_para_agente: lineasOpciones.join("\n")
            }
        }

        // Caso de 1 sola opción: Entregar la ficha completa con variantes y detalles oficiales.
        //
        // Salvo que el kit YA se le haya presentado al cliente en esta charla
        // (`__embudo`): ahí la herramienta entrega datos secos en vez del libreto
        // de bienvenida. Si no, ante una pregunta puntual ("ya viene listo para
        // colocar?") el modelo obedece la guía del paso y re-manda la ficha
        // entera, con precio y foto incluidos (conv 2763, 08/09).
        const embudo = args.__embudo || {}
        // Qué piezas vende el catálogo por separado. Es la línea que separa
        // "no viene incluida" (dato duro) de "no tengo el dato" (escalar):
        // ver las reglas de `bloqueComposicion`.
        const categoriasCatalogo = Array.from(
            new Set((articulosRaw || []).map((a) => (a.categoria || "").trim().toLowerCase()).filter(Boolean))
        ).sort()
        const grupoYaPresentado = (g: { id: number }) => embudo.grupoPineadoId === g.id
        const packYaPresentado = (pk: { id: number }) => embudo.packPresentadoId === pk.id
        const todoYaPresentado =
            packsFiltrados.every(packYaPresentado) && gruposFiltrados.every(grupoYaPresentado)

        const lineas: string[] = [
            todoYaPresentado
                ? "CATÁLOGO OFICIAL (DATOS SECOS — NO es un paso de presentación):"
                : "CATÁLOGO OFICIAL:"
        ]

        for (const p of packsFiltrados) {
            lineas.push(`• Kit Simple: "${p.nombre}" (ID: ${p.id})`)
            lineas.push(`   - Precio: ${formatearPrecio(p.precio)}${p.envio ? ` - Envío: ${p.envio}` : " - Envío gratis a todo el país"}`)
            if (packYaPresentado(p)) {
                lineas.push(`   - YA PRESENTADO: el cliente ya recibió en esta charla la ficha completa, la foto y el precio de este kit.`)
                lineas.push(`   - PROHIBIDO reenviar el mensaje de bienvenida, la lista de "qué incluye", la foto o repetir el precio que ya le diste.`)
                lineas.push(`   - Estos datos son SOLO para que contestes con precisión lo que el cliente preguntó recién: contestá eso en 1 o 2 renglones y cerrá corto.`)
            } else if (p.mensaje_bienvenida) {
                lineas.push(`   - Mensaje oficial cargado en la app (respetar formato, listas y datos técnicos; si la charla ya está en curso, OMITIR el saludo inicial):\n${p.mensaje_bienvenida.trim()}`)
            }
            lineas.push(
                ...bloqueComposicion({
                    mensajeBienvenida: p.mensaje_bienvenida,
                    articulos: p.articulos_sueltos,
                    yaPresentado: packYaPresentado(p),
                    categoriasCatalogo
                })
            )
            if (p.articulos_sueltos && p.articulos_sueltos.length > 0) {
                lineas.push(`   - Artículos y piezas sueltas de este kit (SOLO si el cliente pide expresamente una pieza sola por separado):`)
                for (const art of p.articulos_sueltos) {
                    lineas.push(`     * ${art.nombre}: ${formatearPrecio(art.precio)} (ID Art. ${art.id})`)
                    if (art.alias) lineas.push(`       Alias de búsqueda: ${art.alias}`)
                }
            }
            lineas.push("")
        }

        for (const g of gruposFiltrados) {
            lineas.push(`• Combo: "${g.nombre}" (ID: ${g.id})`)
            const bloqueVariantes = [
                ...g.variantes.map((v) => `👉🏼 ${v.criterio_variante || v.nombre}: ${formatearPrecio(v.precio)}`),
                "",
                "Envío gratis a todo el país!"
            ].join("\n")

            if (grupoYaPresentado(g)) {
                // El combo ya se presentó (lo pineó una tool de un turno anterior
                // o el equipo lo mandó a mano desde el panel de chats en vivo).
                // Nada de libreto de bienvenida: datos secos para contestar lo
                // puntual que preguntó el cliente.
                lineas.push(`   - YA PRESENTADO: el cliente ya recibió en esta charla la ficha, la foto y las opciones con precio de este combo.`)
                lineas.push(`   - PROHIBIDO reenviar el mensaje de bienvenida, la lista de "qué incluye", la foto o volver a listar las variantes.`)
                if (embudo.varianteResuelta) {
                    lineas.push(`   - Variante YA definida: "${embudo.varianteResuelta.etiqueta}" ${formatearPrecio(embudo.varianteResuelta.precio)} con envío gratis. Ya se lo dijiste: NO se lo repitas salvo que él pregunte el precio de nuevo.`)
                } else {
                    lineas.push(`   - Precios de referencia (solo por si el cliente vuelve a preguntar el precio): ${g.variantes.map((v) => `${v.criterio_variante || v.nombre} ${formatearPrecio(v.precio)}`).join(" / ")}.`)
                }
                lineas.push(`   - Estos datos son SOLO para que contestes con precisión lo que el cliente preguntó recién: contestá eso en 1 o 2 renglones y cerrá corto.`)
                lineas.push(`   - Si el cliente vuelve a hablar de su moto o de la variante, usá resolver_variante(combo: "${g.nombre}", mensaje_cliente, modelo_moto?, cliente_no_sabe?). NUNCA consultar_compatibilidad para este combo.`)
            } else {
                lineas.push(`   - PASO 2 (el cliente ya eligió este combo pero NO dio su moto ni su variante).`)
                if (g.mensaje_bienvenida) {
                    lineas.push(`   - TEXTO PARA ENVIAR AL CLIENTE (mandá el mensaje oficial tal cual, respetando saltos de renglón y viñetas; si la charla ya está en curso OMITÍ el saludo inicial y NADA MÁS):`)
                    lineas.push(g.mensaje_bienvenida.trim())
                } else {
                    lineas.push(`   - TEXTO PARA ENVIAR AL CLIENTE (respetá cada 👉🏼 en su renglón):`)
                    lineas.push(`${bloqueVariantes}\n\nPara qué moto lo estás buscando?`)
                }
                lineas.push(`   - Precios de referencia (por si necesitás confirmarlos): ${g.variantes.map((v) => `${v.criterio_variante || v.nombre} ${formatearPrecio(v.precio)}`).join(" / ")}.`)
                lineas.push(`   - PROHIBIDO afirmar "le va bien a tu moto" u opinar sobre compatibilidad: todavía no sabés qué moto tiene.`)
                lineas.push(`   - En cuanto el cliente diga su moto O su variante (corto/largo/etc.), usá SIEMPRE resolver_variante(combo: "${g.nombre}", mensaje_cliente, modelo_moto?, cliente_no_sabe?). NUNCA consultar_compatibilidad para este combo, NUNCA redactes el precio de memoria. Hacé lo que devuelva.`)
            }
            lineas.push(
                ...bloqueComposicion({
                    mensajeBienvenida: g.mensaje_bienvenida,
                    // Por variante, NO la unión del grupo: el cliente se lleva una.
                    variantes: g.variantes.map((v) => ({
                        packId: v.id,
                        etiqueta: v.criterio_variante || v.nombre,
                        articulos: v.articulos_sueltos || []
                    })),
                    varianteResueltaPackId: embudo.varianteResuelta?.packId ?? null,
                    yaPresentado: grupoYaPresentado(g),
                    categoriasCatalogo
                })
            )
            if (g.articulos_sueltos && g.articulos_sueltos.length > 0) {
                lineas.push(`   - Artículos y piezas sueltas que componen este combo (SOLO si el cliente pide expresamente una pieza sola por separado):`)
                for (const art of g.articulos_sueltos) {
                    lineas.push(`     * ${art.nombre}: ${formatearPrecio(art.precio)} (ID Art. ${art.id})`)
                    if (art.alias) lineas.push(`       Alias de búsqueda: ${art.alias}`)
                }
            }
            lineas.push("")
        }

        // Dos piezas sueltas NO son un combo: el total y su envío los calcula
        // `cotizar_piezas_sueltas`, nunca el modelo. En la conv 3860 el bot sumó
        // de cabeza ($30.000 + $8.500 = "$38.500 los dos juntos"): la cuenta dio
        // bien, pero era un combo inexistente, sin una palabra de envío, y el
        // catálogo tenía un pack real que cubría lo que el cliente pedía.
        const reglaSuma = `⚠️ PARA COTIZAR PIEZAS SUELTAS (una o varias) usá cotizar_piezas_sueltas(articulo_ids: [...]) con los ID Art. de arriba, y respondé con lo que devuelva. Ella resuelve el total y el envío, que NO es el del kit. PROHIBIDO sumar precios vos mismo ni prometer envío gratis por una pieza suelta.`

        if (todoYaPresentado) {
            lineas.push(`⚠️ PIEZAS SUELTAS: solo si el cliente las pide con palabras explícitas ("sola", "solo", "suelto", "separado", "nomás"). En ese caso, nombre comercial y precio, sin ficha técnica y sin repetir el combo completo.`)
            lineas.push(reglaSuma)
        } else {
            lineas.push(`⚠️ REGLA COMERCIAL PARA PIEZAS SUELTAS / ARTÍCULOS POR SEPARADO:`)
            lineas.push(`- Una consulta por pieza suelta requiere que el cliente EXPLÍCITAMENTE use palabras como "sola", "solo", "suelto", "separado", "nomás" (ej: "la tapa sola cuánto sale?", "vendés el carburador solo?").`)
            lineas.push(`- Si el bot le preguntó qué opción busca y el cliente responde "tapa cdi", "el de tapa cdi" o "con tapa", EL CLIENTE ESTÁ ELIGIENDO EL COMBO COMPLETO, NO PIDIENDO UNA PIEZA SUELTA. En ese caso entregá la bienvenida y precios del combo completo (Paso 2). ¡PROHIBIDO responder con la pieza suelta si no dijo "sola"!`)
            lineas.push(`- Si el cliente efectivamente pregunta expresamente por una pieza SOLA por separado:`)
            lineas.push(`  1. Respondé ÚNICAMENTE su nombre comercial y el precio (ej: "La Tapa CDI 125 sola cuesta $124.999 con las dos coronitas de regalo").`)
            lineas.push(`  2. CERO VOLCADO DE FICHA TÉCNICA: NO expliques válvulas, conductos, cielo, milímetros ni detalles técnicos a menos que el cliente haya preguntado específicamente sobre eso.`)
            lineas.push(`  3. Podés invitar amablemente a coordinar: "Si te interesa avisame y coordinamos!"`)
            lineas.push(`  4. ¡PROHIBIDO repetir el mensaje de bienvenida del combo completo cuando preguntan por una pieza suelta!`)
            lineas.push(`  5. Solo podés ofrecer piezas sueltas que pertenezcan al kit del cual se está hablando en la conversación.`)
            lineas.push(reglaSuma)
        }

        return {
            encontrado: true,
            packs: packsFiltrados,
            grupos: gruposFiltrados,
            mensaje_para_agente: lineas.join("\n")
        }
    } catch (error: any) {
        console.error("Error en consultarCatalogoPrecios:", error)
        return {
            encontrado: false,
            packs: [],
            grupos: [],
            mensaje_para_agente: "Error temporal al consultar el catálogo de precios."
        }
    }
}

export const herramientaCatalogoPrecios: EjecutorHerramienta<ArgsCatalogoPrecios, ResultadoCatalogoPrecios> = {
    definicion: definicionCatalogoPrecios,
    ejecutar: consultarCatalogoPrecios
}
