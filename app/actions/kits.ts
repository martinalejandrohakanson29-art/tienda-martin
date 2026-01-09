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

// Agregar o editar un componente en un kit
export async function upsertKitComponent(data: any) {
  try {
    const { id, mla, nombre_variante, id_articulo, cantidad, nombre_articulo } = data;

    if (id) {
      await prisma.composicionKits.update({
        where: { id },
        data: { mla, nombre_variante, id_articulo, cantidad: Number(cantidad), nombre_articulo },
      });
    } else {
      await prisma.composicionKits.create({
        data: { 
          mla, 
          nombre_variante: nombre_variante || "Principal", 
          id_articulo, 
          cantidad: Number(cantidad), 
          nombre_articulo 
        },
      });
    }

    revalidatePath("/admin/mercadolibre/composicion");
    return { success: true };
  } catch (error) {
    console.error("Error al guardar componente:", error);
    return { success: false, error: "Error al guardar el componente del kit" };
  }
}

// Eliminar un componente de un kit
export async function deleteKitComponent(id: number) {
  try {
    await prisma.composicionKits.delete({
      where: { id }
    });
    revalidatePath("/admin/mercadolibre/composicion");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar componente:", error);
    return { success: false };
  }
}
