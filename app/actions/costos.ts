// app/actions/costos.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

/**
 * RECALCULAR PRECIO DE UN ARTÍCULO (LÓGICA PARA KITS MIXTOS)
 * Si es kit: Suma los VALORES FINALES EN PESOS de cada componente.
 * Si es simple: Aplica factores de conversión (Dólar/FOB/Financ) si es moneda dólar.
 */
export async function recalculateProductCost(sku: string) {
  // 1. Traemos la configuración global vigente
  const config = await prisma.config.findFirst();
  const dolar = Number(config?.dolarCotizacion || 1);
  const fob = Number(config?.factorFob || 1);
  const financ = Number(config?.recargoFinanciacion || 0);

  // 2. Buscamos el artículo y sus posibles componentes
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
    /**
     * ESCENARIO A: ES UN KIT
     * Sumamos el costo_final_ars de cada hijo (que ya está convertido si era dólar).
     */
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
    /**
     * ESCENARIO B: ES UN ARTÍCULO SIMPLE
     */
    nuevoCostoUsd = Number(artActual.costo_usd || 0);
    if (artActual.es_dolar) {
        // (Costo * Dolar * FOB) * Recargo Financiero
        const subtotal = nuevoCostoUsd * dolar * fob;
        nuevoCostoFinalArs = subtotal * (1 + (financ / 100));
    } else {
        // Es en pesos: el costo base es igual al final
        nuevoCostoFinalArs = nuevoCostoUsd;
    }
  }

  // 3. Guardamos los resultados calculados en la DB
  await prisma.costosArticulos.update({
    where: { id_articulo: sku },
    data: {
      costo_usd: nuevoCostoUsd,
      costo_final_ars: nuevoCostoFinalArs,
      fecha_actualizacion: new Date()
    }
  });

  // 4. PROPAGACIÓN: Si este artículo es hijo de otros kits, los recalculamos también
  const relacionesComoHijo = await prisma.articulosCompuestos.findMany({
    where: { sku_hijo: sku }
  });

  for (const rel of relacionesComoHijo) {
    await recalculateProductCost(rel.sku_padre);
  }
}

/**
 * RECALCULAR TODO EL CATÁLOGO
 * Útil para actualizar todos los precios de la DB cuando cambia el valor del Dólar global.
 */
export async function recalculateAllArticulos() {
  try {
    const todos = await prisma.costosArticulos.findMany({
      select: { id_articulo: true }
    });
    
    // Recorremos y recalculamos uno por uno
    for (const art of todos) {
      await recalculateProductCost(art.id_articulo);
    }
    
    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/costos");
    return { success: true };
  } catch (error) {
    console.error("Error al recalcular catálogo:", error);
    return { success: false, error: "No se pudo actualizar el catálogo completo." };
  }
}

// --- FUNCIONES DE OBTENCIÓN DE DATOS ---

export async function getArticulos() {
  try {
    const articulos = await prisma.costosArticulos.findMany({ orderBy: { descripcion: 'asc' } });
    return articulos.map(art => ({
      ...art,
      costo_usd: art.costo_usd ? Number(art.costo_usd) : 0,
      costo_final_ars: art.costo_final_ars ? Number(art.costo_final_ars) : 0
    }));
  } catch (error) { return []; }
}

export async function getCostosKits() {
  try {
    const costos = await prisma.$queryRaw`SELECT * FROM vista_costos_productos ORDER BY costo_total DESC`;
    return costos as any[];
  } catch (error) { return []; }
}

// --- FUNCIONES DE GESTIÓN (CRUD) ---

export async function upsertArticulo(data: any) {
  try {
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;
    const updateData = {
      id_articulo: id_articulo.trim(),
      descripcion: descripcion?.trim(),
      costo_usd: Number(costo_usd),
      es_dolar: Boolean(es_dolar),
      fecha_actualizacion: new Date()
    };

    if (id) {
      await prisma.costosArticulos.update({ where: { id: Number(id) }, data: updateData });
    } else {
      await prisma.costosArticulos.create({ data: updateData });
    }

    await recalculateProductCost(id_articulo.trim());
    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error: any) {
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

// --- GESTIÓN DE COMPOSICIÓN (KITS) ---

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
