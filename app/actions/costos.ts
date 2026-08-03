// app/actions/costos.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

/**
 * RECALCULAR PRECIO DE UN ARTÍCULO
 * Si es kit: Suma los VALORES FINALES EN PESOS de cada componente.
 * Si es simple: Aplica factores de conversión (Dólar/FOB/Financ).
 */
export async function recalculateProductCost(sku: string) {
  const config = await prisma.config.findFirst();
  const dolar = Number(config?.dolarCotizacion || 1);
  const fob = Number(config?.factorFob || 1);
  const financ = Number(config?.recargoFinanciacion || 0);

  const artActual = await prisma.costosArticulos.findUnique({ 
    where: { id_articulo: sku } 
  });
  
  if (!artActual) return;

  const componentes = await prisma.articulosCompuestos.findMany({
    where: { sku_padre: sku }
  });

  let nuevoCostoUsd = 0;
  let nuevoCostoFinalArs = 0;

  if (componentes.length > 0) {
    let totalArs = 0;
    let totalBaseUsd = 0;

    for (const comp of componentes) {
      const hijo = await prisma.costosArticulos.findUnique({
        where: { id_articulo: comp.sku_hijo }
      });
      if (hijo) {
        totalArs += Number(hijo.costo_final_ars || 0) * comp.cantidad;
        totalBaseUsd += Number(hijo.costo_usd || 0) * comp.cantidad;
      }
    }
    nuevoCostoUsd = totalBaseUsd;
    nuevoCostoFinalArs = totalArs; 
  } else {
    nuevoCostoUsd = Number(artActual.costo_usd || 0);
    if (artActual.es_dolar) {
        const subtotal = nuevoCostoUsd * dolar * fob;
        nuevoCostoFinalArs = subtotal * (1 + (financ / 100));
    } else {
        nuevoCostoFinalArs = nuevoCostoUsd;
    }
  }

  await prisma.costosArticulos.update({
    where: { id_articulo: sku },
    data: {
      costo_usd: nuevoCostoUsd,
      costo_final_ars: nuevoCostoFinalArs,
      fecha_actualizacion: new Date()
    }
  });

  // Propaga el costo recalculado hacia Articulos Mostrador cuando el mismo
  // código de artículo existe ahí (catálogos vinculados por id). No falla si
  // no hay match: updateMany simplemente actualiza 0 filas.
  await prisma.articuloMostrador.updateMany({
    where: { id: sku },
    data: { costo: nuevoCostoFinalArs }
  });

  const relacionesComoHijo = await prisma.articulosCompuestos.findMany({
    where: { sku_hijo: sku }
  });

  for (const rel of relacionesComoHijo) {
    await recalculateProductCost(rel.sku_padre);
  }
}

/**
 * RECALCULAR TODO EL CATÁLOGO
 */
export async function recalculateAllArticulos() {
  try {
    const todos = await prisma.costosArticulos.findMany({
      select: { id_articulo: true }
    });
    for (const art of todos) {
      await recalculateProductCost(art.id_articulo);
    }
    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/costos");
    revalidatePath("/admin/mercadolibre/composicion");
    return { success: true };
  } catch (error) {
    console.error("Error en recalculateAllArticulos:", error);
    return { success: false, error: "No se pudo actualizar el catálogo." };
  }
}

// --- FUNCIONES DE OBTENCIÓN DE DATOS ---

export async function getArticulos() {
  try {
    const articulos = await prisma.costosArticulos.findMany({ orderBy: { descripcion: 'asc' } });
    
    // Identificamos cuáles son kits para que la tabla sepa cómo calcular la vista previa
    const kits = await prisma.articulosCompuestos.findMany({
      select: { sku_padre: true },
      distinct: ['sku_padre']
    });
    const kitSkus = new Set(kits.map(k => k.sku_padre));

    return articulos.map(art => ({
      ...art,
      isKit: kitSkus.has(art.id_articulo),
      costo_usd: art.costo_usd ? Number(art.costo_usd) : 0,
      costo_final_ars: art.costo_final_ars ? Number(art.costo_final_ars) : 0
    }));
  } catch (error) { return []; }
}

// Artículos unificados de CostosArticulos + ArticuloMostrador para el calculador de precio
export async function getArticulosParaPrecio() {
  try {
    const [costos, mostrador, kits] = await Promise.all([
      prisma.costosArticulos.findMany({ orderBy: { descripcion: 'asc' } }),
      prisma.articuloMostrador.findMany({ orderBy: { nombre: 'asc' } }),
      prisma.articulosCompuestos.findMany({ select: { sku_padre: true }, distinct: ['sku_padre'] }),
    ]);

    const kitSkus = new Set(kits.map((k) => k.sku_padre));

    const deCatalogo = costos.map((art) => ({
      id: art.id,
      id_articulo: art.id_articulo,
      descripcion: art.descripcion,
      costo_final_ars: art.costo_final_ars ? Number(art.costo_final_ars) : 0,
      isKit: kitSkus.has(art.id_articulo),
      fuente: "catalogo" as const,
    }));

    const deMostrador = mostrador.map((art) => ({
      id: art.id,
      id_articulo: art.id,
      descripcion: art.nombre,
      costo_final_ars: art.costo ? Number(art.costo) : 0,
      isKit: false,
      fuente: "mostrador" as const,
    }));

    return [...deCatalogo, ...deMostrador];
  } catch {
    return [];
  }
}

// Artículos unificados de CostosArticulos + ArticuloMostrador para el picker de
// Composición (recetas). Excluye packs y ocultos de Mostrador, y evita duplicar
// ids que ya existen en costos_articulos_old (ya sincronizados vía costo).
export async function getArticulosParaComposicion() {
  try {
    const [costos, mostrador, kits] = await Promise.all([
      prisma.costosArticulos.findMany({ orderBy: { descripcion: 'asc' } }),
      prisma.articuloMostrador.findMany({ orderBy: { nombre: 'asc' } }),
      prisma.articulosCompuestos.findMany({ select: { sku_padre: true }, distinct: ['sku_padre'] }),
    ]);

    const kitSkus = new Set(kits.map((k) => k.sku_padre));

    const deCatalogo = costos.map((art) => ({
      id_articulo: art.id_articulo,
      descripcion: art.descripcion,
      isKit: kitSkus.has(art.id_articulo),
      fuente: "catalogo" as const,
    }));

    const idsCatalogo = new Set(deCatalogo.map((a) => a.id_articulo));

    const deMostrador = mostrador
      .filter((art) => !art.esPack && !art.oculto && !idsCatalogo.has(art.id))
      .map((art) => ({
        id_articulo: art.id,
        descripcion: art.nombre,
        isKit: false,
        fuente: "mostrador" as const,
      }));

    return [...deCatalogo, ...deMostrador];
  } catch {
    return [];
  }
}

export async function getCostosKits() {
  noStore(); 
  
  try {
    const costos = await prisma.$queryRaw<any[]>`
      SELECT 
        mla,
        titulo,
        variation_id,
        variante_ml,
        estado,
        CAST(user_product_id AS VARCHAR) as user_product_id,
        CAST(family_id AS VARCHAR) as family_id,
        ids_articulos,
        receta_detallada,
        costo_total
      FROM vista_costos_productos 
      ORDER BY costo_total DESC
    `;
    
    // --- MAGIA ANTI-DUPLICADOS ---
    // Fusiona renglones separados para el mismo MLA
    const unificados = new Map();
    
    for (const item of costos) {
      const key = `${item.mla}-${item.variation_id || 'base'}`;
      
      if (!unificados.has(key)) {
        unificados.set(key, { ...item });
      } else {
        const existente = unificados.get(key);
        if (!existente.family_id && item.family_id) existente.family_id = item.family_id;
        if (!existente.user_product_id && item.user_product_id) existente.user_product_id = item.user_product_id;
        if (!existente.estado && item.estado) existente.estado = item.estado;
        if (!existente.variante_ml && item.variante_ml) existente.variante_ml = item.variante_ml;
      }
    }

    const resultadoFinal = Array.from(unificados.values());

    // Traemos es_nuevo desde ProductosMaestros para los MLAs del resultado
    const mlasUnicos = Array.from(new Set(resultadoFinal.map((i: any) => i.mla as string)));
    const maestros = await prisma.productosMaestros.findMany({
      where: { mla: { in: mlasUnicos } },
      select: { mla: true, variation_id: true, es_nuevo: true },
    });
    const esNuevoMap = new Map(
      maestros.map((m) => [`${m.mla}-${m.variation_id || ''}`, m.es_nuevo ?? false])
    );

    return resultadoFinal.map((item: any) => ({
      ...item,
      costo_total: item.costo_total ? Number(item.costo_total) : 0,
      es_nuevo: esNuevoMap.get(`${item.mla}-${item.variation_id || ''}`) ?? false,
    }));

  } catch (error) {
    console.error("Error en getCostosKits:", error);
    return [];
  }
}

// Dispara vía n8n la actualización de la pestaña "Comparador" del Google Sheet
// (columna A = MLA, columna M = costo Final), usando los costos calculados en /costos.
export async function triggerActualizarSheetComparador() {
  try {
    const costos = await getCostosKits();

    // Un valor por MLA: preferimos la fila base (variation_id null); si no existe, la primera variante.
    const ordenado = [...costos].sort((a, b) => {
      const aEsBase = !a.variation_id;
      const bEsBase = !b.variation_id;
      if (aEsBase === bEsBase) return 0;
      return aEsBase ? -1 : 1;
    });

    const porMla = new Map<string, { mla: string; costo_total: number }>();
    for (const item of ordenado) {
      if (!porMla.has(item.mla)) {
        porMla.set(item.mla, { mla: item.mla, costo_total: item.costo_total });
      }
    }

    const items = Array.from(porMla.values());

    const response = await fetch(
      "https://n8n.revolucionmotos.tech/webhook/actualizar-sheet-comparador",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return { success: false, error: `n8n respondió con estado ${response.status}` };
    }

    return { success: true, total: items.length };
  } catch (error) {
    console.error("Error al actualizar sheet Comparador:", error);
    return { success: false, error: "Error inesperado al conectar con n8n" };
  }
}

// --- FUNCIONES DE GESTIÓN (CRUD) ---

export async function upsertArticulo(data: any) {
  try {
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;
    
    // FORZAMOS MAYÚSCULAS Y LIMPIAMOS ESPACIOS AQUÍ
    const cleanSku = id_articulo.trim().toUpperCase();
    const cleanDesc = descripcion?.trim().toUpperCase(); 

    const updateData = {
      id_articulo: cleanSku,
      descripcion: cleanDesc,
      costo_usd: Number(costo_usd),
      es_dolar: Boolean(es_dolar),
      fecha_actualizacion: new Date()
    };

    if (id) {
      // 1. Buscamos el registro actual para comparar
      const articuloViejo = await prisma.costosArticulos.findUnique({
        where: { id: Number(id) }
      });

      // 2. Actualizamos la tabla principal (costos_articulos)
      await prisma.costosArticulos.update({ 
        where: { id: Number(id) }, 
        data: updateData 
      });

      // 3. PROPAGACIÓN: Si cambió el nombre, lo actualizamos en ComposicionKits
      if (articuloViejo && articuloViejo.descripcion !== cleanDesc) {
        await prisma.composicionKits.updateMany({
          where: { id_articulo: cleanSku },
          data: { nombre_articulo: cleanDesc }
        });
      }

    } else {
      // Si es nuevo, también se guarda en MAYÚSCULAS
      await prisma.costosArticulos.create({ data: updateData });
    }

    // Recalcular costos
    await recalculateProductCost(cleanSku);
    
    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/composicion");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error en upsertArticulo:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteArticulo(id: number) {
  try {
    await prisma.costosArticulos.delete({ where: { id } });
    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error) { return { success: false, error: "Error al eliminar." }; }
}

// --- ACCIONES POR LOTE (selección múltiple en la tabla) ---

export async function bulkDeleteArticulos(ids: number[]) {
  try {
    await prisma.costosArticulos.deleteMany({ where: { id: { in: ids } } });
    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/composicion");
    return { success: true };
  } catch (error: any) {
    console.error("Error en bulkDeleteArticulos:", error);
    return { success: false, error: error.message };
  }
}

export async function bulkUpdateEsDolar(ids: number[], esDolar: boolean) {
  try {
    const articulos = await prisma.costosArticulos.findMany({ where: { id: { in: ids } } });
    await prisma.costosArticulos.updateMany({
      where: { id: { in: ids } },
      data: { es_dolar: esDolar, fecha_actualizacion: new Date() }
    });
    for (const art of articulos) {
      await recalculateProductCost(art.id_articulo);
    }
    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/composicion");
    return { success: true };
  } catch (error: any) {
    console.error("Error en bulkUpdateEsDolar:", error);
    return { success: false, error: error.message };
  }
}

// Cambia el costo base de varios artículos a la vez.
// Los kits se ignoran: su costo se calcula solo, sumando el de sus componentes.
export async function bulkUpdateCosto(ids: number[], modo: "fijo" | "porcentaje", valor: number) {
  try {
    const [articulos, kits] = await Promise.all([
      prisma.costosArticulos.findMany({ where: { id: { in: ids } } }),
      prisma.articulosCompuestos.findMany({ select: { sku_padre: true }, distinct: ['sku_padre'] })
    ]);
    const kitSkus = new Set(kits.map(k => k.sku_padre));
    const editables = articulos.filter(art => !kitSkus.has(art.id_articulo));

    for (const art of editables) {
      const costoActual = Number(art.costo_usd || 0);
      const nuevoCosto = modo === "fijo" ? valor : costoActual * (1 + valor / 100);
      await prisma.costosArticulos.update({
        where: { id: art.id },
        data: { costo_usd: nuevoCosto, fecha_actualizacion: new Date() }
      });
    }
    for (const art of editables) {
      await recalculateProductCost(art.id_articulo);
    }

    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/composicion");
    return { success: true, omitidos: articulos.length - editables.length };
  } catch (error: any) {
    console.error("Error en bulkUpdateCosto:", error);
    return { success: false, error: error.message };
  }
}

export async function getComponentes(skuPadre: string) {
  try {
    return await prisma.articulosCompuestos.findMany({ where: { sku_padre: skuPadre } });
  } catch (error) { return []; }
}

export async function updateComponentes(skuPadre: string, componentes: { sku_hijo: string, cantidad: number }[]) {
  try {
    await prisma.articulosCompuestos.deleteMany({ where: { sku_padre: skuPadre } });
    if (componentes.length > 0) {
      await prisma.articulosCompuestos.createMany({
        data: componentes.map(c => ({ sku_padre: skuPadre, sku_hijo: c.sku_hijo, cantidad: c.cantidad }))
      });
    }
    await recalculateProductCost(skuPadre);
    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}
