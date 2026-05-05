"use server"

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function getRecentShipments() {
  try {
    return await prisma.shipment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true }
    });
  } catch (error) {
    console.error("Error obteniendo envíos:", error);
    return [];
  }
}

export async function searchShipmentItems(query: string, shipmentId: string) {
  if (!shipmentId) return [];

  try {
    const items = await prisma.shipmentItem.findMany({
      where: {
        shipmentId: shipmentId,
        OR: [
          { itemId: { contains: query, mode: 'insensitive' } },
          { title: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
        ]
      },
      take: 50
    });

    const mlas = Array.from(new Set(items.map(i => i.itemId)));
    
    // Obtenemos la receta de la vista de costos
    let recetas: any[] = [];
    try {
      if (mlas.length > 0) {
        recetas = await prisma.$queryRaw<any[]>`
          SELECT mla, variation_id, receta_detallada, ids_articulos
          FROM vista_costos_productos
          WHERE mla IN (${Prisma.join(mlas)})
        `;
      }
    } catch (e) {
      console.error("Error al obtener recetas de vista_costos_productos:", e);
    }

    return items.map(item => {
      // Intentamos encontrar la receta por MLA y variación
      // Convertimos a string para comparar con seguridad
      const receta = recetas.find(r => 
        String(r.mla) === String(item.itemId) && 
        (String(r.variation_id || "") === String(item.variation || "") || !r.variation_id)
      );

      return {
        id: item.id,
        title: item.itemId, 
        subtitle: item.sku || "Sin SKU",
        publicationName: item.title,
        variation: item.variation,
        image: item.imageUrl,
        quantity: item.quantity,
        agregados: item.agregados ? item.agregados.split(',').map(s => s.trim()) : [],
        receta: receta?.receta_detallada || null,
        componentes_ids: receta?.ids_articulos || null
      };
    });
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return [];
  }
}
