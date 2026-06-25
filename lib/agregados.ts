// lib/agregados.ts
//
// Fuente de verdad ÚNICA para resolver los agregados (componentes de la receta)
// que corresponden a una venta/ítem de MercadoLibre.
//
// El problema que resuelve: la "variante" de una venta llega en TRES formatos
// distintos según la sección, y todos tienen que terminar apuntando a la misma
// fila de composicion_kits (/admin/mercadolibre/composicion):
//
//   - Registración / Preparación  -> EtiquetaML.items.variation  = ID numérico ML  ("193423432599")
//   - Auditoría / Guía Full       -> ShipmentItem.variation       = Nombre ML        ("MEDIDA: LEVA LARGA 74MM")
//   - Composición (verdad)        -> composicion_kits.nombre_variante = etiqueta corta ("LARGA")
//
// composicion_kits sigue siendo la única fuente de los ARTÍCULOS. productos_maestros
// se usa SOLO como diccionario para traducir el ID numérico de ML al nombre de la
// variante, y así poder elegir la fila correcta de la receta.
//
// Estrategia de match (en orden de prioridad):
//   0. nombre_variante === '0'                         -> kit sin variantes (aplica siempre)
//   1. composicion.variation_id === variación pedida   -> match numérico EXACTO (camino durable)
//   2. composicion.nombre_variante === nombre ML        -> match por nombre EXACTO
//   3. nombre ML CONTIENE la etiqueta corta (substring) -> puente legacy, solo si 0/1/2 no resolvieron

import { prisma } from "@/lib/prisma";

export interface ComponenteKit {
    mla: string;
    variation_id: string | null;
    nombre_variante: string | null;
    id_articulo: string;
    nombre_articulo: string | null;
    cantidad: number;
}

interface MaestroVariante {
    variation_id: string | null;
    nombre_variante: string | null;
}

export type ResolverAgregados = (mla: string | null | undefined, variation: string | null | undefined) => ComponenteKit[];

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const claveMla = (s: string | null | undefined) => (s || "").trim().toUpperCase();

// Los variation_id de ML son números largos (>= 6 dígitos). Etiquetas como "28" / "30"
// (medidas de carburador) NO deben tratarse como IDs de ML.
const esIdVarianteML = (s: string | null | undefined) => /^\d{6,}$/.test((s || "").trim());

// Una fila es "comodín" (aplica siempre, publicación sin variantes) cuando su
// nombre_variante es uno de los sentinels usados históricamente: '0', vacío, o 'Único'.
const esComodin = (c: ComponenteKit) => {
    const nv = norm(c.nombre_variante);
    return nv === "" || nv === "0" || nv === "único" || nv === "unico";
};

/**
 * Crea un resolver de agregados para un conjunto de MLAs. Hace UNA sola consulta a
 * composicion_kits y otra a productos_maestros, y devuelve una función pura que se
 * puede llamar por cada ítem sin volver a tocar la base.
 */
export async function crearResolverAgregados(mlas: (string | null | undefined)[]): Promise<ResolverAgregados> {
    const cleanMlas = Array.from(new Set(mlas.map(claveMla).filter(Boolean)));

    if (cleanMlas.length === 0) {
        return () => [];
    }

    const [componentes, maestros] = await Promise.all([
        prisma.composicionKits.findMany({ where: { mla: { in: cleanMlas } } }),
        prisma.productosMaestros.findMany({
            where: { mla: { in: cleanMlas } },
            select: { mla: true, variation_id: true, nombre_variante: true },
        }),
    ]);

    const compsByMla = new Map<string, ComponenteKit[]>();
    for (const c of componentes) {
        const key = claveMla(c.mla);
        const arr = compsByMla.get(key) || [];
        arr.push(c);
        compsByMla.set(key, arr);
    }

    const maestrosByMla = new Map<string, MaestroVariante[]>();
    for (const m of maestros) {
        const key = claveMla(m.mla);
        const arr = maestrosByMla.get(key) || [];
        arr.push({ variation_id: m.variation_id, nombre_variante: m.nombre_variante });
        maestrosByMla.set(key, arr);
    }

    return (mla, variation) => resolver(claveMla(mla), (variation ?? null), compsByMla, maestrosByMla);
}

function resolver(
    mla: string,
    variation: string | null,
    compsByMla: Map<string, ComponenteKit[]>,
    maestrosByMla: Map<string, MaestroVariante[]>
): ComponenteKit[] {
    const comps = compsByMla.get(mla) || [];
    if (comps.length === 0) return [];

    // 0. Kit sin variantes: las filas comodín ('0' / vacío / 'Único') aplican siempre.
    const base = comps.filter(esComodin);
    const variantes = comps.filter(c => !esComodin(c));

    if (variantes.length === 0) {
        // Publicación simple: solo base.
        return base;
    }

    // Orden sin variante: además de los comodines, incluimos filas sin variation_id
    // (compatibilidad con la lógica previa que matcheaba variation_id === null).
    if (!variation) {
        const sinVarId = variantes.filter(c => !(c.variation_id || "").trim());
        return [...base, ...sinVarId];
    }

    // Traducimos la variación pedida a un "nombre de variante ML" para poder cruzar
    // contra la etiqueta corta de composición.
    let nombreMlVariante: string | null = null;
    if (variation) {
        if (esIdVarianteML(variation)) {
            const maestros = maestrosByMla.get(mla) || [];
            nombreMlVariante = maestros.find(m => (m.variation_id || "") === variation)?.nombre_variante ?? null;
        } else {
            // Ya viene como nombre (caso auditoría / guía full).
            nombreMlVariante = variation;
        }
    }

    // 1 + 2. Match EXACTO: por variation_id numérico o por nombre de variante.
    let elegidos = variantes.filter(c => {
        if (variation && (c.variation_id || "") === variation) return true;
        if (nombreMlVariante && norm(c.nombre_variante) === norm(nombreMlVariante)) return true;
        return false;
    });

    // 3. Puente legacy (substring): la etiqueta corta de composición está contenida en
    //    el nombre de variante de ML. Solo si el match exacto no resolvió nada.
    if (elegidos.length === 0 && nombreMlVariante) {
        elegidos = variantes.filter(c => {
            const etiqueta = norm(c.nombre_variante);
            return etiqueta.length > 0 && norm(nombreMlVariante).includes(etiqueta);
        });
    }

    return [...base, ...elegidos];
}
