import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"

export interface ArgsCatalogoPrecios {
    termino_busqueda?: string
    pack_id?: number
    grupo_id?: number
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
    detalle: string | null
}

export interface GrupoInfo {
    id: number
    nombre: string
    mensaje_bienvenida?: string
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
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0
    }).format(monto)
}

function normalizarTexto(txt: string): string {
    return (txt || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Detecta si un mensaje recibido coincide con una plantilla publicitaria de Instagram
 */
export async function detectarPlantillaAnuncio(mensajeUsuario: string): Promise<{
    esPlantilla: boolean
    tipo: "pack" | "grupo"
    id: number
    nombre: string
    mensajeBienvenida: string
    fotoUrl?: string | null
} | null> {
    const textoNorm = normalizarTexto(mensajeUsuario)
    if (!textoNorm || textoNorm.length < 5) return null

    try {
        // 1. Revisar grupos
        const grupos = await prisma.$queryRaw<
            { id: number; nombre: string; mensaje_bienvenida: string; foto_url: string | null; plantillas_bienvenida: string | null; plantillas_referral: string | null }[]
        >`
            SELECT id, nombre, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral
            FROM chat_pack_grupos
            WHERE activo = true
        `

        for (const g of grupos) {
            const normBienv = normalizarTexto(g.plantillas_bienvenida || "")
            const normRef = normalizarTexto(g.plantillas_referral || "")

            if (
                (normBienv && (textoNorm === normBienv || textoNorm.includes(normBienv) || normBienv.includes(textoNorm))) ||
                (normRef && (textoNorm === normRef || textoNorm.includes(normRef) || normRef.includes(textoNorm)))
            ) {
                return {
                    esPlantilla: true,
                    tipo: "grupo",
                    id: g.id,
                    nombre: g.nombre,
                    mensajeBienvenida: g.mensaje_bienvenida,
                    fotoUrl: g.foto_url
                }
            }
        }

        // 2. Revisar packs
        const packs = await prisma.$queryRaw<
            { id: number; nombre: string; mensaje_bienvenida: string; foto_url: string | null; plantillas_bienvenida: string | null; plantillas_referral: string | null }[]
        >`
            SELECT id, nombre, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral
            FROM chat_packs
            WHERE activo = true
        `

        for (const p of packs) {
            const normBienv = normalizarTexto(p.plantillas_bienvenida || "")
            const normRef = normalizarTexto(p.plantillas_referral || "")

            if (
                (normBienv && (textoNorm === normBienv || textoNorm.includes(normBienv) || normBienv.includes(textoNorm))) ||
                (normRef && (textoNorm === normRef || textoNorm.includes(normRef) || normRef.includes(textoNorm)))
            ) {
                return {
                    esPlantilla: true,
                    tipo: "pack",
                    id: p.id,
                    nombre: p.nombre,
                    mensajeBienvenida: p.mensaje_bienvenida,
                    fotoUrl: p.foto_url
                }
            }
        }

        return null
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
                foto_url: string | null
                plantillas_bienvenida: string | null
                plantillas_referral: string | null
            }[]
        >`
            SELECT id, nombre, mensaje_bienvenida, foto_url, plantillas_bienvenida, plantillas_referral
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
                categoria: string | null
                alias: string | null
                precio: any
                detalle: string | null
            }[]
        >`
            SELECT 
                cpa.pack_id,
                ca.id as articulo_id,
                am.nombre as nombre_mostrador,
                ca.categoria,
                ca.alias,
                ca.precio,
                ca.detalle
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
                nombre: a.nombre_mostrador || a.categoria || "Pieza suelta",
                categoria: a.categoria,
                alias: a.alias,
                precio: Number(a.precio) || 0,
                detalle: a.detalle
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
            const termNorm = normalizarTexto(args.termino_busqueda)
            const palabrasTerm = termNorm.split(" ").filter((w) => w.length >= 2)
            const numerosTerm = termNorm.match(/\b\d+\b/g) || []

            const matchTexto = (corpus: string): boolean => {
                const normCorpus = normalizarTexto(corpus)
                // 1. Inclusión directa
                if (normCorpus.includes(termNorm) || termNorm.includes(normCorpus)) return true

                // 2. Coincidencia por números clave (ej: "110", "120", "170", "200")
                if (numerosTerm.length > 0) {
                    const todosNumerosPresentes = numerosTerm.every((n) => {
                        const rx = new RegExp(`\\b${n}\\b`)
                        return rx.test(normCorpus)
                    })
                    if (todosNumerosPresentes) return true
                }

                // 3. Palabras coincidentes suficientes
                const palabrasCoincidentes = palabrasTerm.filter((p) => normCorpus.includes(p))
                if (palabrasTerm.length >= 2 && palabrasCoincidentes.length >= 2) return true
                if (palabrasTerm.length === 1 && palabrasCoincidentes.length === 1 && palabrasTerm[0].length >= 3) return true

                return false
            }

            packsFiltrados = packsFiltrados.filter((p) => {
                const corpusArticulos = (p.articulos_sueltos || []).map((a) => `${a.nombre} ${a.categoria || ""} ${a.alias || ""}`).join(" ")
                const corpusPack = `${p.nombre} ${p.criterio_variante || ""} ${p.plantillas_bienvenida || ""} ${p.plantillas_referral || ""} ${p.mensaje_bienvenida || ""} ${corpusArticulos}`
                return matchTexto(corpusPack)
            })

            gruposFiltrados = gruposFiltrados.filter((g) => {
                const corpusArticulosG = (g.articulos_sueltos || []).map((a) => `${a.nombre} ${a.categoria || ""} ${a.alias || ""}`).join(" ")
                const corpusGrupo = `${g.nombre} ${g.plantillas_bienvenida || ""} ${g.plantillas_referral || ""} ${g.mensaje_bienvenida || ""} ${g.variantes.map((v) => `${v.nombre} ${v.criterio_variante || ""}`).join(" ")} ${corpusArticulosG}`
                return matchTexto(corpusGrupo)
            })
        }

        if (packsFiltrados.length === 0 && gruposFiltrados.length === 0) {
            return {
                encontrado: false,
                packs: [],
                grupos: [],
                mensaje_para_agente: `No se encontró ningún kit activo con el término '${args.termino_busqueda || ""}'. Si el cliente pide una pieza que no está en el catálogo, indica que no la tenemos o escala al equipo.`
            }
        }

        // Resumen formateado para que el agente redacte con precisión
        const totalOpciones = packsFiltrados.length + gruposFiltrados.length
        if (totalOpciones > 1) {
            const lineasOpciones: string[] = [
                `CATÁLOGO OFICIAL:`,
                `⚠️ ATENCIÓN VENDEDOR (MÚLTIPLES COMBOS ENCONTRADOS):`,
                `Se encontraron ${totalOpciones} combos/kits diferentes en el catálogo para esta consulta:`
            ]

            let i = 1
            for (const g of gruposFiltrados) {
                let tituloGrupo = g.nombre
                const nombreNorm = g.nombre.toLowerCase()
                const bienvNorm = (g.mensaje_bienvenida || "").toLowerCase()
                if (nombreNorm.includes("tapa cdi") || bienvNorm.includes("tapa cdi")) {
                    tituloGrupo = "Combo Kit 120 con Tapa CDI"
                } else if (nombreNorm.includes("120") && !nombreNorm.includes("carburador")) {
                    tituloGrupo = "Kit 120 con Carburador y Codo"
                } else if (nombreNorm.includes("escape") && nombreNorm.includes("leva")) {
                    tituloGrupo = "Combo Escape PWR + Leva 6.40"
                }
                lineasOpciones.push(`👉🏼 Opción ${i}: ${tituloGrupo}`)
                i++
            }

            for (const p of packsFiltrados) {
                lineasOpciones.push(`👉🏼 Opción ${i}: ${p.nombre}`)
                i++
            }

            lineasOpciones.push("")
            lineasOpciones.push("REGLA ESTRICTA DE MOSTRADOR (PASO 1: IDENTIFICAR EL KIT):")
            lineasOpciones.push("- El cliente todavía no definió cuál kit busca.")
            lineasOpciones.push("- Tu ÚNICO objetivo en este mensaje es que el cliente elija cuál de las opciones le interesa.")
            lineasOpciones.push("- PROHIBIDO dar precios de variantes todavía.")
            lineasOpciones.push("- PROHIBIDO mencionar recorrido corto o largo todavía.")
            lineasOpciones.push("- Si el cliente NO mencionó su moto: NO preguntes por la moto todavía. Solo preguntale cuál de los dos busca.")
            lineasOpciones.push("- Presentale ÚNICAMENTE las opciones por su nombre y preguntale: 'Cuál de los dos estás buscando?'")

            return {
                encontrado: true,
                packs: packsFiltrados,
                grupos: gruposFiltrados,
                mensaje_para_agente: lineasOpciones.join("\n")
            }
        }

        // Caso de 1 sola opción: Entregar la ficha completa con variantes y detalles oficiales
        const lineas: string[] = ["CATÁLOGO OFICIAL:"]

        for (const p of packsFiltrados) {
            lineas.push(`• Kit Simple: "${p.nombre}" (ID: ${p.id})`)
            lineas.push(`   - Precio: ${formatearPrecio(p.precio)}${p.envio ? ` - Envío: ${p.envio}` : " - Envío gratis a todo el país"}`)
            if (p.mensaje_bienvenida) {
                lineas.push(`   - Mensaje oficial cargado en la app (respetar su formato y saltos de línea):\n${p.mensaje_bienvenida.trim()}`)
            }
            if (p.articulos_sueltos && p.articulos_sueltos.length > 0) {
                lineas.push(`   - Artículos y piezas sueltas de este kit (SOLO si el cliente pide expresamente una pieza sola por separado):`)
                for (const art of p.articulos_sueltos) {
                    lineas.push(`     * ${art.nombre} (${art.categoria || 'pieza'}): ${formatearPrecio(art.precio)} (ID Art. ${art.id})`)
                    if (art.alias) lineas.push(`       Alias de búsqueda: ${art.alias}`)
                    if (art.detalle) lineas.push(`       Detalle: ${art.detalle.replace(/\s+/g, ' ').trim()}`)
                }
            }
            lineas.push("")
        }

        for (const g of gruposFiltrados) {
            let tituloGrupo = g.nombre
            const nombreNorm = g.nombre.toLowerCase()
            const bienvNorm = (g.mensaje_bienvenida || "").toLowerCase()

            if (nombreNorm.includes("tapa cdi") || bienvNorm.includes("tapa cdi")) {
                tituloGrupo = "Combo Tapa CDI + Cilindro 120"
            } else if (nombreNorm.includes("120") && !nombreNorm.includes("carburador")) {
                tituloGrupo = "Kit 120 con Carburador y Codo"
            } else if (nombreNorm.includes("escape") && nombreNorm.includes("leva")) {
                tituloGrupo = "Combo Escape PWR + Leva 6.40"
            }

            lineas.push(`• Combo: "${tituloGrupo}" (${g.nombre}) (ID: ${g.id})`)
            lineas.push(`   - Opciones y precios del combo completo:`)
            for (const v of g.variantes) {
                lineas.push(`     * ${v.criterio_variante || v.nombre}: ${formatearPrecio(v.precio)} (ID: ${v.id})`)
            }
            lineas.push(`   - Envío: Gratis a todo el país por Andreani a domicilio`)
            if (g.mensaje_bienvenida) {
                lineas.push(`   - Mensaje oficial cargado en la app (respetar su formato y saltos de línea para consultas del combo):\n${g.mensaje_bienvenida.trim()}`)
            }
            if (g.articulos_sueltos && g.articulos_sueltos.length > 0) {
                lineas.push(`   - Artículos y piezas sueltas que componen este combo (SOLO si el cliente pide expresamente una pieza sola por separado):`)
                for (const art of g.articulos_sueltos) {
                    lineas.push(`     * ${art.nombre} (${art.categoria || 'pieza'}): ${formatearPrecio(art.precio)} (ID Art. ${art.id})`)
                    if (art.alias) lineas.push(`       Alias de búsqueda: ${art.alias}`)
                    if (art.detalle) lineas.push(`       Detalle: ${art.detalle.replace(/\s+/g, ' ').trim()}`)
                }
            }
            lineas.push("")
        }

        lineas.push(`⚠️ REGLA COMERCIAL PARA PIEZAS SUELTAS / ARTÍCULOS POR SEPARADO:`)
        lineas.push(`- Si el cliente pregunta expresamente por una pieza sola por separado (ej: "la tapa sola cuánto cuesta?", "vendés el carburador solo?", "precio del cilindro solo?"):`)
        lineas.push(`  1. Verificá si la pieza que pide está listada en los 'Artículos y piezas sueltas' del combo actual.`)
        lineas.push(`  2. Si existe: respondé DIRECTAMENTE el precio exacto de esa pieza suelta y qué incluye de forma breve y amable. Podés recordarle amablemente que en combo con el kit completo le resulta mucho más conveniente.`)
        lineas.push(`  3. ¡PROHIBIDO repetir el mensaje de bienvenida del combo completo si el cliente preguntó por una pieza suelta!`)
        lineas.push(`  4. Si el cliente NO pide una pieza suelta (solo pregunta por el combo): NO menciones los precios de las piezas sueltas; seguí el embudo comercial normal.`)
        lineas.push(`  5. Solo podés ofrecer piezas sueltas que pertenezcan al kit del cual se está hablando en la conversación.`)

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
