// app/actions/rentabilidad.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getRentabilidadData() {
  try {
    // Traemos los productos de la tabla maestros
    const productos = await prisma.productosMaestros.findMany({
      orderBy: { nombre_publicacion: 'asc' },
    });

    return productos.map(p => ({
      item_id: p.mla,
      nombre: p.nombre_publicacion || "Sin título",
      // Asumimos que precio_venta_ml existe en tu schema de prisma
      precio_original: Number(p.precio_venta_ml || 0), 
      estado: p.estado || "active"
    }));
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
