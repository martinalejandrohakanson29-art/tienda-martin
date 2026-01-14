// app/actions/costos.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

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
    return { success: true };
  } catch (error) {
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

// ESTA ES LA FUNCIÓN QUE FALTABA Y CAUSABA EL ERROR DE BUILD
export async function getCostosKits() {
  try {
    // Nota: Asegúrate de tener la vista 'vista_costos_productos' creada en tu DB
    const costos = await prisma.$queryRaw`SELECT * FROM vista_costos_productos ORDER BY costo_total DESC`;
    return costos as any[];
  } catch (error) { 
    console.error("Error en getCostosKits:", error);
    return []; 
  }
}

// --- FUNCIONES DE GESTIÓN (CRUD) ---

// app/actions/costos.ts

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
      // Ahora cleanDesc ya viene en MAYÚSCULAS puras
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
