import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { normalizarTexto, puntuarItemCatalogo, formatearPrecioAR } from "../nucleo/texto"
import { consultarCompatibilidad } from "./compatibilidad"

/**
 * HERRAMIENTA `resolver_variante` — resolución de variante AGNÓSTICA AL EJE
 * ---------------------------------------------------------------------------
 * Reemplaza los "Caminos 1-4" que vivían en el prompt. Su único trabajo es
 * responder: ¿ya sé qué variante lleva el cliente? Sí -> devuelvo RESUELTA +
 * precio. No -> devuelvo la próxima pregunta exacta.
 *
 * El eje (recorrido corto/largo, color azul/negro, pistón 70/90mm) NO se
 * razona: cada variante trae `sinonimos_variante text[]` (dato que carga Martín)
 * y el match es determinista. Agregar un eje nuevo = cargar sinónimos, cero
 * código.
 *
 * Fuentes de resolución, en orden:
 *   1. El cliente nombró la variante (match contra sinónimos + etiqueta).
 *   2. El cliente dio su moto y ese combo tiene incompatibilidad física real:
 *      se consulta compatibilidad (modelo incompatible -> se avisa; no
 *      registrado -> se escala).
 *   3. Nada todavía -> se devuelve `pregunta_variante` (o el reintento si el
 *      cliente ya dijo que no sabe).
 */

export interface ArgsResolverVariante {
    combo: string          // nombre o id del grupo/combo (ej: "Combo Tapa CDI + Cilindro 120" o "3")
    mensaje_cliente: string // lo último que dijo el cliente
    modelo_moto?: string    // si lo dijo
    cliente_no_sabe?: boolean // true si el cliente dijo que no sabe / cómo se fija
}

export interface ResultadoResolverVariante {
    encontrado: boolean
    resuelta: boolean
    grupo_id?: number
    variante_pack_id?: number
    etiqueta?: string
    precio?: number
    incompatible?: boolean
    escalar?: boolean
    motivo?: string
    /** Moto que quedó CONFIRMADA compatible en este paso (para la memoria de estado). */
    moto_confirmada?: string
    /**
     * Pregunta lista para enviar tal cual al cliente (la `pregunta_variante` del
     * grupo). Red de seguridad: si el modelo filtra la guía interna en vez de
     * redactar, el motor manda ESTA en lugar de quedarse mudo.
     */
    pregunta_directa?: string
    mensaje_para_agente: string
}

export const definicionResolverVariante: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "resolver_variante",
        description:
            "Dado un combo con variantes y lo último que dijo el cliente, determina qué variante corresponde (o cuál es la próxima pregunta para averiguarlo). Usar SIEMPRE que el cliente responda algo que pueda indicar su variante (una medida, un color, 'corto/largo', o su moto) en vez de redactar el precio de memoria.",
        parameters: {
            type: "object",
            properties: {
                combo: {
                    type: "string",
                    description: "Nombre o ID del combo/grupo que se está tratando (ej: 'Combo Tapa CDI + Cilindro 120' o '3')."
                },
                mensaje_cliente: {
                    type: "string",
                    description: "Textual, lo último que escribió el cliente sobre su variante o su moto."
                },
                modelo_moto: {
                    type: "string",
                    description: "Marca y modelo de la moto si el cliente lo dijo. NUNCA inventar."
                },
                cliente_no_sabe: {
                    type: "boolean",
                    description: "true si el cliente dijo que no sabe qué variante tiene o preguntó cómo fijarse."
                }
            },
            required: ["combo", "mensaje_cliente"]
        }
    }
}

interface GrupoVariantes {
    id: number
    nombre: string
    pregunta_variante: string | null
    pregunta_variante_reintento: string | null
    compatibilidad_universal: boolean
    variantes: { id: number; nombre: string; etiqueta: string; precio: number; sinonimos: string[] }[]
}

async function cargarGrupo(combo: string): Promise<GrupoVariantes | null> {
    const grupos = await prisma.$queryRaw<
        {
            id: number
            nombre: string
            pregunta_variante: string | null
            pregunta_variante_reintento: string | null
            compatibilidad_universal: boolean | null
        }[]
    >`
        SELECT id, nombre, pregunta_variante, pregunta_variante_reintento,
               COALESCE(compatibilidad_universal, false) AS compatibilidad_universal
        FROM chat_pack_grupos
        WHERE activo = true
    `
    if (!grupos || grupos.length === 0) return null

    const comboTrim = combo.trim()
    let elegido = /^\d+$/.test(comboTrim) ? grupos.find((g) => g.id === Number(comboTrim)) : undefined

    if (!elegido) {
        const scored = grupos
            .map((g) => ({ g, score: puntuarItemCatalogo(comboTrim, g.nombre) }))
            .sort((a, b) => b.score - a.score)
        if (scored[0] && scored[0].score >= 30) elegido = scored[0].g
    }
    if (!elegido) return null

    const packs = await prisma.$queryRaw<
        { id: number; nombre: string; criterio_variante: string | null; precio: any; sinonimos_variante: string[] | null }[]
    >`
        SELECT id, nombre, criterio_variante, precio, sinonimos_variante
        FROM chat_packs
        WHERE grupo_id = ${elegido.id} AND activo = true
        ORDER BY precio ASC
    `

    return {
        id: elegido.id,
        nombre: elegido.nombre,
        pregunta_variante: elegido.pregunta_variante,
        pregunta_variante_reintento: elegido.pregunta_variante_reintento,
        compatibilidad_universal: !!elegido.compatibilidad_universal,
        variantes: (packs || []).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            etiqueta: p.criterio_variante || p.nombre,
            precio: Number(p.precio) || 0,
            sinonimos: (p.sinonimos_variante || []).map((s) => normalizarTexto(s)).filter(Boolean)
        }))
    }
}

/** ¿El texto del cliente contiene un modelo de moto que el sistema reconoce? */
async function motoReconocida(texto: string): Promise<boolean> {
    const t = normalizarTexto(texto)
    if (!t) return false
    try {
        const filas = await prisma.$queryRaw<{ ok: boolean }[]>`
            SELECT EXISTS (
                SELECT 1 FROM motos_modelos m
                WHERE ${t} LIKE '%' || lower(m.modelo) || '%'
                   OR ${t} LIKE '%' || lower(m.nombre_completo) || '%'
                   OR EXISTS (SELECT 1 FROM unnest(m.aliases) a WHERE length(a) >= 3 AND ${t} LIKE '%' || lower(a) || '%')
            ) AS ok
        `
        return !!filas?.[0]?.ok
    } catch {
        return true // si no se puede chequear, no bloquear
    }
}

function formatearPrecio(n: number): string {
    return formatearPrecioAR(n)
}

function palabrasEtiqueta(etiqueta: string): string[] {
    return normalizarTexto(etiqueta).split(" ").filter((w) => w.length >= 3)
}

/**
 * Devuelve las variantes cuyo sinónimo/etiqueta aparece en el texto del cliente.
 *
 * Las palabras de la etiqueta que se repiten en MÁS DE UNA variante del mismo
 * grupo (ej. "Recorrido" en "Recorrido corto" y "Recorrido largo") no sirven
 * para discriminar: si se usan igual que las palabras únicas, un cliente que
 * dice "recorrido corto" termina matcheando corto Y largo a la vez (por el
 * "recorrido" suelto) y el sistema lo trata como ambiguo. Se excluyen del
 * fallback por etiqueta -- el match sigue funcionando por `sinonimos_variante`
 * o por la palabra que sí distingue (ej. "corto").
 */
function matchearVariantes(texto: string, variantes: GrupoVariantes["variantes"]) {
    const t = normalizarTexto(texto)
    if (!t) return []

    const conteoPalabras = new Map<string, number>()
    for (const v of variantes) {
        for (const w of new Set(palabrasEtiqueta(v.etiqueta))) {
            conteoPalabras.set(w, (conteoPalabras.get(w) || 0) + 1)
        }
    }

    return variantes.filter((v) => {
        const palabrasPropias = palabrasEtiqueta(v.etiqueta).filter((w) => conteoPalabras.get(w) === 1)
        const claves = [...v.sinonimos, ...palabrasPropias]
        return claves.some((c) => c.length >= 2 && new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(t))
    })
}

const RX_NO_SABE = /\b(no se|no lo se|ni idea|no tengo idea|no estoy segur|como me fijo|como se|como averiguo|no se cual|no sabria|nose)\b/

export async function resolverVariante(args: ArgsResolverVariante): Promise<ResultadoResolverVariante> {
    try {
        // El "no sé" se detecta también del texto, no solo del flag del modelo.
        const clienteNoSabe = !!args.cliente_no_sabe || RX_NO_SABE.test(normalizarTexto(args.mensaje_cliente || ""))
        const grupo = await cargarGrupo(args.combo || "")
        if (!grupo) {
            return {
                encontrado: false,
                resuelta: false,
                mensaje_para_agente:
                    "No identifiqué ese combo en el catálogo. Volvé a llamar a consultar_catalogo_y_precios para ubicarlo antes de resolver la variante."
            }
        }
        if (grupo.variantes.length === 0) {
            return {
                encontrado: true,
                resuelta: false,
                grupo_id: grupo.id,
                mensaje_para_agente: `El combo "${grupo.nombre}" no tiene variantes cargadas. Confirmá el precio con consultar_catalogo_y_precios.`
            }
        }

        // 1. ¿El cliente ya nombró la variante?
        const hits = matchearVariantes(args.mensaje_cliente || "", grupo.variantes)
        if (hits.length === 1) {
            const v = hits[0]
            return {
                encontrado: true,
                resuelta: true,
                grupo_id: grupo.id,
                variante_pack_id: v.id,
                etiqueta: v.etiqueta,
                precio: v.precio,
                mensaje_para_agente: `VARIANTE RESUELTA: "${v.etiqueta}" — ${formatearPrecio(v.precio)} con envío gratis a todo el país. Confirmá esta opción al cliente y ofrecé coordinar la compra. NO preguntes la moto, la variante ni nada más.`
            }
        }
        if (hits.length > 1) {
            const opciones = grupo.variantes.map((v) => `${v.etiqueta} (${formatearPrecio(v.precio)})`).join(" o ")
            return {
                encontrado: true,
                resuelta: false,
                grupo_id: grupo.id,
                mensaje_para_agente: `TODAVIA NO. Lo que dijo el cliente no distingue una variante sola. Volvé a preguntar claro: ${opciones}?`
            }
        }

        // 2. Vino la moto -> chequear compatibilidad de ese combo
        if (args.modelo_moto && args.modelo_moto.trim()) {
            const [compat, reconocida] = await Promise.all([
                consultarCompatibilidad({ modelo_moto: args.modelo_moto, kit_nombre_o_id: grupo.nombre }),
                motoReconocida(args.modelo_moto)
            ])

            // La moto no resuelve a un modelo firme (cilindrada que no consta,
            // familia con varios modelos). NO confirmamos ni escalamos: la IA
            // repregunta cuál modelo con los candidatos.
            if (compat.confianza === "parcial") {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    mensaje_para_agente: [
                        `NO CONFIRMES NADA de "${args.modelo_moto}" todavía: no resuelve a un modelo único.`,
                        compat.candidatos?.length ? `Modelos posibles: ${compat.candidatos.join(" / ")}.` : "",
                        `Si el cliente ya dijo cuál tiene, volvé a llamar resolver_variante con ese modelo exacto.`,
                        `Si no, preguntale con naturalidad cuál de esos modelos es.`,
                        `Si insiste con uno que no está en esa lista, ejecutá escalar_a_humano(motivo: 'moto_no_registrada') y guardá silencio.`,
                    ].filter(Boolean).join("\n"),
                }
            }

            // Incompatible SOLO si la moto es un modelo reconocido: para una moto
            // inventada/desconocida no afirmamos "no te va", se escala.
            if (compat.encontrado && compat.compatible === false && reconocida) {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    incompatible: true,
                    mensaje_para_agente: [
                        `NO ES COMPATIBLE con ${args.modelo_moto}.${compat.detalle ? ` Motivo: ${compat.detalle}.` : ""}`,
                        `- Decíselo al cliente claro y con respeto, en 1 o 2 renglones.`,
                        `- NO ofrezcas otros combos ni "alternativas": no tenés ninguna confirmada por el sistema.`,
                        `- NO le vuelvas a preguntar la moto (ya te la dijo).`,
                        `- Cerrá corto (ej: "Cualquier otra cosa que necesites, avisame.").`
                    ].join("\n")
                }
            }

            // Grupo con incompatibilidad física real (ej. Escape+Leva): solo se sigue
            // adelante con confirmación POSITIVA. Moto no confirmada o desconocida -> se escala.
            const confirmadaCompatible = compat.encontrado && compat.compatible === true
            if (!grupo.compatibilidad_universal && !confirmadaCompatible) {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    escalar: true,
                    motivo: "moto_no_registrada",
                    mensaje_para_agente: `Compatibilidad de "${args.modelo_moto}" no confirmada para este combo. Ejecutá escalar_a_humano(motivo: 'moto_no_registrada') y guardá silencio total cara al cliente.`
                }
            }

            // Grupo universal (Kit 120, Tapa CDI): la moto solo infiere el recorrido.
            // Si es un modelo desconocido y encima compat dice incompatible, no arriesgamos: se escala.
            if (grupo.compatibilidad_universal && !reconocida && compat.encontrado && compat.compatible === false) {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    escalar: true,
                    motivo: "moto_no_registrada",
                    mensaje_para_agente: `Moto "${args.modelo_moto}" no reconocida. Ejecutá escalar_a_humano(motivo: 'moto_no_registrada') y guardá silencio total.`
                }
            }

            // Compatible (o universal): la moto sola casi nunca define la variante
            // (recorrido). Se confirma que le va y se pasa a la pregunta/guía de variante.
            const guia = clienteNoSabe && grupo.pregunta_variante_reintento
                ? grupo.pregunta_variante_reintento.trim()
                : (grupo.pregunta_variante || "").trim()
            return {
                encontrado: true,
                resuelta: false,
                grupo_id: grupo.id,
                moto_confirmada: confirmadaCompatible
                    ? (args.modelo_moto || compat.modelo_moto_detectado)
                    : undefined,
                pregunta_directa: guia,
                mensaje_para_agente: `Le va bien a ${args.modelo_moto}. Falta la variante (el recorrido). Seguí la charla con el cliente sobre esto, con tu voz:\n${guia}`
            }
        }

        // 3. Nada todavía -> próxima pregunta
        const guia = clienteNoSabe && grupo.pregunta_variante_reintento
            ? grupo.pregunta_variante_reintento.trim()
            : (grupo.pregunta_variante || `Qué variante buscás: ${grupo.variantes.map((v) => v.etiqueta).join(" o ")}?`).trim()

        return {
            encontrado: true,
            resuelta: false,
            grupo_id: grupo.id,
            pregunta_directa: guia,
            mensaje_para_agente: `Todavía falta saber la variante. Seguí la charla con el cliente sobre esto, con tu voz:\n${guia}`
        }
    } catch (err: any) {
        console.error("Error en resolverVariante:", err)
        return {
            encontrado: false,
            resuelta: false,
            mensaje_para_agente: "Error temporal al resolver la variante. Volvé a intentar con consultar_catalogo_y_precios."
        }
    }
}

export const herramientaResolverVariante: EjecutorHerramienta<ArgsResolverVariante, ResultadoResolverVariante> = {
    definicion: definicionResolverVariante,
    ejecutar: resolverVariante
}
