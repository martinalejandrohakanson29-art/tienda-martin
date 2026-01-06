"use server";
import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

// 1. Función para la tabla de Kits (la que ya tenías)
export async function getCostosKits() {
  try {
    const costos = await prisma.$queryRaw`
      SELECT * FROM vista_costos_totales_kits
      ORDER BY costo_total_reposicion DESC
    `;
    return costos as any[];
  } catch (error) {
    console.error("Error al obtener costos de kits:", error);
    return [];
  }
}

// 2. Función para obtener los artículos individuales
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

// 3. Función para crear o editar artículos (UPSERT)
export async function upsertArticulo(data: any) {
  try {
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;

    if (id) {
      await prisma.costosArticulos.update({
        where: { id },
        data: { id_articulo, descripcion, costo_usd, es_dolar },
      });
    } else {
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

// 4. Función para eliminar artículos
export async function deleteArticulo(id: number) {
  try {
    await prisma.costosArticulos.delete({
      where: { id }
    });
    revalidatePath("/admin/mercadolibre/articulos");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar:", error);
    return { success: false, error: "No se pudo eliminar el artículo" };
  }
}
