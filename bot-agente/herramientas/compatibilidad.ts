import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { normalizarTexto, distanciaLevenshtein, puntuarItemCatalogo } from "../nucleo/texto"

export interface ArgsCompatibilidad {
    modelo_moto: string
    kit_nombre_o_id?: string
    variante_elegida?: string
}

export interface ResultadoCompatibilidad {
    encontrado: boolean
    modelo_moto_detectado?: string
    kit?: string
    compatible?: boolean
    detalle?: string | null
    mensaje_para_agente: string
}

export const definicionCompatibilidad: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "consultar_compatibilidad",
        description: "Verifica si una moto es compatible con un kit para una consulta SUELTA de compatibilidad (ej: 'le va el kit X a mi moto?'). IMPORTANTE: si el cliente ya está eligiendo/definiendo un combo que tiene variantes (recorrido, leva, color), NO uses esta herramienta — usá resolver_variante, que maneja la moto y la variante juntas.",
        parameters: {
            type: "object",
            properties: {
                modelo_moto: {
                    type: "string",
                    description: "Marca y modelo tal como lo dijo el cliente (ej: 'Smash 110', 'Zanella ZB 110', 'Wave', 'S2 150'). NUNCA inventes una marca que el cliente no mencionó. NUNCA pases variantes como 'recorrido corto' o 'recorrido largo' como si fueran modelos de moto."
                },
                kit_nombre_o_id: {
                    type: "string",
                    description: "Nombre o ID del kit consultado (ej: 'Kit 120 para 110', 'Kit 170 varillero', 'Tapa CDI')."
                },
                variante_elegida: {
                    type: "string",
                    description: "Si el cliente ya eligió o indicó su variante en este mensaje o en turnos anteriores (ej: 'recorrido corto' o 'recorrido largo'), pasala acá para que el sistema sepa que ya está definida y no la vuelva a preguntar."
                }
            },
            required: ["modelo_moto"]
        }
    }
}

const palabrasDistintivasKit = ["tapa", "cdi", "escape", "pwr", "dakar", "varillero"]

function coincideKitInteligente(kitBuscado?: string, kitRegistro?: string, contextoExtra?: string): boolean {
    if (!kitBuscado || !kitRegistro) return true
    const kNorm = normalizarTexto(kitBuscado)
    const rNorm = normalizarTexto(kitRegistro)
    const cNorm = normalizarTexto(contextoExtra || "")
    const corpusR = `${rNorm} ${cNorm}`

    const kTokens = kNorm.split(" ")

    // Si el término buscado pide algo distintivo (ej: "tapa", "cdi", "escape", "pwr")
    // y el registro NO lo tiene, NO deben coincidir bajo ningún punto de vista.
    for (const dist of palabrasDistintivasKit) {
        if (kTokens.includes(dist) && !corpusR.includes(dist)) {
            return false
        }
    }

    // Si el cliente pide específicamente "comun" o "estandar", no debe coincidir con combos que tienen tapa o escape
    if ((kTokens.includes("comun") || kTokens.includes("estandar")) && (corpusR.includes("tapa") || corpusR.includes("cdi"))) {
        return false
    }

    if (kNorm.includes(rNorm) || rNorm.includes(kNorm)) return true
    if (cNorm && (cNorm.includes(kNorm) || kNorm.includes(cNorm))) return true

    // Números y cilindradas clave (ej: "200cc" -> "200", "150", "170", "110", "120", "125")
    const setNumerosR = new Set(corpusR.match(/\d+/g) || [])
    const numerosK = kNorm.match(/\d+/g) || []
    const numerosCompartidos = numerosK.filter((n) => setNumerosR.has(n) && Number(n) >= 50)
    if (numerosCompartidos.length > 0) return true

    // Palabras clave mecánicas
    const palabrasK = kTokens.filter((w) => w.length >= 3 && !["combo", "kit", "para", "con", "del", "mas"].includes(w))
    const palabrasR = corpusR.split(" ").filter((w) => w.length >= 3 && !["combo", "kit", "para", "con", "del", "mas"].includes(w))

    const compartidas = palabrasK.filter((w) => palabrasR.includes(w))
    if (compartidas.length >= 2) return true
    if (compartidas.length === 1 && (compartidas[0] === "170" || compartidas[0] === "200" || compartidas[0] === "cdi" || compartidas[0] === "escape" || compartidas[0] === "dakar")) return true

    return false
}

interface MotoCanonicaDB {
    id: number
    nombre_completo: string
    aliases: string[]
}

/**
 * Resuelve un texto de cliente (que puede contener errores ortográficos o modismos)
 * al modelo canónico oficial de la moto, utilizando coincidencias directas y distancia Levenshtein.
 */
function resolverMotoCanonica(
    textoCliente: string,
    motosCanonicas: MotoCanonicaDB[]
): MotoCanonicaDB | null {
    const textoNorm = normalizarTexto(textoCliente)
    if (!textoNorm || motosCanonicas.length === 0) return null
    const tokensCliente = textoNorm.split(" ").filter((w) => w.length >= 2)

    // 1. Coincidencia exacta de texto completo con nombre_completo o algún alias
    for (const m of motosCanonicas) {
        if (normalizarTexto(m.nombre_completo) === textoNorm) return m
        if (m.aliases.some((a) => normalizarTexto(a) === textoNorm)) return m
    }

    // 2. Coincidencia si el texto del cliente contiene un alias exacto de 3+ letras (o viceversa)
    for (const m of motosCanonicas) {
        for (const alias of m.aliases) {
            const aNorm = normalizarTexto(alias)
            if (aNorm.length >= 3 && (textoNorm.includes(aNorm) || aNorm.includes(textoNorm))) {
                return m
            }
        }
    }

    // 3. Tolerancia ortográfica / Levenshtein sobre palabras clave distintivas
    for (const token of tokensCliente) {
        if (token.length < 3 || !isNaN(Number(token))) continue
        for (const m of motosCanonicas) {
            for (const alias of m.aliases) {
                const aNorm = normalizarTexto(alias)
                const aWords = aNorm.split(" ").filter((w) => w.length >= 3 && isNaN(Number(w)))
                for (const aw of aWords) {
                    const dist = distanciaLevenshtein(token, aw)
                    // Tolerancia: 1 letra de diferencia para palabras de 4+ caracteres
                    if (dist === 1 && (token.length >= 4 || aw.length >= 4)) {
                        return m
                    }
                    // Tolerancia: 2 letras de diferencia para palabras largas (6+ caracteres)
                    if (dist === 2 && (token.length >= 6 && aw.length >= 6)) {
                        return m
                    }
                }
            }
        }
    }

    return null
}

export async function consultarCompatibilidad(args: ArgsCompatibilidad): Promise<ResultadoCompatibilidad> {
    const motoBuscada = normalizarTexto(args.modelo_moto)
    if (!motoBuscada) {
        return {
            encontrado: false,
            mensaje_para_agente: "No se especificó un modelo de moto válido."
        }
    }

    try {
        // Obtenemos dinámicamente las variantes de catálogo existentes para no confundir variantes con motos
        const packsConVariante = await prisma.$queryRaw<{ criterio_variante: string }[]>`
            SELECT DISTINCT criterio_variante 
            FROM chat_packs 
            WHERE criterio_variante IS NOT NULL AND activo = true
        `
        const variantesCatalogo = new Set<string>()
        const palabrasVariante = new Set<string>()

        for (const p of packsConVariante) {
            if (!p.criterio_variante) continue
            const vNorm = normalizarTexto(p.criterio_variante)
            variantesCatalogo.add(vNorm)
            for (const palabra of vNorm.split(" ").filter((w) => w.length >= 3)) {
                variantesCatalogo.add(palabra)
                palabrasVariante.add(palabra)
            }
        }

        // Si lo que se pasó como moto es una variante del catálogo
        if (variantesCatalogo.has(motoBuscada)) {
            return {
                encontrado: false,
                mensaje_para_agente: `ERROR: "${args.modelo_moto}" NO es una marca o modelo de moto; es una VARIANTE del catálogo.
- NO consultes compatibilidad con una variante.
- Si el cliente ya eligió su variante, el producto exacto y el precio final ya están 100% definidos. Confirmale esa opción y ofrecé coordinar la compra.`
            }
        }

        // 1. Compatibilidades oficiales de combos y kits (chat_combo_compatibilidad)
        const comboRows = await prisma.$queryRaw<
            {
                id: number
                modelo_moto: string
                kit: string
                kit_id: number | null
                grupo_id: number | null
                compatible: boolean
                detalle: string | null
                contexto_extra: string | null
            }[]
        >`
            SELECT 
                cc.id,
                cc.modelo_moto,
                COALESCE(p.nombre, g.nombre, '') as kit,
                cc.kit_id,
                cc.grupo_id,
                cc.compatible,
                cc.detalle,
                COALESCE(p.mensaje_bienvenida, g.mensaje_bienvenida, '') as contexto_extra
            FROM chat_combo_compatibilidad cc
            LEFT JOIN chat_packs p ON p.id = cc.kit_id
            LEFT JOIN chat_pack_grupos g ON g.id = cc.grupo_id
        `

        // 2. Compatibilidades por artículo / pieza suelta (chat_articulo_compatibilidad)
        const articuloRows = await prisma.$queryRaw<
            {
                id: number
                modelo_moto: string
                kit: string
                kit_id: number | null
                grupo_id: number | null
                compatible: boolean
                detalle: string | null
                contexto_extra: string | null
            }[]
        >`
            SELECT 
                ac.id,
                ac.modelo_moto,
                COALESCE(ca.titulo_comercial, ca.categoria, am.nombre, '') as kit,
                ac.articulo_id as kit_id,
                null as grupo_id,
                ac.compatible,
                ac.detalle,
                ca.alias as contexto_extra
            FROM chat_articulo_compatibilidad ac
            JOIN chat_articulos ca ON ca.id = ac.articulo_id
            LEFT JOIN articulos_mostrador am ON am.id = ca.articulo_mostrador_id
            WHERE ca.activo = true
        `

        // 3. Compatibilidades legacy (compatibilidades)
        const legacyRows = await prisma.$queryRaw<
            {
                id: number
                modelo_moto: string
                kit: string
                kit_id: number | null
                grupo_id: number | null
                compatible: boolean
                detalle: string | null
                contexto_extra: string | null
            }[]
        >`
            SELECT 
                id,
                modelo_moto,
                kit,
                kit_id,
                null as grupo_id,
                compatible,
                detalle,
                null as contexto_extra
            FROM compatibilidades
        `

        const registros = [...comboRows, ...articuloRows, ...legacyRows]

        if (!registros || registros.length === 0) {
            return {
                encontrado: false,
                mensaje_para_agente: "No hay registros de compatibilidad cargados en el sistema."
            }
        }

        // Marcas y palabras genéricas que a veces se cruzan o el LLM inventa
        const palabrasIgnoradas = new Set([
            "honda", "yamaha", "motomel", "zanella", "gilera", "corven", "keller", "brava", "mondial", "guerrero",
            "moto", "cc", "para", "una", "el", "la", "todas", "las",
            ...palabrasVariante
        ])

        const tokensBuscados = motoBuscada.split(" ").filter((w) => w.length >= 2)
        const distintivasBuscadas = tokensBuscados.filter((w) => !palabrasIgnoradas.has(w) && isNaN(Number(w)))

        // Si no hay palabras distintivas ni modelo real (solo palabras ignoradas como "recorrido corto"), no buscar
        if (distintivasBuscadas.length === 0 && !tokensBuscados.some((t) => !isNaN(Number(t)))) {
            return {
                encontrado: false,
                mensaje_para_agente: `"${args.modelo_moto}" no contiene un modelo de moto identificable. Preguntale al cliente qué marca y modelo de moto tiene.`
            }
        }

        // Cargar catálogo de motos canónicas para normalización y tolerancia a typos
        const motosCanonicas = await prisma.$queryRaw<MotoCanonicaDB[]>`
            SELECT id, nombre_completo, aliases FROM motos_modelos;
        `.catch(() => [])

        const motoCanonicaResuelta = resolverMotoCanonica(args.modelo_moto, motosCanonicas)

        // Buscamos coincidencia con puntuación
        let mejorMatch: typeof registros[0] | null = null
        let maxScore = 0

        for (const reg of registros) {
            // Filtro por kit inteligente (o match directo de kit_id)
            const coincideId = args.kit_nombre_o_id && reg.kit_id && String(reg.kit_id) === String(args.kit_nombre_o_id).trim()
            if (!coincideId && !coincideKitInteligente(args.kit_nombre_o_id, reg.kit, reg.contexto_extra || undefined)) {
                continue
            }

            const regMotoNorm = normalizarTexto(reg.modelo_moto)
            const tokensReg = regMotoNorm.split(" ").filter((p) => p.length >= 2)
            const distintivasReg = tokensReg.filter((w) => !palabrasIgnoradas.has(w) && isNaN(Number(w)))

            let score = 0

            // 0. Coincidencia a través de Modelo Canónico y sus Alias
            if (motoCanonicaResuelta) {
                const regCanonica = resolverMotoCanonica(reg.modelo_moto, motosCanonicas)
                if (regCanonica && regCanonica.id === motoCanonicaResuelta.id) {
                    score += 80 // Ambas resuelven exactamente al mismo modelo canónico oficial
                } else {
                    const nombreCanNorm = normalizarTexto(motoCanonicaResuelta.nombre_completo)
                    const coincideCanonica =
                        regMotoNorm === nombreCanNorm ||
                        regMotoNorm.includes(nombreCanNorm) ||
                        nombreCanNorm.includes(regMotoNorm) ||
                        motoCanonicaResuelta.aliases.some((a) => {
                            const an = normalizarTexto(a)
                            return an.length >= 3 && (regMotoNorm === an || regMotoNorm.includes(an) || an.includes(regMotoNorm))
                        })
                    if (coincideCanonica) {
                        score += 60 // Gran impulso: resuelve cualquier typo ("smach", "scua", etc.) al modelo oficial
                    }
                }
            }

            // 1. Coincidencia exacta de texto
            if (motoBuscada === regMotoNorm) {
                score += 50
            } else if (regMotoNorm.includes(motoBuscada) || motoBuscada.includes(regMotoNorm)) {
                score += 25
            }

            // 2. Coincidencia de nombre distintivo del modelo (ej: "smash", "zb", "blitz", "trip", "crono", "energy", "rx", "s2", "skua")
            for (const d of distintivasBuscadas) {
                if (distintivasReg.includes(d) || tokensReg.some((t) => t === d || t.includes(d) || d.includes(t))) {
                    score += 30 // Puntuación muy alta por modelo clave
                }
            }

            // 3. Palabras en común
            const coincidentes = tokensBuscados.filter((p) => tokensReg.includes(p))
            score += coincidentes.length * 5

            if (args.kit_nombre_o_id && reg.kit) {
                const kNorm = normalizarTexto(args.kit_nombre_o_id)
                const rNorm = normalizarTexto(reg.kit)
                if (kNorm === rNorm) score += 40
                else if (rNorm.includes(kNorm) || kNorm.includes(rNorm)) score += 20
            }

            if (score > maxScore && score >= 15) {
                maxScore = score
                mejorMatch = reg
            }
        }

        if (mejorMatch) {
            // Cargar grupos activos para verificar si el kit consultado abarca múltiples combos
            let gruposActivos: { id: number; nombre: string; pregunta_variante: string | null; pregunta_variante_reintento: string | null }[] = []

            try {
                gruposActivos = await prisma.$queryRaw<
                    { id: number; nombre: string; pregunta_variante: string | null; pregunta_variante_reintento: string | null }[]
                >`
                    SELECT id, nombre, pregunta_variante, pregunta_variante_reintento
                    FROM chat_pack_grupos
                    WHERE activo = true
                    ORDER BY id ASC
                `
            } catch (e) {
                // Silencioso en caso de fallo de grupos
            }

            // Resolver que grupos activos coinciden con el termino buscado.
            // Scorer unico y compartido: ver bot-agente/nucleo/texto.ts
            let gruposCoincidentes: typeof gruposActivos = []

            if (args.kit_nombre_o_id) {
                const scored = gruposActivos.map((g) => ({
                    g,
                    score: puntuarItemCatalogo(args.kit_nombre_o_id!, g.nombre)
                }))

                const maxScore = Math.max(...scored.map((s) => s.score), 0)
                if (maxScore >= 30) {
                    gruposCoincidentes = scored.filter((s) => s.score > 0 && s.score >= maxScore * 0.75).map((s) => s.g)
                }
            }

            // CASO A: Múltiples combos coinciden con el término buscado (ej: Kit 120 para 110 Y Combo Tapa CDI + Cilindro 120)
            if (mejorMatch.compatible && gruposCoincidentes.length > 1) {
                const listaOpciones = gruposCoincidentes.map((g, i) => `👉🏼 Opción ${i + 1}: ${g.nombre}`).join("\n")
                return {
                    encontrado: true,
                    modelo_moto_detectado: mejorMatch.modelo_moto,
                    kit: args.kit_nombre_o_id,
                    compatible: true,
                    detalle: mejorMatch.detalle,
                    mensaje_para_agente: `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}
⚠️ ATENCIÓN VENDEDOR (MÚLTIPLES COMBOS ENCONTRADOS PARA ESTA CONSULTA):
Para '${args.kit_nombre_o_id}' existen ${gruposCoincidentes.length} combos o kits diferentes en el catálogo:
${listaOpciones}

REGLA DE MOSTRADOR (PASO 1 DEL EMBUDO - IDENTIFICAR EL COMBO):
- Confirmale al cliente con buena onda que le va de diez a su ${mejorMatch.modelo_moto}.
- Presentale las ${gruposCoincidentes.length} opciones disponibles y preguntale: "Cuál de las opciones estás buscando?" (o "Cuál de los dos estás buscando?").
- ⛔ PROHIBIDO preguntar por recorrido corto/largo, levas o variantes todavía: primero el cliente debe elegir cuál de los combos busca armar.`
                }
            }

            // CASO B: Un solo grupo coincide o es un combo específico
            const grupoAsociado = gruposCoincidentes.length === 1
                ? gruposCoincidentes[0]
                : gruposActivos.find((g) => {
                    return coincideKitInteligente(mejorMatch?.kit, g.nombre) ||
                           (args.kit_nombre_o_id && coincideKitInteligente(args.kit_nombre_o_id, g.nombre))
                })

            if (mejorMatch.compatible && grupoAsociado?.pregunta_variante) {
                if (args.variante_elegida) {
                    return {
                        encontrado: true,
                        modelo_moto_detectado: mejorMatch.modelo_moto,
                        kit: mejorMatch.kit,
                        compatible: true,
                        detalle: mejorMatch.detalle,
                        mensaje_para_agente: `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}
VARIANTE YA DEFINIDA: El cliente ya eligió '${args.variante_elegida}'. Confirmale directamente que le va perfecto en ${args.variante_elegida} y ofrecé coordinar la venta.`
                    }
                }

                const pLimpia = grupoAsociado.pregunta_variante.replace(/\n+/g, " ").trim()
                const reintentoLimpio = grupoAsociado.pregunta_variante_reintento ? grupoAsociado.pregunta_variante_reintento.trim() : null

                const lineasGuia = [
                    `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}`,
                    `ESTADO: Moto compatible confirmada. Falta definir la variante para cotizar con precisión.`,
                    `- Pregunta inicial para consultar la variante: "${pLimpia}"`
                ]

                if (reintentoLimpio) {
                    lineasGuia.push(`- GUÍA TÉCNICA DE TALLER (SI EL CLIENTE DUDA, PREGUNTA CÓMO SABER O DICE "NO SÉ"):`)
                    lineasGuia.push(`  Explicá amablemente cómo revisarlo usando este tip técnico oficial:`)
                    lineasGuia.push(`  "${reintentoLimpio}"`)
                }

                lineasGuia.push(`- Si el cliente ya había indicado la variante en turnos previos: confirmá el precio directo y ofrecé coordinar la compra sin volver a preguntar.`)

                return {
                    encontrado: true,
                    modelo_moto_detectado: mejorMatch.modelo_moto,
                    kit: mejorMatch.kit,
                    compatible: true,
                    detalle: mejorMatch.detalle,
                    mensaje_para_agente: lineasGuia.join("\n")
                }
            }

            return {
                encontrado: true,
                modelo_moto_detectado: mejorMatch.modelo_moto,
                kit: mejorMatch.kit,
                compatible: mejorMatch.compatible,
                detalle: mejorMatch.detalle,
                mensaje_para_agente: mejorMatch.compatible
                    ? `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}. Cerrá natural ("Cualquier cosa avisanos y coordinamos").`
                    : `CONFIRMADO: NO ES COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Motivo: ${mejorMatch.detalle}` : ""}`
            }
        }

        return {
            encontrado: false,
            mensaje_para_agente: `NO SE ENCONTRÓ COMPATIBILIDAD CONFIRMADA para la moto '${args.modelo_moto}'. REGLA ESTRICTA: NUNCA muestres duda ni le digas al cliente que no sabes. Ejecuta INMEDIATAMENTE la herramienta 'escalar_a_humano' con motivo 'moto_no_registrada' y resumen de qué moto y kit consultó. El equipo responderá en silencio.`
        }
    } catch (error: any) {
        console.error("Error en consultarCompatibilidad:", error)
        return {
            encontrado: false,
            mensaje_para_agente: "Error temporal al consultar la base de datos de compatibilidades."
        }
    }
}

export const herramientaCompatibilidad: EjecutorHerramienta<ArgsCompatibilidad, ResultadoCompatibilidad> = {
    definicion: definicionCompatibilidad,
    ejecutar: consultarCompatibilidad
}
