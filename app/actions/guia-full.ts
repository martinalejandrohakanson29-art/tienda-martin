"use server"

import { prisma } from "@/lib/prisma";
import { crearResolverAgregados } from "@/lib/agregados";

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

    const resolverAgregados = await crearResolverAgregados(items.map(i => i.itemId));

    return items.map(item => {
      const componentes = resolverAgregados(item.itemId, item.variation);

      return {
        id: item.id,
        title: item.itemId,
        subtitle: item.sku || "Sin SKU",
        publicationName: item.title,
        variation: item.variation,
        image: item.imageUrl,
        quantity: item.quantity,
        agregados: item.agregados ? item.agregados.split(',').map((s: string) => s.trim()) : [],
        receta: componentes.length > 0
          ? componentes.map(c => `${c.nombre_articulo || c.id_articulo} (x${c.cantidad})`).join(' + ')
          : null,
        componentes_ids: componentes.length > 0
          ? componentes.map(c => c.id_articulo).join(' + ')
          : null
      };
    });
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return [];
  }
}
