import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { normalizarTexto, puntuarItemCatalogo } from "../nucleo/texto"

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
    detalle?: string | null
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
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0
    }).format(monto)
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
                nombre: a.titulo_comercial || a.categoria || a.nombre_mostrador || "Pieza suelta",
                categoria: a.categoria,
                alias: a.alias,
                precio: Number(a.precio) || 0
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
                mensaje_para_agente: `No se encontró ningún kit activo con el término '${args.termino_busqueda || ""}'. Si el cliente pide una pieza que no está en el catálogo, indica que no la tenemos o escala al equipo.`
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

        // Caso de 1 sola opción: Entregar la ficha completa con variantes y detalles oficiales
        const lineas: string[] = ["CATÁLOGO OFICIAL:"]

        for (const p of packsFiltrados) {
            lineas.push(`• Kit Simple: "${p.nombre}" (ID: ${p.id})`)
            lineas.push(`   - Precio: ${formatearPrecio(p.precio)}${p.envio ? ` - Envío: ${p.envio}` : " - Envío gratis a todo el país"}`)
            if (p.mensaje_bienvenida) {
                lineas.push(`   - Mensaje oficial cargado en la app (respetar formato, listas y datos técnicos; si la charla ya está en curso, OMITIR el saludo inicial):\n${p.mensaje_bienvenida.trim()}`)
            }
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
            if (g.articulos_sueltos && g.articulos_sueltos.length > 0) {
                lineas.push(`   - Artículos y piezas sueltas que componen este combo (SOLO si el cliente pide expresamente una pieza sola por separado):`)
                for (const art of g.articulos_sueltos) {
                    lineas.push(`     * ${art.nombre}: ${formatearPrecio(art.precio)} (ID Art. ${art.id})`)
                    if (art.alias) lineas.push(`       Alias de búsqueda: ${art.alias}`)
                }
            }
            lineas.push("")
        }

        lineas.push(`⚠️ REGLA COMERCIAL PARA PIEZAS SUELTAS / ARTÍCULOS POR SEPARADO:`)
        lineas.push(`- Una consulta por pieza suelta requiere que el cliente EXPLÍCITAMENTE use palabras como "sola", "solo", "suelto", "separado", "nomás" (ej: "la tapa sola cuánto sale?", "vendés el carburador solo?").`)
        lineas.push(`- Si el bot le preguntó qué opción busca y el cliente responde "tapa cdi", "el de tapa cdi" o "con tapa", EL CLIENTE ESTÁ ELIGIENDO EL COMBO COMPLETO, NO PIDIENDO UNA PIEZA SUELTA. En ese caso entregá la bienvenida y precios del combo completo (Paso 2). ¡PROHIBIDO responder con la pieza suelta si no dijo "sola"!`)
        lineas.push(`- Si el cliente efectivamente pregunta expresamente por una pieza SOLA por separado:`)
        lineas.push(`  1. Respondé ÚNICAMENTE su nombre comercial y el precio (ej: "La Tapa CDI 125 sola cuesta $124.999 con las dos coronitas de regalo").`)
        lineas.push(`  2. CERO VOLCADO DE FICHA TÉCNICA: NO expliques válvulas, conductos, cielo, milímetros ni detalles técnicos a menos que el cliente haya preguntado específicamente sobre eso.`)
        lineas.push(`  3. Podés invitar amablemente a coordinar: "Si te interesa avisame y coordinamos!"`)
        lineas.push(`  4. ¡PROHIBIDO repetir el mensaje de bienvenida del combo completo cuando preguntan por una pieza suelta!`)
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
