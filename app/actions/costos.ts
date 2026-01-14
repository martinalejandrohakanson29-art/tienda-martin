// app/actions/costos.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

/**
 * RECALCULAR PRECIO DE UN ARTÍCULO
 * Calcula el costo base sumando sus hijos (si es kit) y luego aplica Dólar/FOB/Financ.
 */
export async function recalculateProductCost(sku: string) {
  // 1. Buscamos si este artículo tiene hijos (es un kit) en la nueva tabla
  const componentes = await prisma.articulosCompuestos.findMany({
    where: { sku_padre: sku }
  });

  let nuevoCostoUsd = 0;

  if (componentes.length > 0) {
    // ES UN KIT: Sumamos el costo de sus hijos multiplicando por la cantidad de cada uno
    for (const comp of componentes) {
      const hijo = await prisma.costosArticulos.findUnique({
        where: { id_articulo: comp.sku_hijo }
      });
      if (hijo && hijo.costo_usd) {
        nuevoCostoUsd += Number(hijo.costo_usd) * comp.cantidad;
      }
    }
  } else {
    // ES SIMPLE: Simplemente leemos su costo actual
    const art = await prisma.costosArticulos.findUnique({ where: { id_articulo: sku } });
    nuevoCostoUsd = Number(art?.costo_usd || 0);
  }

  // 2. Traemos configuración global para el precio final
  const config = await prisma.config.findFirst();
  const dolar = Number(config?.dolarCotizacion || 1);
  const fob = Number(config?.factorFob || 1);
  const financ = Number(config?.recargoFinanciacion || 0);

  const artActual = await prisma.costosArticulos.findUnique({ where: { id_articulo: sku } });
  
  // 3. Calculamos el costo final ARS persistente
  let costo_final = nuevoCostoUsd;
  if (artActual?.es_dolar) {
      const subtotal = nuevoCostoUsd * dolar * fob;
      costo_final = subtotal * (1 + (financ / 100));
  }

  // 4. Actualizamos el artículo con los nuevos valores calculados
  await prisma.costosArticulos.update({
    where: { id_articulo: sku },
    data: {
      costo_usd: nuevoCostoUsd,
      costo_final_ars: costo_final,
      fecha_actualizacion: new Date()
    }
  });

  // 5. PROPAGACIÓN: Si este artículo es hijo de otros kits, los recalculamos a ellos también
  const relacionesComoHijo = await prisma.articulosCompuestos.findMany({
    where: { sku_hijo: sku }
  });

  for (const rel of relacionesComoHijo) {
    await recalculateProductCost(rel.sku_padre);
  }
}

/**
 * OBTENER COSTOS DE KITS (Usa la vista de la DB)
 * Esta es la función que faltaba y causaba el error de build.
 */
export async function getCostosKits() {
  try {
    const costos = await prisma.$queryRaw`
      SELECT * FROM vista_costos_productos
      ORDER BY costo_total DESC
    `;
    return costos as any[];
  } catch (error) {
    console.error("Error al obtener costos de kits:", error);
    return [];
  }
}

/**
 * OBTENER LOS ARTÍCULOS INDIVIDUALES
 */
export async function getArticulos() {
  try {
    const articulos = await prisma.costosArticulos.findMany({
      orderBy: { descripcion: 'asc' }
    });
    
    return articulos.map(art => ({
      ...art,
      costo_usd: art.costo_usd ? Number(art.costo_usd) : 0,
      costo_final_ars: art.costo_final_ars ? Number(art.costo_final_ars) : 0
    }));
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    return [];
  }
}

/**
 * GUARDAR O EDITAR ARTÍCULO
 */
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
      await prisma.costosArticulos.update({
        where: { id: Number(id) }, 
        data: updateData,
      });
    } else {
      await prisma.costosArticulos.create({
        data: updateData,
      });
    }

    // Disparamos el recálculo automático para este SKU y sus posibles padres
    await recalculateProductCost(id_articulo.trim());

    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/costos");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar artículo:", error);
    return { 
      success: false, 
      error: error.message || "Error de base de datos al guardar." 
    };
  }
}

/**
 * ELIMINAR ARTÍCULO
 */
export async function deleteArticulo(id: number) {
  try {
    await prisma.costosArticulos.delete({
      where: { id }
    });
    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/costos");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar:", error);
    return { success: false, error: "No se pudo eliminar el artículo" };
  }
}
