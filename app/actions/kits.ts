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
 * Agregar o editar un componente en un kit.
 * Se encarga de limpiar los IDs para que coincidan con la tabla de costos.
 */
export async function upsertKitComponent(data: any) {
  try {
    const { id, mla, variation_id, nombre_variante, id_articulo, cantidad, nombre_articulo } = data;

    // Limpiamos los datos: quitamos espacios en blanco y normalizamos
    const cleanMla = mla?.trim().toUpperCase() || "";
    // Si variation_id está vacío o es solo espacios, lo guardamos como null
    const cleanVariationId = (variation_id && variation_id.trim() !== "") ? variation_id.trim() : null;
    const cleanNombreVariante = (nombre_variante && nombre_variante.trim() !== "") ? nombre_variante.trim() : "0";
    const cleanIdArticulo = id_articulo?.trim() || "";

    if (id) {
      // Actualizar registro existente
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
      // Crear nuevo registro
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

    // Refrescamos las rutas para que los cambios se vean en ambas tablas
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
