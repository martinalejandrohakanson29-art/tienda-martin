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
    const { id, id_articulo, descripcion, costo_usd, es_dolar } = data;
    
    // Traemos la config actual para el cálculo
    const config = await prisma.config.findFirst();
    const dolar = Number(config?.dolarCotizacion || 1);
    const fob = Number(config?.factorFob || 1);
    const financ = Number(config?.recargoFinanciacion || 0);

    // Calculamos el costo final antes de guardar
    let costo_final = Number(costo_usd);
    if (Boolean(es_dolar)) {
        costo_final = (Number(costo_usd) * dolar * fob) * (1 + (financ / 100));
    }

    const updateData = {
      id_articulo: id_articulo.trim(),
      descripcion: descripcion?.trim(),
      costo_usd: Number(costo_usd),
      es_dolar: Boolean(es_dolar),
      costo_final_ars: costo_final, // GUARDAMOS EL VALOR CALCULADO
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
    return { success: true };
  } catch (error: any) {
    // ... manejo de errores ...
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
