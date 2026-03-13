// app/actions/kits.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Obtener todas las composiciones de kits
export async function getComposicionKits() {
  try {
    return await prisma.composicionKits.findMany({
      orderBy: [
        { mla: 'asc' },
        { nombre_variante: 'asc' }
      ]
    });
  } catch (error) {
    console.error("Error al obtener composiciones:", error);
    return [];
  }
}

/**
 * Agregar o editar un componente en un kit de forma individual.
 */
export async function upsertKitComponent(data: any) {
  try {
    const { id, mla, variation_id, nombre_variante, id_articulo, cantidad, nombre_articulo } = data;

    const cleanMla = mla?.trim().toUpperCase() || "";
    const cleanVariationId = (variation_id && variation_id.trim() !== "") ? variation_id.trim() : null;
    const cleanNombreVariante = (nombre_variante && nombre_variante.trim() !== "") ? nombre_variante.trim() : "0";
    const cleanIdArticulo = id_articulo?.trim() || "";

    if (id) {
      await prisma.composicionKits.update({
        where: { id },
        data: { 
          mla: cleanMla,
          variation_id: cleanVariationId,
          nombre_variante: cleanNombreVariante, 
          id_articulo: cleanIdArticulo, 
          cantidad: Number(cantidad), 
          nombre_articulo: nombre_articulo?.trim() || ""
        },
      });
    } else {
      await prisma.composicionKits.create({
        data: { 
          mla: cleanMla, 
          variation_id: cleanVariationId,
          nombre_variante: cleanNombreVariante, 
          id_articulo: cleanIdArticulo, 
          cantidad: Number(cantidad), 
          nombre_articulo: nombre_articulo?.trim() || ""
        },
      });
    }

    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar componente:", error);
    return { 
      success: false, 
      error: error.message || "Error al guardar el componente del kit" 
    };
  }
}

// NUEVO: Guardar una receta completa (Múltiples Variantes con Múltiples Items)
export async function saveBulkKitComponents(payload: { mla: string, variantes: any[] }) {
  try {
    const cleanMla = payload.mla.trim().toUpperCase();
    
    for (const variant of payload.variantes) {
      const cleanVariationId = (variant.variation_id && variant.variation_id.trim() !== "") ? variant.variation_id.trim() : null;
      const cleanNombreVariante = (variant.nombre_variante && variant.nombre_variante.trim() !== "") ? variant.nombre_variante.trim() : "0";
      
      for (const comp of variant.componentes) {
        if (!comp.id_articulo) continue; // Saltamos los campos vacíos
        
        await prisma.composicionKits.create({
          data: {
            mla: cleanMla,
            variation_id: cleanVariationId,
            nombre_variante: cleanNombreVariante,
            id_articulo: comp.id_articulo.trim(),
            cantidad: Number(comp.cantidad) || 1,
            nombre_articulo: comp.nombre_articulo?.trim() || ""
          }
        });
      }
    }
    
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar receta masiva:", error);
    return { success: false, error: error.message };
  }
}

// Eliminar un componente de un kit
export async function deleteKitComponent(id: number) {
  try {
    await prisma.composicionKits.delete({
      where: { id }
    });
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar componente:", error);
    return { success: false };
  }
}
