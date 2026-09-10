import { prisma } from "@/lib/prisma"
import { DefinicionHerramienta, EjecutorHerramienta } from "../tipos"
import { formatearPrecioAR } from "../nucleo/texto"
import { describirEnvioSuelto, type ArticuloSueltoInfo } from "./catalogo-precios"

/**
 * COTIZAR VARIAS PIEZAS SUELTAS
 * ------------------------------
 * Nace de la conv 3860 (10/09). El cliente venía por el combo del anuncio y
 * dijo "pero yo quería el carbu y el filtro nomás". El bot hizo lo correcto
 * hasta la mitad: fue al catálogo, sacó las dos piezas del combo y contestó
 * "los dos juntos te quedan en $38.500". Tres problemas en esa sola línea:
 *
 *   1. La suma la hizo el modelo. Esta vez dio bien; es aritmética de LLM
 *      igual, sobre datos que en esta casa son deterministas por regla.
 *   2. No dijo una palabra del envío. Las piezas sueltas no tenían el dato
 *      cargado, y el "envío gratis" que sí lleva el kit no se hereda.
 *   3. El catálogo podía tener un pack armado que cubría justo eso, más
 *      completo y con envío gratis, y nadie lo miró.
 *
 * Esta herramienta resuelve los tres en código: total exacto, envío del
 * conjunto por la regla del eslabón más débil, y el pack que ya cubre lo
 * pedido si existe.
 */

export interface ArgsCotizarSueltas {
    articulo_ids?: number[]
}

export interface PackQueCubre {
    id: number
    nombre: string
    precio: number
    envio: string | null
    /** Piezas del pack que el cliente NO pidió: lo que se lleva "de más". */
    agrega: string[]
}

export interface ResultadoCotizarSueltas {
    encontrado: boolean
    piezas: { id: number; nombre: string; precio: number }[]
    total: number
    envio_conjunto: "gratis" | "lo_paga_el_cliente" | "sin_dato"
    packs_que_cubren: PackQueCubre[]
    mensaje_para_agente: string
}

export const definicionCotizarSueltas: DefinicionHerramienta = {
    type: "function",
    function: {
        name: "cotizar_piezas_sueltas",
        description:
            "Cotiza DOS O MÁS piezas sueltas juntas: calcula el total exacto, resuelve la política de envío del conjunto y avisa si existe un pack armado del catálogo que ya cubre lo que el cliente pidió. Usala SIEMPRE que el cliente pida más de una pieza por separado (ej. 'quiero el carbu y el filtro nomás'). PROHIBIDO sumar los precios vos mismo.",
        parameters: {
            type: "object",
            properties: {
                articulo_ids: {
                    type: "array",
                    items: { type: "number" },
                    description:
                        "IDs de los artículos sueltos que pide el cliente, tal como aparecen en '(ID Art. N)' en el resultado de consultar_catalogo_y_precios."
                }
            },
            required: ["articulo_ids"]
        }
    }
}

/**
 * Envío del conjunto por el eslabón más débil, y con `sin_dato` ganando por
 * encima de todo: si de tres piezas una no tiene la política cargada, no
 * sabemos qué sale mandar el paquete. "No sé" no se redondea a "sí" ni a "no".
 */
function envioDelConjunto(piezas: ArticuloSueltoInfo[]): ResultadoCotizarSueltas["envio_conjunto"] {
    if (piezas.some((p) => p.envio_gratis == null)) return "sin_dato"
    if (piezas.some((p) => p.envio_gratis === false)) return "lo_paga_el_cliente"
    return "gratis"
}

export async function cotizarPiezasSueltas(args: ArgsCotizarSueltas): Promise<ResultadoCotizarSueltas> {
    const vacio = (mensaje: string): ResultadoCotizarSueltas => ({
        encontrado: false,
        piezas: [],
        total: 0,
        envio_conjunto: "sin_dato",
        packs_que_cubren: [],
        mensaje_para_agente: mensaje
    })

    try {
        const ids = Array.from(
            new Set((args.articulo_ids || []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))
        )
        if (ids.length === 0) {
            return vacio(
                "No me pasaste ningún ID de artículo. Buscá primero las piezas con consultar_catalogo_y_precios y usá los '(ID Art. N)' que devuelve."
            )
        }

        // `ANY($1::int[])` y no un `IN` con template tag: Prisma no interpola
        // arrays en un `IN`.
        const piezasRaw = await prisma.$queryRawUnsafe<
            {
                id: number
                titulo_comercial: string | null
                categoria: string | null
                alias: string | null
                nombre_mostrador: string | null
                precio: any
                detalle: string | null
                envio_gratis: boolean | null
                envio: string | null
            }[]
        >(
            `SELECT ca.id, ca.titulo_comercial, ca.categoria, ca.alias, am.nombre AS nombre_mostrador,
                    ca.precio, ca.detalle, ca.envio_gratis, ca.envio
             FROM chat_articulos ca
             LEFT JOIN articulos_mostrador am ON am.id = ca.articulo_mostrador_id
             WHERE ca.activo = true AND ca.id = ANY($1::int[])`,
            ids
        )

        const piezas: ArticuloSueltoInfo[] = (piezasRaw || []).map((a) => ({
            id: a.id,
            nombre: a.titulo_comercial || a.categoria || a.nombre_mostrador || "Pieza suelta",
            categoria: a.categoria,
            alias: a.alias,
            precio: Number(a.precio) || 0,
            detalle: a.detalle,
            envio_gratis: a.envio_gratis,
            envio: a.envio
        }))

        if (piezas.length === 0) {
            return vacio(
                "No encontré esos artículos activos en el catálogo. NO le digas al cliente que no los tenemos: volvé a buscarlos con consultar_catalogo_y_precios, y si siguen sin aparecer escalá con escalar_a_humano."
            )
        }

        const faltantes = ids.filter((id) => !piezas.some((p) => p.id === id))
        const total = piezas.reduce((acc, p) => acc + p.precio, 0)
        const envio = envioDelConjunto(piezas)

        // Packs armados que YA cubren todo lo pedido. Le agregan piezas al
        // cliente, nunca le sacan: se listan de menor a mayor "agregado", así
        // el primero es el que más se parece a lo que pidió.
        const idsPiezas = piezas.map((p) => p.id)
        const packsRaw = await prisma.$queryRawUnsafe<
            { id: number; nombre: string; precio: any; envio: string | null; articulo_ids: number[]; nombres: string[] }[]
        >(
            `SELECT p.id, p.nombre, p.precio, p.envio,
                    array_agg(ca.id) AS articulo_ids,
                    array_agg(COALESCE(ca.titulo_comercial, ca.categoria, 'pieza')) AS nombres
             FROM chat_packs p
             JOIN chat_pack_articulos cpa ON cpa.pack_id = p.id
             JOIN chat_articulos ca ON ca.id = cpa.articulo_id AND ca.activo = true
             WHERE p.activo = true
             GROUP BY p.id, p.nombre, p.precio, p.envio
             HAVING array_agg(ca.id) @> $1::int[]`,
            idsPiezas
        )

        const packsQueCubren: PackQueCubre[] = (packsRaw || [])
            .map((p) => {
                const agrega = (p.articulo_ids || [])
                    .map((aid, i) => ({ aid, nombre: (p.nombres || [])[i] }))
                    .filter((x) => !idsPiezas.includes(x.aid))
                    .map((x) => x.nombre)
                return { id: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, envio: p.envio, agrega }
            })
            .sort((a, b) => a.agrega.length - b.agrega.length || a.precio - b.precio)

        const lineas: string[] = ["COTIZACIÓN DE PIEZAS SUELTAS (total calculado por el sistema, NO lo recalcules):"]
        for (const p of piezas) {
            lineas.push(`   * ${p.nombre}: ${formatearPrecioAR(p.precio)}`)
        }
        lineas.push(`   TOTAL EXACTO: ${formatearPrecioAR(total)} — este es el único número que podés decir como total.`)
        if (faltantes.length > 0) {
            lineas.push(
                `   ⚠️ No encontré los artículos con ID ${faltantes.join(", ")}: el total de arriba NO los incluye. No los menciones ni los des por incluidos.`
            )
        }

        lineas.push("")
        if (envio === "gratis") {
            lineas.push("ENVÍO DEL CONJUNTO: gratis. Podés decirle que va con envío gratis.")
        } else if (envio === "lo_paga_el_cliente") {
            const conCosto = piezas.filter((p) => p.envio_gratis === false)
            lineas.push(
                `ENVÍO DEL CONJUNTO: NO es gratis (${conCosto.map((p) => p.nombre).join(", ")} va con envío a cargo del cliente). Decíselo con naturalidad al pasar el total; PROHIBIDO decir "envío gratis".`
            )
            for (const p of conCosto) {
                if (p.envio?.trim()) lineas.push(`   - ${p.nombre}: ${p.envio.trim()}`)
            }
        } else {
            const sinDato = piezas.filter((p) => p.envio_gratis == null)
            lineas.push(
                `ENVÍO DEL CONJUNTO: SIN DATO (falta cargar la política de ${sinDato.map((p) => p.nombre).join(", ")}). Pasá el total y NO menciones el envío: ni gratis ni con costo. Si el cliente pregunta por el envío de estas piezas sueltas, escalá con escalar_a_humano (motivo de precio) y no improvises.`
            )
        }

        if (packsQueCubren.length > 0) {
            const mejor = packsQueCubren[0]
            lineas.push("")
            lineas.push(
                `PACK ARMADO QUE YA CUBRE LO QUE PIDIÓ: "${mejor.nombre}" a ${formatearPrecioAR(mejor.precio)}${
                    mejor.envio ? " con envío gratis" : ""
                }.`
            )
            if (mejor.agrega.length > 0) {
                lineas.push(`   - Además de lo que pidió, ese pack le suma: ${mejor.agrega.join(", ")}.`)
            }
            lineas.push(
                `   - Ofrecéselo como alternativa DESPUÉS de pasarle el total de las piezas sueltas, en un renglón y sin presionar (ej: "si te sirve, armado con [lo que agrega] te queda en ${formatearPrecioAR(
                    mejor.precio
                )}"). El cliente elige: no le cambies el pedido por el pack.`
            )
            if (packsQueCubren.length > 1) {
                lineas.push(
                    `   - Otros packs que también lo cubren (NO los enumeres todos al cliente): ${packsQueCubren
                        .slice(1)
                        .map((p) => `${p.nombre} ${formatearPrecioAR(p.precio)}`)
                        .join(" / ")}.`
                )
            }
        }

        lineas.push("")
        lineas.push(
            "REGLAS: sin ficha técnica de cada pieza, sin repetir el combo completo del anuncio, y sin inventar descuentos por llevar las dos. Respuesta corta."
        )

        return {
            encontrado: true,
            piezas: piezas.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio })),
            total,
            envio_conjunto: envio,
            packs_que_cubren: packsQueCubren,
            mensaje_para_agente: lineas.join("\n")
        }
    } catch (error: any) {
        console.error("Error en cotizarPiezasSueltas:", error)
        return vacio(
            "Error temporal al cotizar las piezas sueltas. No inventes el total: escalá con escalar_a_humano y guardá silencio."
        )
    }
}

export const herramientaCotizarSueltas: EjecutorHerramienta<ArgsCotizarSueltas, ResultadoCotizarSueltas> = {
    definicion: definicionCotizarSueltas,
    ejecutar: cotizarPiezasSueltas
}

/** Reexport para las pruebas: el envío de UNA pieza sola se describe igual acá. */
export { describirEnvioSuelto }
