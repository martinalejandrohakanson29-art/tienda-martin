// app/actions/rentabilidad.ts
"use server";

import { prisma } from "@/lib/prisma";

export async function getRentabilidadData() {
  try {
    // FILTRO CLAVE: Agregamos el 'where' para traer solo las activas
    const productos = await prisma.productosMaestros.findMany({
      where: {
        estado: "active" // Solo listamos lo que está activo en ML
      },
      orderBy: { nombre_publicacion: 'asc' },
    });

    return productos.map(p => ({
      item_id: p.mla,
      nombre: p.nombre_publicacion || "Sin título",
      precio_original: Number(p.precio_venta_ml || 0), 
      estado: p.estado || "active"
    }));
  } catch (error) {
    console.error("Error al obtener datos de rentabilidad:", error);
    return [];
  }
}
