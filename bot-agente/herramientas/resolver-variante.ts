import { prisma } from "@/lib/prisma"
import { resolverMoto, TOPE_REPREGUNTAS_MOTO } from "../nucleo/motos"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import type { EstadoEmbudo } from "./index"
import { normalizarTexto, puntuarItemCatalogo, formatearPrecioAR } from "../nucleo/texto"
import { detectarRestoNoCubierto } from "../nucleo/resto-no-cubierto"
import { consultarCompatibilidad } from "./compatibilidad"
import { guiaIncompatibilidad } from "../nucleo/compat-negativa"

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
    /** Lo inyecta el motor (no el LLM). Ver `ContextoEjecucion.embudo`. */
    __embudo?: EstadoEmbudo
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
     * Moto y motivo del veredicto NEGATIVO. Viajan sueltos (no solo dentro del
     * texto de la guía) porque el motor los usa para recordar a quién ya se le
     * dio esta negativa y para leer qué condición pedía la fila — ver el punto
     * de control de `motor.ts` y `nucleo/negativa-condicional.ts`.
     */
    moto?: string
    detalle?: string
    /**
     * Pregunta lista para enviar tal cual al cliente (la `pregunta_variante` del
     * grupo). Red de seguridad: si el modelo filtra la guía interna en vez de
     * redactar, el motor manda ESTA en lugar de quedarse mudo.
     */
    pregunta_directa?: string
    /**
     * En este paso se le repreguntó la moto al cliente. El motor lo cuenta en el
     * estado para no pasar de `TOPE_REPREGUNTAS_MOTO` (conv 3947).
     */
    repregunta_moto?: boolean
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
    variantes: {
        id: number
        nombre: string
        etiqueta: string
        precio: number
        sinonimos: string[]
        /** Lo que este pack NO puede cambiar, ej. "recorrido corto". Ver `contradicen()`. */
        atributoFijo: string | null
        /** Sinónimos que DESMIENTEN el atributo fijo: si el cliente dice uno, este pack no le sirve. */
        contradice: string[]
    }[]
}

/**
 * Columnas del atributo fijo, en query aparte y tolerante: si todavía no se
 * corrió `n8n-workflows/chat-catalogo-atributo-fijo.sql` el motor sigue
 * funcionando como antes en vez de romper todo el resolver.
 */
async function cargarAtributosFijos(
    packIds: number[]
): Promise<Map<number, { atributoFijo: string | null; contradice: string[] }>> {
    if (packIds.length === 0) return new Map()
    try {
        const filas = await prisma.$queryRaw<
            { id: number; atributo_fijo: string | null; atributo_fijo_contradice: string[] | null }[]
        >`
            SELECT id, atributo_fijo, atributo_fijo_contradice
            FROM chat_packs
            WHERE id = ANY(${packIds})
        `
        return new Map(
            (filas || []).map((f) => [
                f.id,
                {
                    atributoFijo: (f.atributo_fijo || "").trim() || null,
                    contradice: (f.atributo_fijo_contradice || []).map((s) => normalizarTexto(s)).filter(Boolean)
                }
            ])
        )
    } catch {
        return new Map()
    }
}

/**
 * ¿Lo que dijo el cliente DESMIENTE el atributo fijo de este pack?
 *
 * Match literal por frase completa contra los sinónimos cargados a mano — la
 * misma mecánica determinista que `matchearVariantes`. No hay razonamiento: si
 * Martín cargó "recorrido largo" como contradicción del combo corto, un cliente
 * que escribe "es recorrido largo" descarta ese pack.
 */
function contradiceAtributoFijo(texto: string, contradice: string[]): boolean {
    const t = normalizarTexto(texto)
    if (!t || contradice.length === 0) return false
    return contradice.some(
        (c) => c.length >= 3 && new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(t)
    )
}

async function cargarGrupo(combo: string): Promise<GrupoVariantes | null> {
    const grupos = await prisma.$queryRaw<
        {
            id: number
            nombre: string
            pregunta_variante: string | null
            pregunta_variante_reintento: string | null
        }[]
    >`
        SELECT id, nombre, pregunta_variante, pregunta_variante_reintento
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

    const fijos = await cargarAtributosFijos((packs || []).map((p) => p.id))

    return {
        id: elegido.id,
        nombre: elegido.nombre,
        pregunta_variante: elegido.pregunta_variante,
        pregunta_variante_reintento: elegido.pregunta_variante_reintento,
        variantes: (packs || []).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            etiqueta: p.criterio_variante || p.nombre,
            precio: Number(p.precio) || 0,
            sinonimos: (p.sinonimos_variante || []).map((s) => normalizarTexto(s)).filter(Boolean),
            atributoFijo: fijos.get(p.id)?.atributoFijo ?? null,
            contradice: fijos.get(p.id)?.contradice ?? []
        }))
    }
}

/**
 * Kit SUELTO (pack sin grupo de variantes) que matchea el nombre pedido.
 * Mismo umbral de puntaje que `cargarGrupo` para no inventar matches.
 */
async function cargarPackSuelto(
    combo: string
): Promise<{ id: number; nombre: string; precio: number; atributoFijo: string | null; contradice: string[] } | null> {
    const conFijo = async (p: { id: number; nombre: string; precio: any }) => {
        const fijo = (await cargarAtributosFijos([p.id])).get(p.id)
        return {
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precio) || 0,
            atributoFijo: fijo?.atributoFijo ?? null,
            contradice: fijo?.contradice ?? []
        }
    }

    const comboTrim = (combo || "").trim()
    if (!comboTrim) return null

    const packs = await prisma.$queryRaw<{ id: number; nombre: string; precio: any }[]>`
        SELECT id, nombre, precio
        FROM chat_packs
        WHERE activo = true AND grupo_id IS NULL
    `
    if (!packs || packs.length === 0) return null

    if (/^\d+$/.test(comboTrim)) {
        const porId = packs.find((p) => p.id === Number(comboTrim))
        if (porId) return await conFijo(porId)
    }

    const scored = packs
        .map((p) => ({ p, score: puntuarItemCatalogo(comboTrim, p.nombre) }))
        .sort((a, b) => b.score - a.score)
    if (!scored[0] || scored[0].score < 30) return null
    return await conFijo(scored[0].p)
}

/**
 * ¿El texto del cliente contiene un modelo de moto que el sistema reconoce?
 *
 * Primero se pregunta al resolvedor con confianza (`resolverMoto`), que tolera
 * typos: "wawe nf" caía como desconocida con el LIKE crudo de abajo y el bot
 * escalaba en silencio una consulta de compatibilidad perfectamente
 * respondible (conv 3660, 08/09). El LIKE queda como red: cubre la columna
 * `modelo`, que el resolvedor no mira.
 */
async function motoReconocida(texto: string): Promise<boolean> {
    const t = normalizarTexto(texto)
    if (!t) return false
    const resol = await resolverMoto(texto).catch(() => null)
    if (resol && resol.confianza !== "ninguna") return true
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

/**
 * Aviso que se suma a la guia cuando el cliente pide que le recomienden una
 * variante. El bot no puede opinar: el sistema no tiene ningun dato de
 * rendimiento y el eje es fisico, no una preferencia. En la conv 3627 invento
 * que el corto da "mas estirada arriba" y el largo "mas torque abajo", como si
 * fuera algo a elegir.
 */
const AVISO_NO_ES_PREFERENCIA = [
    "OJO: el cliente esta pidiendo que le recomendes una variante.",
    "La variante NO se elige por gusto ni por rendimiento: la define fisicamente el motor que ya tiene la moto. La que le corresponde es la unica que le entra.",
    "Decile eso en un renglon (no va a eleccion, depende de lo que ya tiene la moto) y pasale la guia de como fijarse.",
    "PROHIBIDO comparar las variantes entre si, opinar cual anda mejor o hablar de torque, estirada, potencia o tipo de uso: no tenes ningun dato de eso."
].join("\n")

/**
 * Pedido de recomendacion sobre la variante ("que me recomendas", "cual me
 * conviene", "cual es mejor").
 *
 * El eje de variante (recorrido corto/largo, medida de leva) NO es una
 * preferencia del cliente: lo define fisicamente el motor de la moto. Por eso
 * un pedido de recomendacion se trata igual que un "no se": se contesta con la
 * guia de como fijarse, nunca con un consejo de rendimiento (conv 3627).
 */
const RX_PIDE_RECOMENDACION = /(que|cual|cuales)\s+(me\s+)?(recomend|conviene|sugeris|sugieres|sirve|llevo|compro|elijo|va mejor)|cual es (el |la )?mejor|me recomend/

/**
 * Cómo se llama el EJE de variante de este grupo ("leva", "recorrido",
 * "color"): la palabra que comparten todas las etiquetas del grupo.
 *
 * Existe porque los mensajes internos decían "falta la variante (el
 * recorrido)" aun en grupos cuyo eje es la LEVA. Ese texto es parte de lo que
 * llevó al bot a mezclar los dos conceptos en la conv 3791: el propio sistema
 * le sugería que variante = recorrido.
 */
function nombreEje(variantes: GrupoVariantes["variantes"]): string | null {
    if (variantes.length < 2) return null
    const [primera, ...resto] = variantes.map((v) => new Set(palabrasEtiqueta(v.etiqueta)))
    const comunes = [...primera].filter((w) => resto.every((s) => s.has(w)))
    return comunes.length === 1 ? comunes[0] : null
}

/** "la variante" / "la variante (la leva)" — sin inventarle género a la palabra. */
function textoEje(variantes: GrupoVariantes["variantes"]): string {
    const eje = nombreEje(variantes)
    return eje ? `la variante (${eje})` : "la variante"
}

export async function resolverVariante(args: ArgsResolverVariante): Promise<ResultadoResolverVariante> {
    try {
        // El "no sé" se detecta también del texto, no solo del flag del modelo.
        const textoCliente = normalizarTexto(args.mensaje_cliente || "")
        const pideRecomendacion = RX_PIDE_RECOMENDACION.test(textoCliente)
        const clienteNoSabe = !!args.cliente_no_sabe || RX_NO_SABE.test(textoCliente) || pideRecomendacion
        const grupo = await cargarGrupo(args.combo || "")
        if (!grupo) {
            // Puede no ser un grupo sino un KIT SUELTO (sin variantes): el Kit
            // 170 y el Dakar 200 son packs con `grupo_id NULL`. Antes caían en
            // "no identifiqué ese combo" — con el nombre exacto que emite el
            // propio catálogo — y la guía mandaba re-consultar el catálogo, lo
            // que metía 1.500 caracteres de ficha y reglas en el contexto para
            // responder una pregunta técnica (conv 3561, pregunta del cigüeñal).
            const suelto = await cargarPackSuelto(args.combo || "")
            if (suelto && contradiceAtributoFijo(args.mensaje_cliente || "", suelto.contradice)) {
                return {
                    encontrado: true,
                    resuelta: false,
                    escalar: true,
                    motivo: "producto_no_catalogado",
                    mensaje_para_agente: [
                        `EL CLIENTE PIDE ALGO QUE ESTE PRODUCTO NO ES. "${suelto.nombre}" es SIEMPRE ${suelto.atributoFijo}, y lo que dijo el cliente lo desmiente.`,
                        `NO se lo confirmes ni le cotices este pack: le estarías vendiendo otra cosa.`,
                        `Ejecutá escalar_a_humano(motivo: 'producto_no_catalogado') y guardá silencio total cara al cliente.`
                    ].join("\n")
                }
            }
            if (suelto) {
                return {
                    encontrado: true,
                    resuelta: true,
                    variante_pack_id: suelto.id,
                    etiqueta: suelto.nombre,
                    precio: suelto.precio,
                    mensaje_para_agente: `SIN VARIANTES: "${suelto.nombre}" es uno solo, ${formatearPrecio(suelto.precio)} con envío gratis. No hay ninguna variante que preguntar ni definir. NO vuelvas a consultar el catálogo por esto. Contestá directamente lo que el cliente preguntó.`
                }
            }
            return {
                encontrado: false,
                resuelta: false,
                mensaje_para_agente:
                    "No identifiqué ese combo. No re-consultes el catálogo por esto: si el cliente hizo una pregunta que podés responder con lo que ya sabés de la charla, respondela; si es una duda técnica sin dato, escalá."
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

        // 0. ¿Lo que dijo el cliente DESMIENTE algo que este combo NO puede
        //    cambiar? El grupo "Kit 120 corto + Leva 6.40" lleva SIEMPRE el
        //    cilindro corto: el recorrido no es su eje de variante, está fijo.
        //    En la conv 3791 el cliente dijo "es recorrido largo", el sistema
        //    solo miró la leva y le confirmó "va el recorrido largo, $99.000"
        //    cotizándole el pack corto.
        //
        //    Las variantes desmentidas quedan fuera: no se pueden matchear ni
        //    ofrecer. Si no queda ninguna, el producto que pide no existe
        //    armado -> se escala. No se improvisa un reemplazo (el Kit 120 de
        //    recorrido largo existe suelto, pero NO en combo con leva).
        const descartadas = grupo.variantes.filter((v) =>
            contradiceAtributoFijo(args.mensaje_cliente || "", v.contradice)
        )
        if (descartadas.length > 0 && descartadas.length === grupo.variantes.length) {
            return {
                encontrado: true,
                resuelta: false,
                grupo_id: grupo.id,
                escalar: true,
                motivo: "producto_no_catalogado",
                mensaje_para_agente: [
                    `EL CLIENTE PIDE ALGO QUE ESTE COMBO NO ES. "${grupo.nombre}" es SIEMPRE ${descartadas[0].atributoFijo}, y lo que dijo el cliente lo desmiente.`,
                    `NO le confirmes este combo ni le pases su precio: sería venderle otra cosa.`,
                    `NO le ofrezcas un reemplazo por tu cuenta: no hay ninguno confirmado por el sistema.`,
                    `Ejecutá escalar_a_humano(motivo: 'producto_no_catalogado') y guardá silencio total cara al cliente.`
                ].join("\n")
            }
        }
        const variantes = grupo.variantes.filter((v) => !descartadas.includes(v))

        // 1. LA MOTO MANDA: se chequea ANTES del match de variante.
        //
        //    El orden importaba y estaba al revés. Como el paso de la variante
        //    retornaba apenas encontraba un match, un cliente que decía la moto
        //    Y la variante en el mismo mensaje ("tengo una crypton, leva larga")
        //    se llevaba "VARIANTE RESUELTA — $99.000" sin que nadie mirara la
        //    moto, aunque la Crypton esté cargada como NO compatible. La misma
        //    moto sin nombrar la variante sí se chequeaba: el bot era incoherente
        //    consigo mismo según cómo viniera redactado el mensaje.
        //
        //    Medido sobre los 1.125 turnos reales del 06-09/09: de 35 variantes
        //    resueltas por el match, 25 traían moto y ninguna se validó. 23 de
        //    esas 25 ya estaban confirmadas (no cambia nada), 1 pasa a repreguntar
        //    el modelo y 1 pasa a escalar.
        const motoDelMensaje = (args.modelo_moto || "").trim()
        // Fallback: la moto que ya quedó confirmada en turnos anteriores. Sin
        // esto el chequeo no corre cuando el cliente dijo la moto hace 3 turnos
        // y el modelo no la vuelve a pasar (10 de esas 35 veces).
        const motoDelEmbudo = (args.__embudo?.motoConfirmada || "").trim()
        const motoTexto = motoDelMensaje || motoDelEmbudo
        let motoConfirmadaOk: string | undefined

        if (motoTexto) {
            const [compat, reconocida] = await Promise.all([
                // El embudo viaja: la cuenta de repreguntas de moto vive ahi, y sin
                // ella `consultar_compatibilidad` pediria repreguntar la marca
                // para siempre.
                consultarCompatibilidad({ modelo_moto: motoTexto, kit_nombre_o_id: grupo.nombre, __embudo: args.__embudo }),
                motoReconocida(motoTexto)
            ])

            // La moto no resuelve a un modelo firme (cilindrada que no consta,
            // familia con varios modelos). NO confirmamos ni escalamos: la IA
            // repregunta cuál modelo con los candidatos.
            //
            // Solo si la moto vino en ESTE mensaje: una moto del embudo ya pasó
            // por acá y quedó confirmada, repreguntar el modelo de nuevo sería
            // volver sobre algo ya cerrado.
            if (motoDelMensaje && compat.confianza === "parcial") {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    mensaje_para_agente: [
                        `NO CONFIRMES NADA de "${motoDelMensaje}" todavía: no resuelve a un modelo único.`,
                        compat.candidatos?.length ? `Modelos posibles (DATO INTERNO, no se los recites al cliente como "tengo cargada la X"): ${compat.candidatos.join(" / ")}.` : "",
                        `Si el cliente ya dijo cuál tiene, volvé a llamar resolver_variante con ese modelo exacto.`,
                        `Si no, preguntale con naturalidad SOLO por el dato que falta (ej: "es la 110 o la 125?"). Nunca le nombres un modelo distinto al que él dijo.`,
                        `Si insiste con uno que no está en esa lista, ejecutá escalar_a_humano(motivo: 'moto_no_registrada') y guardá silencio.`,
                    ].filter(Boolean).join("\n"),
                }
            }

            // El cliente dijo SOLO la marca ("para una Gilera"): falta el modelo
            // y preguntarlo lo consigue. Es el mismo criterio que "parcial" de
            // acá arriba — no confirmamos nada, pero tampoco escalamos mudos.
            //
            // Real (conv 3947, 11/09): el bot preguntó "para qué moto estás
            // buscando?", el cliente contestó "Para una Gilera" y el turno cayó
            // en el catch-all de abajo (`!confirmadaCompatible`) -> escalado en
            // silencio. Horas después un compañero tuvo que escribir "cual
            // gilera bro?", que es justo la repregunta que el bot podía hacer.
            //
            // El tope lo lleva el motor: después de `TOPE_REPREGUNTAS_MOTO`
            // intentos, `consultar_compatibilidad` ya no pide repreguntar y esto
            // no se activa — cae al catch-all y deriva, como corresponde.
            if (motoDelMensaje && compat.confianza === "marca_sin_modelo" && compat.repregunta_moto) {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    repregunta_moto: true,
                    mensaje_para_agente: compat.mensaje_para_agente,
                }
            }

            // Incompatible SOLO si sabemos de qué moto habla el cliente: para una
            // moto inventada/desconocida no afirmamos "no te va", se escala.
            //
            // "Saber" es o el catálogo `motos_modelos`, o un match LITERAL contra
            // la tabla de compatibilidad. Las dos tablas no están sincronizadas:
            // `motos_modelos` tiene 26 modelos y compat tiene filas curadas de
            // motos que no están ahí (Biz, Crypton, Wave NF). Exigir solo el
            // catálogo hacía que el bot escalara en silencio teniendo el veredicto
            // y el motivo cargados — la Biz 105 de la conv 503, y 6 de los 16
            // escalados por `moto_no_registrada` de la semana del 07/09.
            // Una moto realmente inventada no llega acá: da `encontrado: false`.
            //
            // Este veredicto SÍ vale también para la moto del embudo: si hay una
            // fila que dice que no le entra, no se la vendemos, se haya dicho la
            // moto en este mensaje o tres turnos atrás.
            const motoIdentificada = reconocida || compat.coincidencia_moto === "exacta"
            if (compat.encontrado && compat.compatible === false && motoIdentificada) {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    incompatible: true,
                    // Moto y motivo VIAJAN en el resultado (no solo dentro del
                    // texto de la guía): el motor los necesita para recordar a
                    // quién ya se le dio esta negativa y para leer qué condición
                    // pedía la fila. Ver `nucleo/negativa-condicional.ts`.
                    moto: motoTexto,
                    detalle: compat.detalle || undefined,
                    // La negativa la redacta la casa, no la IA: ver
                    // `nucleo/compat-negativa.ts` (conv 3874, "te soy sincero").
                    mensaje_para_agente: await guiaIncompatibilidad({
                        moto: motoTexto,
                        detalle: compat.detalle,
                    })
                }
            }

            // Solo se sigue adelante con confirmación POSITIVA. Sin fila que diga
            // que le va, no afirmamos que le va: se escala en silencio.
            //
            // Antes los grupos con `compatibilidad_universal` (Kit 120, Tapa CDI)
            // se saltaban este chequeo — la idea era que ahí la moto solo sirve
            // para inferir el recorrido. El efecto real era que CUALQUIER moto sin
            // fila caía en el "Le va bien a {moto}" de más abajo: 12 de las 30
            // motos del catálogo (todas de 125cc para arriba: XR 150, YBR 125,
            // Skua, Tornado, Lander...) recibían "le va bien" para un kit que se
            // anuncia "para 110", igual que una moto inventada.
            //
            // El "le va a cualquier 110" no se pierde: está implementado con dato,
            // por la fila genérica `110` de la tabla de compatibilidad, que matchea
            // "una 110", "tengo un 110" y hasta marcas que no tenemos cargadas
            // ("Okinoi 110"). Una XR 150 no matchea esa fila, y por eso escala.
            //
            // Con la moto del EMBUDO no se escala: esa moto ya venía confirmada de
            // un turno anterior y un "no confirmada" acá sería inventar escalados
            // sobre charlas que ya estaban encaminadas. El fallback del embudo
            // existe para atajar el veredicto NEGATIVO, no para volver a auditar
            // lo que ya se dio por bueno.
            const confirmadaCompatible = compat.encontrado && compat.compatible === true
            if (!confirmadaCompatible && motoDelMensaje) {
                return {
                    encontrado: true,
                    resuelta: false,
                    grupo_id: grupo.id,
                    escalar: true,
                    motivo: "moto_no_registrada",
                    mensaje_para_agente: `Compatibilidad de "${motoDelMensaje}" no confirmada para este combo. Ejecutá escalar_a_humano(motivo: 'moto_no_registrada') y guardá silencio total cara al cliente.`
                }
            }
            if (confirmadaCompatible) {
                motoConfirmadaOk = motoDelMensaje || compat.modelo_moto_detectado || motoDelEmbudo
            }
        }

        // 1.bis. ¿Quedó algo del mensaje que NINGUNA de estas dos lecturas miró?
        //
        //    El match de variante es literal contra `sinonimos_variante`: una
        //    palabra que no matchea no genera ninguna señal, simplemente se cae.
        //    En la conv 3820 el cliente dijo "No leva larga con freno", el
        //    sistema leyó "larga" y el modelo, para no dejar el tema colgado,
        //    metió el sobrante adentro de la confirmación: "Con freno: $99.000".
        //    Le puso precio a una configuración que no existe.
        //
        //    Se descuenta todo lo consumido acá (variantes, moto, nombre del
        //    combo) y `resto-no-cubierto` descuenta además el vocabulario del
        //    catálogo y la charla normal. Ver ese módulo para por qué el aviso
        //    prohíbe SIEMPRE y escala solo si el término es del producto.
        const restoDelMensaje = await detectarRestoNoCubierto(args.mensaje_cliente, [
            grupo.nombre,
            ...grupo.variantes.flatMap((v) => [v.etiqueta, v.nombre, ...v.sinonimos]),
            motoTexto,
            motoConfirmadaOk || "",
        ]).catch(() => null)
        const avisoResto = restoDelMensaje ? `\n\n${restoDelMensaje.aviso}` : ""

        // 2. ¿El cliente ya nombró la variante? (la moto ya pasó el chequeo)
        const hits = matchearVariantes(args.mensaje_cliente || "", variantes)
        if (hits.length === 1) {
            const v = hits[0]
            // Dato duro para que el modelo no redacte lo contrario de lo que el
            // pack es (ver el bloque 0). Va incluso cuando la variante ya estaba
            // resuelta: el riesgo no es repetir el precio, es afirmar el atributo.
            const avisoFijo = v.atributoFijo
                ? ` OJO: este combo es SIEMPRE ${v.atributoFijo} — NUNCA le digas ni le des a entender lo contrario.`
                : ""
            return {
                encontrado: true,
                resuelta: true,
                grupo_id: grupo.id,
                variante_pack_id: v.id,
                etiqueta: v.etiqueta,
                precio: v.precio,
                // La moto que acaba de pasar el chequeo del paso 1 también queda
                // registrada acá: antes, un turno que resolvía moto + variante
                // juntas no guardaba la moto en el estado.
                moto_confirmada: motoDelMensaje ? motoConfirmadaOk : undefined,
                mensaje_para_agente:
                    args.__embudo?.varianteResuelta?.packId === v.id
                        // Ya estaba resuelta de antes: el cliente ya escuchó esta
                        // opción con su precio. Re-confirmarla es el arranque de
                        // la respuesta larga que no venía a cuento (conv 2763).
                        ? `VARIANTE YA RESUELTA DE ANTES: "${v.etiqueta}" — ${formatearPrecio(v.precio)} con envío gratis. El cliente YA la eligió y YA le diste ese precio: NO se lo vuelvas a confirmar ni lo repitas. Contestá solamente lo que preguntó en su último mensaje, en 1 o 2 renglones.${avisoFijo}${avisoResto}`
                        : `VARIANTE RESUELTA: "${v.etiqueta}" — ${formatearPrecio(v.precio)} con envío gratis a todo el país. Confirmá esta opción al cliente, seca. NO la justifiques ni la compares con la otra variante (no tenés dato de rendimiento y no es una elección: la define el motor de la moto). No vuelvas a preguntar la moto ni la variante (ya están). Si el cliente preguntó otra cosa en el mismo mensaje, respondé eso también antes de cerrar.${avisoFijo}${avisoResto}`
            }
        }
        // El "no sé" GANA sobre el ambiguo. Un cliente que no sabe qué variante
        // tiene casi siempre nombra las dos al negarlas ("no sé si lo tengo corta
        // o larga"), y para `matchearVariantes` eso es indistinguible de alguien
        // que nombró ambas a propósito: se comía el `cliente_no_sabe` y devolvía
        // la repregunta con los precios en vez de la guía de cómo fijarse
        // (conv 3677). Si dijo que no sabe, se sigue de largo hasta la guía.
        if (hits.length > 1 && !clienteNoSabe) {
            const opciones = variantes.map((v) => v.etiqueta).join(" o ")
            // Sin precios: el cliente ya los escuchó al presentarle el combo, y
            // repetirlos acá es justo lo que se lee como "me volvió a tirar el
            // precio" en vez de ayudarlo a definir la variante.
            const guiaAmbiguo = (grupo.pregunta_variante_reintento || "").trim()
            return {
                encontrado: true,
                resuelta: false,
                grupo_id: grupo.id,
                pregunta_directa: guiaAmbiguo || undefined,
                mensaje_para_agente: [
                    `TODAVIA NO. El cliente nombró las dos opciones (${opciones}) pero no dijo cuál tiene.`,
                    `Preguntále cuál de las dos es, con tu voz. NO repitas los precios: ya se los diste.`,
                    guiaAmbiguo ? `Si no sabe cómo fijarse, pasale esta guía:\n${guiaAmbiguo}` : "",
                    pideRecomendacion ? `\n${AVISO_NO_ES_PREFERENCIA}` : ""
                ].filter(Boolean).join("\n")
            }
        }

        // 3. La moto quedó confirmada pero falta la variante: la moto sola casi
        //    nunca la define. Solo cuando la moto vino en ESTE mensaje — si salió
        //    del embudo, el "le va bien" ya se lo dijimos en su momento.
        if (motoConfirmadaOk && motoDelMensaje) {
            const guiaMoto = clienteNoSabe && grupo.pregunta_variante_reintento
                ? grupo.pregunta_variante_reintento.trim()
                : (grupo.pregunta_variante || "").trim()
            return {
                encontrado: true,
                resuelta: false,
                grupo_id: grupo.id,
                moto_confirmada: motoConfirmadaOk,
                pregunta_directa: guiaMoto,
                mensaje_para_agente: `Le va bien a ${motoDelMensaje}. Falta ${textoEje(grupo.variantes)}. Seguí la charla con el cliente sobre esto, con tu voz:\n${guiaMoto}${pideRecomendacion ? `\n\n${AVISO_NO_ES_PREFERENCIA}` : ""}${avisoResto}`
            }
        }

        // 4. Nada todavía -> próxima pregunta
        const guia = clienteNoSabe && grupo.pregunta_variante_reintento
            ? grupo.pregunta_variante_reintento.trim()
            : (grupo.pregunta_variante || `Qué variante buscás: ${variantes.map((v) => v.etiqueta).join(" o ")}?`).trim()

        return {
            encontrado: true,
            resuelta: false,
            grupo_id: grupo.id,
            pregunta_directa: guia,
            mensaje_para_agente: `Todavía falta saber ${textoEje(grupo.variantes)}. Seguí la charla con el cliente sobre esto, con tu voz:\n${guia}${pideRecomendacion ? `\n\n${AVISO_NO_ES_PREFERENCIA}` : ""}`
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
