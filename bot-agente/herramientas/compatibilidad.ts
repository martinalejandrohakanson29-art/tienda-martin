import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"

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
        description: "Verifica si una moto específica es compatible con un kit o combo de repuestos en la base de datos oficial. Devuelve si es compatible, incompatible o si no hay datos confirmados.",
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

/**
 * Normaliza texto para comparaciones sin tildes, minúsculas y caracteres limpios
 */
function normalizarTexto(txt: string): string {
    return txt
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function coincideKitInteligente(kitBuscado?: string, kitRegistro?: string): boolean {
    if (!kitBuscado || !kitRegistro) return true
    const kNorm = normalizarTexto(kitBuscado)
    const rNorm = normalizarTexto(kitRegistro)
    if (kNorm.includes(rNorm) || rNorm.includes(kNorm)) return true

    // Palabras clave mecánicas y cilindradas
    const palabrasK = kNorm.split(" ").filter((w) => w.length >= 3 && !["combo", "kit", "para", "con", "del", "mas"].includes(w))
    const palabrasR = rNorm.split(" ").filter((w) => w.length >= 3 && !["combo", "kit", "para", "con", "del", "mas"].includes(w))

    const compartidas = palabrasK.filter((w) => palabrasR.includes(w))
    if (compartidas.length >= 2) return true
    if (compartidas.length === 1 && (compartidas[0] === "170" || compartidas[0] === "200" || compartidas[0] === "cdi" || compartidas[0] === "escape")) return true

    return false
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

        // Obtenemos las compatibilidades registradas
        const registros = await prisma.$queryRaw<
            { id: number; modelo_moto: string; kit: string; kit_id: number | null; compatible: boolean; detalle: string | null }[]
        >`
            SELECT id, modelo_moto, kit, kit_id, compatible, detalle
            FROM compatibilidades
        `

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

        // Buscamos coincidencia con puntuación
        let mejorMatch: typeof registros[0] | null = null
        let maxScore = 0

        for (const reg of registros) {
            // Filtro por kit inteligente
            if (!coincideKitInteligente(args.kit_nombre_o_id, reg.kit)) {
                continue
            }

            const regMotoNorm = normalizarTexto(reg.modelo_moto)
            const tokensReg = regMotoNorm.split(" ").filter((p) => p.length >= 2)
            const distintivasReg = tokensReg.filter((w) => !palabrasIgnoradas.has(w) && isNaN(Number(w)))

            let score = 0

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

            if (score > maxScore && score >= 15) {
                maxScore = score
                mejorMatch = reg
            }
        }

        if (mejorMatch) {
            // Verificar si el kit pertenece a un grupo con variantes
            let grupoAsociado: { id: number; nombre: string; pregunta_variante: string | null; pregunta_variante_reintento: string | null } | undefined

            try {
                const grupos = await prisma.$queryRaw<
                    { id: number; nombre: string; pregunta_variante: string | null; pregunta_variante_reintento: string | null }[]
                >`
                    SELECT id, nombre, pregunta_variante, pregunta_variante_reintento
                    FROM chat_pack_grupos
                    WHERE activo = true
                `
                grupoAsociado = grupos.find((g) => {
                    return coincideKitInteligente(g.nombre, mejorMatch?.kit) ||
                           (args.kit_nombre_o_id && coincideKitInteligente(g.nombre, args.kit_nombre_o_id))
                })
            } catch (e) {
                // Silencioso en caso de fallo de grupos
            }

            if (mejorMatch.compatible && grupoAsociado?.pregunta_variante) {
                if (args.variante_elegida) {
                    return {
                        encontrado: true,
                        modelo_moto_detectado: mejorMatch.modelo_moto,
                        kit: mejorMatch.kit,
                        compatible: true,
                        detalle: mejorMatch.detalle,
                        mensaje_para_agente: `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}
VARIANTE YA DEFINIDA: El cliente ya eligió '${args.variante_elegida}'. ¡ESTÁ TOTALMENTE PROHIBIDO volver a preguntar por la variante o pedir que elija! Confirmale directamente que le va perfecto en ${args.variante_elegida} y ofrecé coordinar la venta.`
                    }
                }

                const pLimpia = grupoAsociado.pregunta_variante.replace(/\n+/g, " ").trim()
                return {
                    encontrado: true,
                    modelo_moto_detectado: mejorMatch.modelo_moto,
                    kit: mejorMatch.kit,
                    compatible: true,
                    detalle: mejorMatch.detalle,
                    mensaje_para_agente: `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}
REGLA DE GRUPO CON VARIANTES:
- Si el cliente todavía NO indicó cuál variante busca o tiene: confirmale que le va de diez a su moto y preguntale la variante con la pregunta oficial: "${pLimpia}".
- Si el cliente YA había indicado la variante en este mensaje o en turnos anteriores: ¡ESTÁ TOTALMENTE PROHIBIDO volver a preguntar la variante! Confirmale directamente el precio de esa variante y ofrecé coordinar la venta.`
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
