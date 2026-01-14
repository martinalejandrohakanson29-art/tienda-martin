// app/actions/costos.ts
"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

// Obtener costos de kits (usando la vista de la DB)
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

// Obtener los artículos individuales
export async function getArticulos() {
  try {
    const articulos = await prisma.costosArticulos.findMany({
      orderBy: {
        descripcion: 'asc'
      }
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

// GUARDAR O EDITAR ARTÍCULO (Calculando precio final persistente)
export async function upsertArticulo(data: any) {
  try {
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;
    
    // 1. Buscamos la configuración global para saber el Dólar, FOB y Financiación actuales
    const config = await prisma.config.findFirst();
    const dolar = Number(config?.dolarCotizacion || 1);
    const fob = Number(config?.factorFob || 1);
    const financ = Number(config?.recargoFinanciacion || 0);

    // 2. Calculamos el costo final antes de guardar en la base de datos
    let costo_final = Number(costo_usd);
    if (Boolean(es_dolar)) {
        // (Precio * Dolar * FOB) + Recargo de Financiación
        const subtotal = Number(costo_usd) * dolar * fob;
        costo_final = subtotal * (1 + (financ / 100));
    }

    const updateData = {
      id_articulo: id_articulo.trim(),
      descripcion: descripcion?.trim(),
      costo_usd: Number(costo_usd),
      es_dolar: Boolean(es_dolar),
      costo_final_ars: costo_final, 
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

    revalidatePath("/admin/mercadolibre/articulos");
    revalidatePath("/admin/mercadolibre/costos");
    
    return { success: true }; // Éxito
  } catch (error: any) {
    console.error("Error al guardar artículo:", error);
    // IMPORTANTE: Siempre devolvemos un objeto para que TypeScript no de error
    return { 
      success: false, 
      error: error.message || "Error de base de datos al guardar." 
    };
  }
}

// Eliminar artículos
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
