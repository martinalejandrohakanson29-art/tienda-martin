// app/actions/costos.ts
"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ... funciones anteriores (getCostosKits, getArticulos)

export async function upsertArticulo(data: any) {
  try {
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;

    if (id) {
      // Editar existente
      await prisma.costosArticulos.update({
        where: { id },
        data: { id_articulo, descripcion, costo_usd, es_dolar },
      });
    } else {
      // Crear nuevo
      await prisma.costosArticulos.create({
        data: { id_articulo, descripcion, costo_usd, es_dolar },
      });
    }

    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error) {
    console.error("Error al guardar:", error);
    return { success: false, error: "Error al guardar el artículo" };
  }
}

export async function deleteArticulo(id: number) {
  try {
    await prisma.costosArticulos.delete({ where: { id } });
    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar:", error);
    return { success: false, error: "No se pudo eliminar el artículo" };
  }
}
