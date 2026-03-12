// martinalejandrohakanson29-art/tienda-martin/app/actions/guia-full.ts
"use server"

import { prisma } from "@/lib/prisma";

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

    return items.map(item => ({
      id: item.id, // ID único de la tabla ShipmentItem
      title: item.itemId, 
      subtitle: item.sku || "Sin SKU",
      publicationName: item.title,
      variation: item.variation,
      image: item.imageUrl,
      quantity: item.quantity,
      agregados: item.agregados ? item.agregados.split(',').map(s => s.trim()) : []
    }));
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return [];
  }
}
