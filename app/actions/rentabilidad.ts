// app/actions/rentabilidad.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getRentabilidadData() {
  try {
    // Traemos los productos maestros y sus costos asociados
    // Asumimos que productosMaestros tiene el MLA y el precio_ml (puedes agregarlo a tu schema)
    const productos = await prisma.productosMaestros.findMany({
      orderBy: { nombre_publicacion: 'asc' },
    });

    // Aquí podrías cruzar con la tabla de costos usando el mapeo que ya tenés
    // Por ahora, devolvemos la lista base preparada para el matching
    return productos.map(p => ({
      item_id: p.mla,
      nombre: p.nombre_publicacion,
      precio_original: p.precio_venta_ml || 0, // Campo que alimentaremos con el workflow
      variation_id: p.variation_id,
      estado: p.estado
    }));
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
