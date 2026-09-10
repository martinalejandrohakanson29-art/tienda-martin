import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { normalizarTexto, distanciaOSA, puntuarItemCatalogo } from "../nucleo/texto"
import { resolverMoto, listarCandidatos, esTypoDe, cilindradasEn } from "../nucleo/motos"
import type { EstadoEmbudo } from "./index"

export interface ArgsCompatibilidad {
    modelo_moto: string
    kit_nombre_o_id?: string
    variante_elegida?: string
    /** Lo inyecta el motor (no el modelo): en qué punto del embudo va la charla. */
    __embudo?: EstadoEmbudo
}

/**
 * De qué kit se está hablando cuando el modelo no lo dice.
 *
 * `coincideKitPedido` sin kit acepta CUALQUIER fila del catálogo: es el
 * comportamiento correcto para un "¿tenés algo para mi Skua?" a secas, y es una
 * bomba cuando el kit sí estaba definido y solo se perdió en el camino. En la
 * conv 3894 el modelo mandó el kit con la clave mal escrita, la tool se quedó
 * sin kit y le confirmó el Kit 170 a una Gilera 110 con la fila de otro producto.
 *
 * El embudo sabe lo que el modelo se olvidó de pasar: si ya hay una variante
 * resuelta, un pack presentado o un grupo pineado, la consulta es sobre ESO. Se
 * toma del más específico al más general. Si el embudo está vacío, se sigue sin
 * kit como siempre: preferimos abrir el universo antes que inventar un kit.
 */
async function kitDelEmbudo(embudo: EstadoEmbudo | undefined): Promise<string | null> {
    if (!embudo) return null

    const packId = embudo.varianteResuelta?.packId ?? embudo.packPresentadoId ?? null
    if (packId != null) {
        const [pack] = await prisma.$queryRaw<{ nombre: string }[]>`
            SELECT nombre FROM chat_packs WHERE id = ${Number(packId)}
        `
        if (pack?.nombre) return pack.nombre
    }

    if (embudo.grupoPineadoId != null) {
        const [grupo] = await prisma.$queryRaw<{ nombre: string }[]>`
            SELECT nombre FROM chat_pack_grupos WHERE id = ${Number(embudo.grupoPineadoId)}
        `
        if (grupo?.nombre) return grupo.nombre
    }

    return null
}

/**
 * Las piezas que componen el kit por el que se preguntó.
 *
 * Por qué hace falta: las filas de `chat_articulo_compatibilidad` entran al
 * mismo pozo que las del combo, y se filtran por NOMBRE — el del artículo. Con
 * eso, "Cilindro 170 varillero" contesta por "Kit 170 varillero + leva" (bien:
 * es una de sus dos piezas) pero también cualquier artículo que comparta
 * palabras o un número con el kit preguntado, sea parte de él o no. Es la misma
 * puerta por la que en la conv 2882 una pieza periférica del combo terminó
 * hablando por el cilindro.
 *
 * Devuelve `resuelto: false` cuando el nombre no cae en ningún pack ni grupo del
 * catálogo (un kit viejo, un nombre inventado por el modelo). En ese caso NO se
 * filtra nada: sin saber qué compone el kit, descartar filas sería adivinar.
 */
async function composicionDelKitPedido(
    kitPedido: string | undefined
): Promise<{ resuelto: boolean; articuloIds: Set<number>; packIds: Set<number> }> {
    const vacio = { resuelto: false, articuloIds: new Set<number>(), packIds: new Set<number>() }
    const pedido = (kitPedido || "").trim()
    if (!pedido) return vacio

    const packs = await prisma.$queryRaw<{ id: number; nombre: string; grupo_id: number | null }[]>`
        SELECT id, nombre, grupo_id FROM chat_packs WHERE activo = true
    `.catch(() => [])
    const grupos = await prisma.$queryRaw<{ id: number; nombre: string }[]>`
        SELECT id, nombre FROM chat_pack_grupos WHERE activo = true
    `.catch(() => [])

    const packIds = new Set<number>()

    const conPrefijo = pedido.match(/^(pack|grupo)\s*:\s*(\d+)$/i)
    if (conPrefijo) {
        const id = Number(conPrefijo[2])
        if (normalizarTexto(conPrefijo[1]) === "pack") {
            if (packs.some((p) => Number(p.id) === id)) packIds.add(id)
        } else {
            for (const p of packs) if (Number(p.grupo_id) === id) packIds.add(Number(p.id))
        }
    } else {
        // Un grupo son sus dos variantes: preguntar por "Kit 120 para 110" es
        // preguntar por el corto Y el largo, así que entran las piezas de ambos.
        const gruposCoinciden = grupos.filter((g) => coincideKitInteligente(pedido, g.nombre))
        const idsGrupo = new Set(gruposCoinciden.map((g) => Number(g.id)))
        for (const p of packs) {
            if (coincideKitInteligente(pedido, p.nombre) || (p.grupo_id != null && idsGrupo.has(Number(p.grupo_id)))) {
                packIds.add(Number(p.id))
            }
        }
    }

    if (packIds.size === 0) return vacio

    const filas = await prisma.$queryRaw<{ articulo_id: number }[]>`
        SELECT DISTINCT articulo_id FROM chat_pack_articulos
        WHERE pack_id IN (${Prisma.join([...packIds])})
    `.catch(() => [])

    // Un pack sin composición cargada no dice nada sobre sus piezas: se trata
    // como no resuelto para no dejar al kit sin ninguna fila que lo respalde.
    if (filas.length === 0) return vacio

    return { resuelto: true, articuloIds: new Set(filas.map((f) => Number(f.articulo_id))), packIds }
}

export interface ResultadoCompatibilidad {
    encontrado: boolean
    modelo_moto_detectado?: string
    kit?: string
    compatible?: boolean
    /**
     * Nivel de confianza de la resolucion de la moto:
     *  - undefined / "firme": match confiable, `compatible` es una respuesta real.
     *  - "parcial": el cliente dio un dato (una cilindrada) que no cierra con
     *    ningun modelo conocido, o nombro una familia con varios modelos. NO se
     *    confirma nada; el motor NO escala solo por esto — la IA repregunta con
     *    los `candidatos`.
     */
    confianza?: "firme" | "parcial"
    /**
     * Qué tan literal fue el match de la moto contra la fila ganadora:
     *  - "exacta": el modelo distintivo que dijo el cliente ("biz", "nf")
     *    aparece TAL CUAL en la fila, o ambos resuelven al mismo modelo
     *    canónico. La fila habla de la moto del cliente, no de una parecida.
     *  - "aproximada": llegó por typo, abreviatura o tokens sueltos.
     * Lo consume `resolver-variante` para decidir si se anima a negar la
     * compatibilidad de una moto que no está en `motos_modelos`.
     */
    coincidencia_moto?: "exacta" | "aproximada"
    candidatos?: string[]
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
                    description: "NOMBRE del kit consultado, como figura en el catálogo (ej: 'Kit 120 para 110', 'Kit 170 varillero', 'Tapa CDI'). No pases un número suelto: los ids de packs, grupos y artículos se pisan entre sí."
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

/** Marcas: nombran una fábrica, no un modelo. Nunca definen familia por sí solas. */
const MARCAS_COMPAT = new Set([
    "honda", "yamaha", "motomel", "zanella", "gilera", "corven", "keller",
    "brava", "mondial", "guerrero", "bajaj", "suzuki",
])

/** De qué tabla salió una fila: cada una tiene su propio espacio de ids. */
type OrigenCompat = "pack" | "grupo" | "articulo" | "legacy"

/**
 * ¿La fila corresponde al kit que se preguntó?
 *
 * El `kit_id` de cada tabla vive en un espacio distinto (pack 8 = "Combo Tapa CDI
 * + Cilindro 120", artículo 8 = "Carburador CG 125"), así que un id numérico
 * pelado no identifica nada: `kit_nombre_o_id: "8"` matcheaba las dos filas y
 * llegó a devolver COMPATIBLE citando el carburador. Por eso el match por id
 * exige ahora que se diga de qué espacio es ("pack:8", "grupo:3", "articulo:8");
 * un número suelto cae al match por nombre, que con "8" no pega con nada.
 */
function coincideKitPedido(
    kitBuscado: string | undefined,
    reg: { kit: string; kit_id: number | null; grupo_id: number | null; origen: OrigenCompat; contexto_extra: string | null }
): boolean {
    const pedido = (kitBuscado || "").trim()
    if (!pedido) return true

    const conPrefijo = pedido.match(/^(pack|grupo|articulo|artículo|legacy)\s*:\s*(\d+)$/i)
    if (conPrefijo) {
        const espacio = normalizarTexto(conPrefijo[1]).replace("artículo", "articulo") as OrigenCompat
        const id = conPrefijo[2]
        const idFila = espacio === "grupo" ? reg.grupo_id : reg.kit_id
        return reg.origen === espacio && idFila !== null && String(idFila) === id
    }

    // Número pelado: NO se resuelve por id (no sabemos de qué tabla es).
    return coincideKitInteligente(pedido, reg.kit, reg.contexto_extra || undefined)
}

/**
 * ¿Dos tokens de modelo se refieren al mismo modelo?
 *
 * La contención de substrings ("uno está dentro del otro") es indispensable
 * para variantes como "zb" / "zb110", pero con tokens CORTOS produce falsos
 * positivos entre motos que no tienen nada que ver: "nt" está dentro de
 * "hu-NT-er", así que una fila de Zanella NT 110 confirmaba compatibilidad para
 * una Corven Hunter 150 (otra marca, otra cilindrada, otro motor). Detectado en
 * el barrido moto x kit del 07/09.
 *
 * Regla: igualdad siempre; contención solo cuando el token más corto tiene 4+
 * caracteres, que es donde deja de ser casualidad. Los typos reales ("smach",
 * "scua") ya los resuelve el catálogo canónico antes de llegar acá.
 */
export function tokensDeModeloCoinciden(a: string, b: string): boolean {
    if (!a || !b) return false
    if (a === b) return true
    const corto = a.length <= b.length ? a : b
    const largo = a.length <= b.length ? b : a
    return corto.length >= 4 && largo.includes(corto)
}

/**
 * ¿`frase` aparece dentro de `texto` como secuencia COMPLETA de palabras?
 *
 * `String.includes` a secas corta palabras por la mitad y confunde motos: el
 * alias "s 2" de la Motomel S2 150 (está cargado así por "ese dos") matcheaba
 * dentro de "wave **s 2**022", y una fila de Honda Wave S 2022 terminaba
 * negándole la compatibilidad a una Motomel S2. Ambos textos ya vienen
 * normalizados a tokens separados por espacio, así que alcanza con exigir
 * bordes de palabra.
 */
export function contieneComoTokens(texto: string, frase: string): boolean {
    if (!texto || !frase) return false
    return ` ${texto} `.includes(` ${frase} `)
}

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
    cilindrada: number | null
    aliases: string[]
}

/**
 * Cilindradas que nombra un modelo canonico, mirando la columna y tambien su
 * nombre y sus alias ("Corven Triax 200" trae el alias "triax 250").
 */
function cilindradasDelModelo(m: MotoCanonicaDB): Set<number> {
    const set = new Set<number>()
    if (m.cilindrada && m.cilindrada >= 50) set.add(m.cilindrada)
    for (const n of cilindradasEn(`${m.nombre_completo} ${m.aliases.join(" ")}`)) set.add(n)
    return set
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

    // 3. Tolerancia ortográfica (incluye swaps de letras pegadas) SOLO contra las
    //    palabras del nombre oficial — NO contra los aliases (que ya traen typos
    //    a propósito: hacer fuzzy sobre "bliz" hacía que "biz" (Honda Biz)
    //    resolviera a Motomel Blitz). El criterio es el mismo que usa
    //    `resolverMoto`: antes había una copia acá con umbral propio y las dos
    //    versiones se fueron separando.
    for (const token of tokensCliente) {
        for (const m of motosCanonicas) {
            const nWords = normalizarTexto(m.nombre_completo).split(" ")
            for (const nw of nWords) {
                if (esTypoDe(token, nw)) return m
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
        // El kit puede no venir en los argumentos (el modelo lo omitió o le erró
        // al nombre de la clave). Antes de mirar una sola fila, se completa con
        // lo que el embudo ya tiene firme: una consulta sin kit lee TODO el
        // catálogo y contesta con la fila de cualquier producto.
        if (!(args.kit_nombre_o_id || "").trim()) {
            const delEmbudo = await kitDelEmbudo(args.__embudo).catch(() => null)
            if (delEmbudo) args = { ...args, kit_nombre_o_id: delEmbudo }
        }

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
                origen: OrigenCompat
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
                COALESCE(p.mensaje_bienvenida, g.mensaje_bienvenida, '') as contexto_extra,
                CASE WHEN cc.kit_id IS NOT NULL THEN 'pack' ELSE 'grupo' END as origen
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
                origen: OrigenCompat
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
                ca.alias as contexto_extra,
                'articulo' as origen
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
                origen: OrigenCompat
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
                null as contexto_extra,
                'legacy' as origen
            FROM compatibilidades
        `

        const registros = [...comboRows, ...articuloRows, ...legacyRows]

        if (!registros || registros.length === 0) {
            return {
                encontrado: false,
                mensaje_para_agente: "No hay registros de compatibilidad cargados en el sistema."
            }
        }

        // ─── OPCIÓN 3: resolver la moto CON confianza antes de puntuar ──────────
        // Si el cliente fue más específico que el catálogo (dio una cilindrada
        // que no consta) o nombró una familia con varios modelos, NO confirmamos
        // nada: devolvemos los candidatos para que la IA repregunte con contexto.
        const resol = await resolverMoto(args.modelo_moto).catch(() => null)
        if (resol && resol.confianza === "ambigua") {
            const familiaTokens = normalizarTexto(args.modelo_moto)
                .split(" ")
                // La marca sola no define familia: "honda" traería la CG, la Biz
                // y media tabla a la lista de "modelos de esa familia".
                .filter((w) => w.length >= 3 && isNaN(Number(w)) && !MARCAS_COMPAT.has(w))
            // Estado de cada modelo de la familia PARA ESTE kit (si hay filas).
            const estadoFilas: string[] = []
            const veredictos = new Set<boolean>()
            let detalleUnanime = ""
            const vistos = new Set<string>()
            for (const reg of registros) {
                if (!coincideKitPedido(args.kit_nombre_o_id, reg)) continue
                const regNorm = normalizarTexto(reg.modelo_moto)
                if (!familiaTokens.some((t) => regNorm.includes(t))) continue
                if (vistos.has(regNorm)) continue
                vistos.add(regNorm)
                veredictos.add(reg.compatible)
                if (!detalleUnanime && reg.detalle) detalleUnanime = reg.detalle
                estadoFilas.push(`  • ${reg.modelo_moto}: ${reg.compatible ? "COMPATIBLE" : "NO compatible"}${reg.detalle ? ` (${reg.detalle})` : ""}`)
            }

            // La ambigüedad solo importa si cambia la respuesta. Cuando TODOS los
            // modelos cargados de esa familia dan el mismo veredicto para este
            // kit, saber cuál de ellos tiene el cliente no aporta nada: repreguntar
            // solo demora la respuesta que ya sabemos.
            //
            // Real (conv 3736, 09/09): "quiero saber que le puedo poner al wave NF
            // 100". La 100 no consta en `motos_modelos` (solo la Wave 110), así que
            // la moto quedaba "ambigua" y el bot preguntaba "tu Wave es la 110?"
            // — mientras las CUATRO filas de la familia Wave para ese combo decían
            // NO compatible por el mismo motivo (hay que alesar los cárteres).
            //
            // La regla NO es simétrica. Si la ambigüedad viene de una cilindrada
            // que no consta en el catálogo (el cliente nombró una moto que no
            // tenemos), el "todas dan que SÍ" no habla de la suya: es justo el bug
            // de la conv 3032, donde una "Corven Energy 125" se llevaba un
            // COMPATIBLE porque la única fila cargada es la Energy 110. El "todas
            // dan que NO" sí se puede extender —  el motivo es estructural (no
            // entra sin alesar) y además es la respuesta conservadora.
            const cilindradaQueNoConsta = resol.cilindradaCliente !== undefined
            const compatibleUnanime = veredictos.size === 1 ? [...veredictos][0] : null
            if (compatibleUnanime !== null && !(compatibleUnanime && cilindradaQueNoConsta)) {
                const compatible = compatibleUnanime
                return {
                    encontrado: true,
                    modelo_moto_detectado: args.modelo_moto,
                    kit: args.kit_nombre_o_id,
                    compatible,
                    detalle: detalleUnanime || undefined,
                    mensaje_para_agente: compatible
                        ? [
                              `CONFIRMADO: Es COMPATIBLE con la ${args.modelo_moto}. Todas las versiones de esa familia que tengo cargadas le van a este kit, así que no hace falta que le preguntes cuál tiene.`,
                              detalleUnanime ? `Detalle técnico: ${detalleUnanime}` : "",
                              `Confirmáselo corto al cliente, con tu voz. Si preguntó algo más en el mismo mensaje (envío, demora, pago...), respondé eso también antes de cerrar.`,
                          ]
                              .filter(Boolean)
                              .join("\n")
                        : [
                              `NO ES COMPATIBLE con la ${args.modelo_moto}.${detalleUnanime ? ` Motivo: ${detalleUnanime}` : ""}`,
                              `Ninguna versión de esa familia le entra a este kit, así que NO le preguntes cuál modelo tiene: la respuesta es la misma para todas.`,
                              `- Decíselo al cliente claro y con respeto, en 1 o 2 renglones.`,
                              `- NO ofrezcas otros combos ni "alternativas" ni te ofrezcas a "buscar opciones compatibles": no tenés ninguna confirmada por el sistema.`,
                              `- Cerrá corto (ej: "Cualquier otra cosa que necesites, avisame.").`,
                          ].join("\n"),
                }
            }

            const lineas = [
                `NO CONFIRMES COMPATIBILIDAD TODAVÍA. La moto que dijo el cliente ("${args.modelo_moto}") no resuelve a un modelo único y firme.`,
                resol.detalle ? `Motivo: ${resol.detalle}` : "",
                resol.candidatos.length ? `Modelos que sí tengo cargados de esa familia (DATO INTERNO, no se lo recites al cliente como "tengo cargada la X"): ${listarCandidatos(resol.candidatos)}.` : "",
                estadoFilas.length ? `Estado de compatibilidad conocido para este kit:\n${estadoFilas.join("\n")}` : "",
                `QUÉ HACER:`,
                `- Si en el historial el cliente ya aclaró exactamente cuál de esos modelos tiene, volvé a llamar consultar_compatibilidad con ese modelo exacto (ej: "Motomel Blitz 110").`,
                `- Si no lo aclaró, preguntale con naturalidad SOLO por el dato que falta (ej: "Tenés la 110 o la 125?"). Nunca le nombres un modelo distinto al que él dijo.`,
                `- Si el cliente insiste con un modelo/cilindrada que no está en la lista de arriba, ejecutá escalar_a_humano(motivo: 'moto_no_registrada') y guardá silencio.`,
                `- NUNCA afirmes que le va (ni que no le va) sin uno de esos modelos confirmado.`,
            ].filter(Boolean)

            return {
                encontrado: true,
                confianza: "parcial",
                candidatos: resol.candidatos.map((c) => c.nombre_completo),
                kit: args.kit_nombre_o_id,
                mensaje_para_agente: lineas.join("\n"),
            }
        }

        // Marcas y palabras genéricas que a veces se cruzan o el LLM inventa
        // Las marcas salen de `MARCAS_COMPAT`, la MISMA lista que usa el resto
        // del archivo. Estaban duplicadas a mano y se desincronizaron: acá
        // faltaban "bajaj" y "suzuki", así que "bajaj" contaba como palabra
        // distintiva de modelo y una fila de "Bajaj Boxer 150" (compatible con
        // el cilindro 120) le confirmaba compatibilidad a una Bajaj Rouser NS
        // 200. Es el mismo agujero que el de los alias de marca (conv 3730),
        // por la puerta de las dos marcas que faltaban.
        const palabrasIgnoradas = new Set([
            ...MARCAS_COMPAT,
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
            SELECT id, nombre_completo, cilindrada, aliases FROM motos_modelos;
        `.catch(() => [])

        // Marcas conocidas ("Motomel", "Honda", "Zanella"...). Una fila de
        // compatibilidad que SOLO nombra la marca no puede confirmar ni negar un
        // modelo concreto: el nombre canónico de todos los modelos de esa marca
        // la contiene ("Motomel Blitz 110".includes("motomel")), así que sin este
        // filtro una sola fila de marca decide por toda la marca.
        // Real: la fila 119 de `compatibilidades` ("motomel" -> compatible con el
        // combo Tapa CDI) hacía que "Blizt 2025" respondiera "CONFIRMADO: Es
        // COMPATIBLE con motomel", y encima dejaba moto_confirmada="motomel" en
        // el estado, que después se le decía al cliente ("para la Motomel").
        const marcasConocidas = new Set(
            (
                await prisma.$queryRaw<{ marca: string | null }[]>`
                    SELECT DISTINCT marca FROM motos_modelos WHERE marca IS NOT NULL
                `.catch(() => [])
            )
                .map((m) => normalizarTexto(m.marca || ""))
                .filter((m) => m.length >= 3)
        )
        const esSoloMarca = (texto: string) => marcasConocidas.has(normalizarTexto(texto))

        const motoCanonicaResuelta = resolverMotoCanonica(args.modelo_moto, motosCanonicas)
        // Cilindradas del modelo que resolvió el cliente. Si están, una fila que
        // nombra OTRA cilindrada no puede hablar por esta moto (ver abajo).
        const ccModeloCliente = motoCanonicaResuelta
            ? cilindradasDelModelo(motoCanonicaResuelta)
            : new Set<number>()

        // Qué piezas componen el kit preguntado. Con esto, una fila de artículo
        // que NO es parte del kit deja de poder contestar por él.
        const composicion = await composicionDelKitPedido(args.kit_nombre_o_id).catch(() => ({
            resuelto: false,
            articuloIds: new Set<number>(),
            packIds: new Set<number>(),
        }))

        // Buscamos coincidencia con puntuación.
        //
        // DOS CAPAS, no una. Una fila de `chat_combo_compatibilidad` o de la
        // tabla legacy habla DEL KIT; una de `chat_articulo_compatibilidad`
        // habla de UNA PIEZA. Hasta el 10/09 competían por el mismo score y
        // ganaba la de mayor puntaje textual, así que una pieza con la grafía
        // exacta que escribió el cliente le ganaba a la fila curada del combo —
        // y si se contradecían, el cliente se enteraba de la que puntuara más
        // alto. Ahora la pieza solo contesta cuando el kit no tiene nada cargado.
        let mejorMatch: typeof registros[0] | null = null
        let maxScore = 0
        /** ¿La fila ganadora nombra literalmente el modelo que dijo el cliente? */
        let mejorCoincidenciaExacta = false
        /** Idem para la mejor fila de PIEZA: solo se usa si el kit no tiene fila. */
        let mejorPieza: typeof registros[0] | null = null
        let maxScorePieza = 0
        let mejorPiezaCoincidenciaExacta = false
        /** Veredictos que dieron las piezas del kit, para detectar contradicciones. */
        const veredictosPieza = new Map<boolean, string>()
        /** Motivo de respaldo por veredicto, ver más abajo. */
        const respaldoDetalle = new Map<boolean, { score: number; detalle: string }>()

        for (const reg of registros) {
            // Filtro por kit inteligente (o match directo de kit_id)
            if (!coincideKitPedido(args.kit_nombre_o_id, reg)) {
                continue
            }

            // Pieza que no forma parte del kit preguntado: no habla por él por
            // más que su nombre se parezca.
            if (reg.origen === "articulo" && composicion.resuelto && !composicion.articuloIds.has(Number(reg.kit_id))) {
                continue
            }

            const regMotoNorm = normalizarTexto(reg.modelo_moto)

            // Fila de MARCA sola: solo sirve si el cliente tampoco dio un modelo
            // (dijo "tengo una Motomel" y nada más). Si el cliente nombró un
            // modelo, esta fila no puede hablar por él.
            if (esSoloMarca(regMotoNorm) && !esSoloMarca(args.modelo_moto)) {
                continue
            }

            // Fila que nombra OTRA cilindrada: no habla de esta moto.
            //
            // Es el espejo positivo de la regla de la conv 3131 (una regla
            // negativa con cilindrada solo aplica si el cliente la nombró). Esa
            // vive en la rama de moto "ambigua"; acá la moto resuelve perfecto y
            // el problema está del lado de la FILA.
            //
            // Real: un cliente con una Bajaj Rouser NS 200 recibía "sí, le va" al
            // Kit 120 para 110. La fila era `rouser 125` (del escape Paolucci), y
            // como la NS 200 tiene entre sus alias `rouser` pelado —sin
            // cilindrada— esa fila resolvía al mismo modelo canónico y se llevaba
            // el bonus más alto del scorer. Otra moto y otro producto.
            //
            // `cilindradasEn` corta en 2000, así que un año no cuenta como
            // cilindrada y "wave s 2022" sigue matcheando a la Wave 110.
            if (ccModeloCliente.size > 0) {
                const ccFila = cilindradasEn(reg.modelo_moto)
                if (ccFila.length > 0 && !ccFila.some((cc) => ccModeloCliente.has(cc))) {
                    continue
                }
            }

            const tokensReg = regMotoNorm.split(" ").filter((p) => p.length >= 2)
            const distintivasReg = tokensReg.filter((w) => !palabrasIgnoradas.has(w) && isNaN(Number(w)))

            // `scoreMoto` acumula SOLO lo que matcheó de la moto (canónica, texto,
            // palabra distintiva, tokens). El kit se puntúa aparte. Regla dura
            // (Opción 3): una fila que solo matchea por el kit NO cuenta — sin
            // esto, una fila de otra moto del mismo combo pasaba el piso y el bot
            // confirmaba/negaba citando una moto que el cliente nunca nombró.
            let scoreMoto = 0
            // El modelo distintivo del cliente aparece TAL CUAL en esta fila
            // (no por typo ni por abreviatura). Ver `coincidencia_moto`.
            let coincidenciaExacta = false

            // 0. Coincidencia a través de Modelo Canónico y sus Alias
            if (motoCanonicaResuelta) {
                const regCanonica = resolverMotoCanonica(reg.modelo_moto, motosCanonicas)
                if (regCanonica && regCanonica.id === motoCanonicaResuelta.id) {
                    scoreMoto += 80 // Ambas resuelven exactamente al mismo modelo canónico oficial
                    coincidenciaExacta = true
                } else {
                    const nombreCanNorm = normalizarTexto(motoCanonicaResuelta.nombre_completo)
                    // Contención por PALABRAS completas, no por substring suelto.
                    const coincideCanonica =
                        regMotoNorm === nombreCanNorm ||
                        contieneComoTokens(regMotoNorm, nombreCanNorm) ||
                        contieneComoTokens(nombreCanNorm, regMotoNorm) ||
                        motoCanonicaResuelta.aliases.some((a) => {
                            const an = normalizarTexto(a)
                            return (
                                an.length >= 3 &&
                                (regMotoNorm === an ||
                                    contieneComoTokens(regMotoNorm, an) ||
                                    contieneComoTokens(an, regMotoNorm))
                            )
                        })
                    if (coincideCanonica) {
                        scoreMoto += 60 // Gran impulso: resuelve cualquier typo ("smach", "scua", etc.) al modelo oficial
                    }
                }
            }

            // 1. Coincidencia exacta de texto (contención por palabras completas)
            if (motoBuscada === regMotoNorm) {
                scoreMoto += 50
                coincidenciaExacta = true
            } else if (
                contieneComoTokens(regMotoNorm, motoBuscada) ||
                contieneComoTokens(motoBuscada, regMotoNorm)
            ) {
                scoreMoto += 25
            }

            // 2. Coincidencia de nombre distintivo del modelo (ej: "smash", "zb", "blitz", "trip", "crono", "energy", "rx", "s2", "skua")
            for (const d of distintivasBuscadas) {
                if (distintivasReg.includes(d) || tokensReg.some((t) => tokensDeModeloCoinciden(t, d))) {
                    scoreMoto += 30 // Puntuación muy alta por modelo clave
                    // Literal: la fila dice "biz" y el cliente dijo "biz".
                    // `tokensDeModeloCoinciden` tolera typos y NO cuenta acá.
                    if (distintivasReg.includes(d)) coincidenciaExacta = true
                }
            }

            // 3. Palabras en común
            const coincidentes = tokensBuscados.filter((p) => tokensReg.includes(p))
            scoreMoto += coincidentes.length * 5

            let score = scoreMoto
            if (args.kit_nombre_o_id && reg.kit) {
                const kNorm = normalizarTexto(args.kit_nombre_o_id)
                const rNorm = normalizarTexto(reg.kit)
                if (kNorm === rNorm) score += 40
                else if (rNorm.includes(kNorm) || kNorm.includes(rNorm)) score += 20
            }

            // La MOTO tiene que haber matcheado de verdad (canónica, texto,
            // palabra distintiva o 5+ tokens). Solo el kit no alcanza.
            if (scoreMoto < 25 || score < 15) continue

            // Mejor fila CON motivo cargado de cada veredicto. No compite por
            // ganar: solo presta su `detalle` si el ganador vino pelado. El
            // aprendizaje deja filas con la grafía exacta del cliente ("wawe
            // Nf") y sin detalle, que por match literal le ganan a la fila
            // curada del mismo modelo, y el cliente recibía un "no es
            // compatible" sin motivo teniéndolo cargado al lado (conv 3660).
            if (reg.detalle?.trim()) {
                const previo = respaldoDetalle.get(reg.compatible)
                if (!previo || score > previo.score) respaldoDetalle.set(reg.compatible, { score, detalle: reg.detalle })
            }

            if (reg.origen === "articulo") {
                if (!veredictosPieza.has(reg.compatible)) veredictosPieza.set(reg.compatible, reg.kit)
                // Entre piezas, la que dice que NO gana siempre: el kit se
                // instala completo, así que la pieza que no entra decide por
                // todas. No es un desempate por puntaje sino por lógica de
                // armado, y el motivo bueno ("hay que alesar los cárteres")
                // está justo en esa fila.
                const piezaNegativaPrevia = mejorPieza != null && !mejorPieza.compatible
                const mandaPorNegativa = !reg.compatible && !piezaNegativaPrevia
                if (mandaPorNegativa || (score > maxScorePieza && reg.compatible === (mejorPieza?.compatible ?? reg.compatible))) {
                    maxScorePieza = score
                    mejorPieza = reg
                    mejorPiezaCoincidenciaExacta = coincidenciaExacta
                }
                continue
            }

            if (score > maxScore) {
                maxScore = score
                mejorMatch = reg
                mejorCoincidenciaExacta = coincidenciaExacta
            }
        }

        if (!mejorMatch && mejorPieza) {
            // El kit no tiene ninguna fila propia para esta moto: contesta la
            // pieza. Es lo que hoy sostiene al Kit 170, cuya compatibilidad
            // entera está cargada sobre el cilindro y la leva.
            //
            // Cuando las piezas se contradicen manda la negativa (ver arriba).
            // Antes ganaba la que puntuara más alto: a una Wave S le salía
            // COMPATIBLE el Kit 170 porque la fila de la leva puntuaba más que
            // la del cilindro, que es la que decía que hay que alesar el motor.
            mejorMatch = mejorPieza
            maxScore = maxScorePieza
            mejorCoincidenciaExacta = mejorPiezaCoincidenciaExacta
        }

        if (mejorMatch && !mejorMatch.detalle?.trim()) {
            const respaldo = respaldoDetalle.get(mejorMatch.compatible)
            if (respaldo) mejorMatch = { ...mejorMatch, detalle: respaldo.detalle }
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
                    coincidencia_moto: mejorCoincidenciaExacta ? "exacta" : "aproximada",
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
                        coincidencia_moto: mejorCoincidenciaExacta ? "exacta" : "aproximada",
                        kit: mejorMatch.kit,
                        compatible: true,
                        detalle: mejorMatch.detalle,
                        mensaje_para_agente: `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}
VARIANTE YA DEFINIDA: El cliente ya eligió '${args.variante_elegida}'. Confirmale directamente que le va perfecto en ${args.variante_elegida}. Si preguntó algo más en el mismo mensaje, respondé eso también antes de cerrar.`
                    }
                }

                const pLimpia = grupoAsociado.pregunta_variante.replace(/\n+/g, " ").trim()
                const reintentoLimpio = grupoAsociado.pregunta_variante_reintento ? grupoAsociado.pregunta_variante_reintento.trim() : null

                const lineasGuia = [
                    `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""}`,
                    // Sin nombrar el eje: decía "(el recorrido)" también en los
                    // grupos cuyo eje es la LEVA, y ese texto es parte de lo que
                    // llevó al bot a mezclar los dos conceptos (conv 3791). La
                    // `pregunta_variante` que sigue ya dice cuál es el eje real.
                    `Falta saber la variante para cotizar. Seguí la charla con el cliente sobre esto, con tu voz:`,
                    pLimpia
                ]

                if (reintentoLimpio) {
                    lineasGuia.push(`Si el cliente no sabe o pregunta cómo darse cuenta, explicale con tu voz:`)
                    lineasGuia.push(reintentoLimpio)
                }

                lineasGuia.push(`Si el cliente ya había indicado la variante antes, confirmá el precio directo sin volver a preguntar.`)

                return {
                    encontrado: true,
                    modelo_moto_detectado: mejorMatch.modelo_moto,
                    coincidencia_moto: mejorCoincidenciaExacta ? "exacta" : "aproximada",
                    kit: mejorMatch.kit,
                    compatible: true,
                    detalle: mejorMatch.detalle,
                    mensaje_para_agente: lineasGuia.join("\n")
                }
            }

            return {
                encontrado: true,
                modelo_moto_detectado: mejorMatch.modelo_moto,
                coincidencia_moto: mejorCoincidenciaExacta ? "exacta" : "aproximada",
                kit: mejorMatch.kit,
                compatible: mejorMatch.compatible,
                detalle: mejorMatch.detalle,
                mensaje_para_agente: mejorMatch.compatible
                    ? `CONFIRMADO: Es COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Detalle técnico: ${mejorMatch.detalle}` : ""} Confirmáselo corto al cliente, con tu voz. Si preguntó algo más en el mismo mensaje (envío, demora, pago...), respondé eso también antes de cerrar.`
                    : [
                          `NO ES COMPATIBLE con ${mejorMatch.modelo_moto}.${mejorMatch.detalle ? ` Motivo: ${mejorMatch.detalle}.` : ""}`,
                          `- Decíselo al cliente claro y con respeto, en 1 o 2 renglones.`,
                          `- NO ofrezcas otros combos ni "alternativas" ni te ofrezcas a "buscar opciones compatibles": no tenés ninguna confirmada por el sistema.`,
                          `- NO le vuelvas a preguntar la moto (ya te la dijo).`,
                          `- Cerrá corto (ej: "Cualquier otra cosa que necesites, avisame.").`
                      ].join("\n")
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
