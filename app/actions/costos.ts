// app/actions/costos.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

// --- FUNCIÓN MAESTRA: RECALCULAR PRECIO DE UN ARTÍCULO ---
// Esta función calcula el costo base de un artículo:
// - Si es simple: usa su costo_usd actual.
// - Si es compuesto: suma el costo de todos sus hijos.
export async function recalculateProductCost(sku: string) {
  // 1. Buscamos si este artículo tiene hijos (es un kit)
  const componentes = await prisma.articulosCompuestos.findMany({
    where: { sku_padre: sku }
  });

  let nuevoCostoUsd = 0;

  if (componentes.length > 0) {
    // ES UN KIT: Calculamos la suma de sus hijos
    for (const comp of componentes) {
      const hijo = await prisma.costosArticulos.findUnique({
        where: { id_articulo: comp.sku_hijo }
      });
      if (hijo && hijo.costo_usd) {
        nuevoCostoUsd += Number(hijo.costo_usd) * comp.cantidad;
      }
    }
  } else {
    // ES SIMPLE: Mantenemos el costo que ya tiene
    const art = await prisma.costosArticulos.findUnique({ where: { id_articulo: sku } });
    nuevoCostoUsd = Number(art?.costo_usd || 0);
  }

  // 2. Traemos configuración global para el precio final ARS
  const config = await prisma.config.findFirst();
  const dolar = Number(config?.dolarCotizacion || 1);
  const fob = Number(config?.factorFob || 1);
  const financ = Number(config?.recargoFinanciacion || 0);

  const artActual = await prisma.costosArticulos.findUnique({ where: { id_articulo: sku } });
  
  // 3. Calculamos el costo final ARS
  let costo_final = nuevoCostoUsd;
  if (artActual?.es_dolar) {
      costo_final = (nuevoCostoUsd * dolar * fob) * (1 + (financ / 100));
  }

  // 4. Guardamos los cambios en el artículo
  await prisma.costosArticulos.update({
    where: { id_articulo: sku },
    data: {
      costo_usd: nuevoCostoUsd,
      costo_final_ars: costo_final,
      fecha_actualizacion: new Date()
    }
  });

  // 5. RECURSIVIDAD (Propagación hacia arriba):
  // ¿Este artículo es a su vez hijo de otro kit? Buscamos sus "padres"
  const relacionesComoHijo = await prisma.articulosCompuestos.findMany({
    where: { sku_hijo: sku }
  });

  for (const rel of relacionesComoHijo) {
    // Llamamos a la misma función para el padre (así sube por toda la cadena)
    await recalculateProductCost(rel.sku_padre);
  }
}

// --- ACTUALIZAR O CREAR ARTÍCULO ---
export async function upsertArticulo(data: any) {
  try {
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;
    
    // 1. Guardamos los datos básicos
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

    // 2. DISPARAMOS EL RECALCULO:
    // Al actualizar un artículo, recalculamos su precio y el de todos sus kits "padres"
    await recalculateProductCost(id_articulo.trim());

    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/costos");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar artículo:", error);
    return { success: false, error: error.message };
  }
}

// Obtener los artículos individuales (sin cambios)
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
    return [];
  }
}

export async function deleteArticulo(id: number) {
  try {
    await prisma.costosArticulos.delete({ where: { id } });
    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error) {
    return { success: false, error: "Error al eliminar" };
  }
}
