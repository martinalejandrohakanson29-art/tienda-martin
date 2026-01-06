"use server";
// Cambiamos el import para que coincida con tu lib/prisma.ts
import { prisma } from "@/lib/prisma"; 

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

export async function getArticulos() {
  try {
    const articulos = await prisma.costosArticulos.findMany({
      orderBy: {
        descripcion: 'asc'
      }
    });
    
    return articulos.map(art => ({
      ...art,
      // Cambiamos costo_fob_usd por costo_usd
      costo_usd: art.costo_usd ? Number(art.costo_usd) : 0,
      // Agregamos el factor_fob
      factor_fob: art.factor_fob ? Number(art.factor_fob) : 1,
      costo_final_ars: art.costo_final_ars ? Number(art.costo_final_ars) : 0
    }));
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    return [];
  }
}
