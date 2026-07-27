import { prisma } from "@/lib/prisma"

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Profundidad máxima de anidamiento de packs. Guard defensivo contra ciclos
// que se hayan escapado de validarComponentesSinCicloTx; la profundidad real
// esperada en este negocio es 2.
const MAX_PACK_DEPTH = 5

/**
 * Recalcula stock y costo de un pack a partir de sus componentes DIRECTOS
 * (fórmula de un nivel, la misma que ya usan los listados para mostrar stock
 * de un pack). Asume que el stock/costo de esos componentes ya está al día
 * (si algún componente es a su vez un pack, debe haberse recalculado antes).
 */
export async function recalcularStockYCostoPackTx(tx: TxClient, packId: string) {
    const pack = await tx.articuloMostrador.findUnique({
        where: { id: packId },
        select: {
            packItems: {
                select: { cantidad: true, componente: { select: { stock: true, costo: true } } },
            },
        },
    })
    if (!pack) return
    const items = pack.packItems
    const stock = items.length > 0
        ? Math.min(...items.map(i => Math.floor(i.componente.stock / i.cantidad)))
        : 0
    const costo = items.reduce((acc, i) => acc + Number(i.componente.costo ?? 0) * i.cantidad, 0)
    await tx.articuloMostrador.update({ where: { id: packId }, data: { stock, costo } })
}

/**
 * Tras cambiar el stock/costo real de uno o más artículos, recalcula (bottom-up)
 * el stock/costo cacheado de todos los packs que los contienen, directa o
 * transitivamente, sin importar la profundidad de anidamiento.
 */
export async function propagarHaciaArribaTx(tx: TxClient, articuloIdsTocados: string[]) {
    const ancestros = new Set<string>()
    let frontera = new Set(articuloIdsTocados)
    for (let nivel = 0; nivel < MAX_PACK_DEPTH && frontera.size > 0; nivel++) {
        const padres = await tx.packMostradorItem.findMany({
            where: { componenteId: { in: Array.from(frontera) } },
            select: { packId: true },
        })
        const nuevos = new Set<string>()
        for (const p of padres) {
            if (!ancestros.has(p.packId)) {
                ancestros.add(p.packId)
                nuevos.add(p.packId)
            }
        }
        frontera = nuevos
    }
    // Varias pasadas sobre el mismo set de ancestros: converge al valor final
    // sin necesitar calcular el orden topológico exacto (dataset chico).
    for (let pasada = 0; pasada < MAX_PACK_DEPTH && ancestros.size > 0; pasada++) {
        for (const packId of ancestros) {
            await recalcularStockYCostoPackTx(tx, packId)
        }
    }
}

async function expandirYAjustarStockTx(
    tx: TxClient,
    articuloId: string,
    cantidad: number,
    modo: "increment" | "decrement",
    nombreHint: string | undefined,
    acumulado: Map<string, number>,
    visitados: string[],
    profundidad: number,
): Promise<void> {
    if (profundidad > MAX_PACK_DEPTH || visitados.includes(articuloId)) {
        throw new Error(`Anidamiento de packs demasiado profundo o cíclico en "${articuloId}". Revisá la composición de los packs.`)
    }

    const articulo = await tx.articuloMostrador.findUnique({
        where: { id: articuloId },
        include: { packItems: true },
    })
    if (!articulo) {
        const nombre = nombreHint ? `"${nombreHint}"` : `ID "${articuloId}"`
        throw new Error(`Artículo ${nombre} no encontrado en el sistema. Revisá el mapeo de artículos en la receta.`)
    }

    if (articulo.esPack && articulo.packItems.length > 0) {
        for (const packItem of articulo.packItems) {
            await expandirYAjustarStockTx(
                tx,
                packItem.componenteId,
                packItem.cantidad * cantidad,
                modo,
                undefined,
                acumulado,
                [...visitados, articuloId],
                profundidad + 1,
            )
        }
    } else {
        acumulado.set(articuloId, (acumulado.get(articuloId) ?? 0) + cantidad)
    }
}

/**
 * Ajusta stock por una venta/compra/cancelación. Expande recursivamente
 * cualquier item que sea pack (incluso anidado) hasta artículos base reales,
 * aplica el incremento/decremento SOLO sobre esos artículos hoja, y propaga
 * el recálculo de stock/costo hacia todos los packs ancestros afectados.
 */
export async function ajustarStockPorVentaOCompraTx(
    tx: TxClient,
    items: { articuloId: string; cantidad: number; nombreHint?: string }[],
    modo: "increment" | "decrement",
) {
    const acumulado = new Map<string, number>()
    for (const item of items) {
        await expandirYAjustarStockTx(tx, item.articuloId, item.cantidad, modo, item.nombreHint, acumulado, [], 0)
    }
    for (const [id, cant] of acumulado) {
        if (cant === 0) continue
        await tx.articuloMostrador.update({ where: { id }, data: { stock: { [modo]: cant } } })
    }
    await propagarHaciaArribaTx(tx, Array.from(acumulado.keys()))
}

async function packEstaEnSubarbol(
    tx: TxClient,
    raizId: string,
    objetivoId: string,
    visitados: string[] = [],
    profundidad = 0,
): Promise<boolean> {
    if (profundidad > MAX_PACK_DEPTH || visitados.includes(raizId)) return false
    if (raizId === objetivoId) return true
    const raiz = await tx.articuloMostrador.findUnique({
        where: { id: raizId },
        select: { packItems: { select: { componenteId: true } } },
    })
    if (!raiz) return false
    for (const packItem of raiz.packItems) {
        if (await packEstaEnSubarbol(tx, packItem.componenteId, objetivoId, [...visitados, raizId], profundidad + 1)) {
            return true
        }
    }
    return false
}

/**
 * Rechaza componentes que crearían un ciclo: el propio pack, o un componente
 * que ya contiene (directa o transitivamente) a este pack entre los suyos.
 */
export async function validarComponentesSinCicloTx(tx: TxClient, packId: string, componentesIds: string[]) {
    for (const componenteId of componentesIds) {
        if (componenteId === packId) {
            throw new Error("Un pack no puede tener a sí mismo como componente.")
        }
        if (await packEstaEnSubarbol(tx, componenteId, packId)) {
            throw new Error(`No se puede agregar "${componenteId}" como componente: ya contiene (directa o indirectamente) a este pack, y crearía un ciclo.`)
        }
    }
}
