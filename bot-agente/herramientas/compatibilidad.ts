import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"

export interface ArgsCompatibilidad {
    modelo_moto: string
    kit_nombre_o_id?: string
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
                    description: "Marca y modelo tal como lo dijo el cliente (ej: 'Smash 110', 'Zanella ZB 110', 'Wave', 'S2 150'). NUNCA inventes una marca que el cliente no mencionó (por ejemplo, si el cliente dijo 'smash 110', pasa 'smash 110', no le agregues 'Honda')."
                },
                kit_nombre_o_id: {
                    type: "string",
                    description: "Nombre o ID del kit consultado (ej: 'Kit 120 para 110', 'Kit 170 varillero', 'Tapa CDI')."
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
        const palabrasIgnoradas = new Set(["honda", "yamaha", "motomel", "zanella", "gilera", "corven", "keller", "brava", "mondial", "guerrero", "moto", "cc", "para", "una", "el", "la", "todas", "las"])

        const tokensBuscados = motoBuscada.split(" ").filter((w) => w.length >= 2)
        const distintivasBuscadas = tokensBuscados.filter((w) => !palabrasIgnoradas.has(w) && isNaN(Number(w)))

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
                const pLimpia = grupoAsociado.pregunta_variante.replace(/\n+/g, " ").trim()
                return {
                    encontrado: true,
                    modelo_moto_detectado: mejorMatch.modelo_moto,
                    kit: mejorMatch.kit,
                    compatible: true,
                    detalle: mejorMatch.detalle,
                    mensaje_para_agente: `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}
REGLA DE GRUPO CON VARIANTES: Este kit tiene opciones de variante (ej: recorrido corto y largo). Como el cliente aún no indicó cuál es su moto, confirmale que le va de diez y preguntale la variante obligatoria: "${pLimpia}".`
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
