// app/actions/costos.ts

"use server";
import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";

// Actualizado para usar la nueva vista_costos_productos
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

// ... (el resto de las funciones se mantienen igual)

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

// app/actions/costos.ts

export async function upsertArticulo(data: any) {
  try {
    // Extraemos los datos y nos aseguramos de que el id sea un número si existe
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;
    
    // Preparamos los datos para Prisma asegurando tipos numéricos
    const updateData = {
      id_articulo: id_articulo.trim(),
      descripcion: descripcion?.trim(),
      costo_usd: Number(costo_usd), // Forzamos que sea número (Decimal en Prisma acepta number)
      es_dolar: Boolean(es_dolar),
    };

    if (id) {
      // MODIFICACIÓN: Aseguramos que el id sea un número entero
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
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar:", error);
    // Devolvemos el error específico para que el frontend pueda mostrarlo
    return { 
      success: false, 
      error: error.code === 'P2002' 
        ? "Ya existe un artículo con ese SKU (ID de Artículo)." 
        : "Error de base de datos al guardar." 
    };
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
