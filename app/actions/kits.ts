// app/actions/kits.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Obtener todas las composiciones de kits ENRIQUECIDAS con los datos Maestros
export async function getComposicionKits() {
  try {
    // 1. Traemos todas las recetas base
    const kits = await prisma.composicionKits.findMany({
      orderBy: [
        { mla: 'asc' },
        { nombre_variante: 'asc' }
      ]
    });

    // 2. Extraemos los MLAs únicos para no saturar la base de datos
    const mlasUnicos = [...new Set(kits.map(k => k.mla))];

    // 3. Buscamos en el "Diccionario" (productos_maestros) esos MLAs específicos
    const maestros = await prisma.productosMaestros.findMany({
      where: { mla: { in: mlasUnicos } },
      select: { mla: true, variation_id: true, user_product_id: true, family_id: true }
    });

    // 4. Cruzamos los datos: Le pegamos la Familia y el User Product a cada Kit
    const kitsEnriquecidos = kits.map(kit => {
      // Intentamos coincidencia exacta (MLA + Variación)
      let maestro = maestros.find(m => m.mla === kit.mla && m.variation_id === kit.variation_id);
      
      // Si no encuentra la variación exacta, hace fallback al MLA genérico
      if (!maestro) {
        maestro = maestros.find(m => m.mla === kit.mla);
      }

      return {
        ...kit,
        user_product_id: maestro?.user_product_id || null,
        family_id: maestro?.family_id || null
      };
    });

    return kitsEnriquecidos;
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
