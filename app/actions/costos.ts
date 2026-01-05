"use server";
import prisma from "@/lib/prisma";

export async function getCostosKits() {
  try {
    // Usamos queryRaw para leer directamente desde la vista SQL que creamos
    const costos = await prisma.$queryRaw`
      SELECT * FROM vista_costos_totales_kits
      ORDER BY costo_total_reposicion DESC
    `;
    return costos as any[];
  } catch (error) {
    console.error("Error al obtener costos:", error);
    return [];
  }
}
