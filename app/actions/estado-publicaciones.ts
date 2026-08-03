"use server";

import { prisma } from "@/lib/prisma";

export interface PublicacionEstado {
  item_id: string;
  title: string;
  price: number;
  currency_id: string | null;
  available_quantity: number;
  sold_quantity: number;
  status: string;
  permalink: string | null;
  ventas_30d: number;
  stock_full: number | null; // null = no es una publicación Full
}

const N8N_ESTADO_PUBLICACIONES_URL =
  process.env.N8N_WEBHOOK_ESTADO_PUBLICACIONES ||
  "https://n8n.revolucionmotos.tech/webhook/estado-publicaciones";

const N8N_CAMBIAR_ESTADO_URL =
  process.env.N8N_WEBHOOK_CAMBIAR_ESTADO_PUBLICACION ||
  "https://n8n.revolucionmotos.tech/webhook/cambiar-estado-publicacion";

const N8N_ACTUALIZAR_STOCK_URL =
  process.env.N8N_WEBHOOK_ACTUALIZAR_STOCK_PUBLICACION ||
  "https://n8n.revolucionmotos.tech/webhook/actualizar-stock-publicacion";

// Ventas de ML últimos 30 días por MLA: misma lógica que /admin/mercadolibre/rentabilidad
async function getVentasML30dMap(): Promise<Map<string, number>> {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
  hace30.setHours(0, 0, 0, 0);

  const pvML = await prisma.puntoVenta.findFirst({
    where: { nombre: { contains: "mercadolibre", mode: "insensitive" } },
    select: { id: true },
  });

  if (!pvML) return new Map();

  const ventasML = await prisma.venta.groupBy({
    by: ["mlMla"],
    _count: { id: true },
    where: {
      puntoVentaId: pvML.id,
      mlMla: { not: "" },
      tipoVenta: { not: "PEDIDO" },
      createdAt: { gte: hace30, lte: hoy },
    },
  });

  const map = new Map<string, number>();
  for (const v of ventasML) {
    if (v.mlMla) map.set(v.mlMla.trim(), v._count.id);
  }
  return map;
}

// Trae el estado real y actual de todas las publicaciones (activas + pausadas) desde ML vía n8n
export async function getEstadoPublicacionesML(): Promise<{
  success: boolean;
  data: PublicacionEstado[];
  error?: string;
}> {
  try {
    const [response, ventasMap] = await Promise.all([
      fetch(N8N_ESTADO_PUBLICACIONES_URL, { method: "POST", cache: "no-store" }),
      getVentasML30dMap(),
    ]);

    if (!response.ok) {
      return { success: false, data: [], error: `n8n respondió con estado ${response.status}` };
    }

    const items = await response.json();
    if (!Array.isArray(items)) {
      return { success: false, data: [], error: "Respuesta inesperada de n8n" };
    }

    const data: PublicacionEstado[] = items.map((it: any) => ({
      item_id: it.item_id,
      title: it.title || "Sin título",
      price: Number(it.price || 0),
      currency_id: it.currency_id ?? null,
      available_quantity: Number(it.available_quantity || 0),
      sold_quantity: Number(it.sold_quantity || 0),
      status: it.status,
      permalink: it.permalink ?? null,
      ventas_30d: ventasMap.get((it.item_id || "").trim()) ?? 0,
      // Si tiene inventory_id, available_quantity suma Full + depósito propio: usamos el stock
      // Full real que n8n consultó aparte. Si no tiene inventory_id y es Full puro, todo el
      // available_quantity está en el depósito de ML.
      stock_full:
        it.inventory_id
          ? Number(it.full_stock_real ?? 0)
          : it.logistic_type === "fulfillment"
          ? Number(it.available_quantity || 0)
          : null,
    }));

    return { success: true, data };
  } catch (error) {
    console.error("Error al obtener estado de publicaciones:", error);
    return { success: false, data: [], error: "Error inesperado al conectar con n8n" };
  }
}

// Pausa o activa una publicación puntual en ML vía n8n, sin pasar por MercadoLibre a mano
export async function setEstadoPublicacionML(
  itemId: string,
  nuevoEstado: "active" | "paused"
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const response = await fetch(N8N_CAMBIAR_ESTADO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, status: nuevoEstado }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false, error: `n8n respondió con estado ${response.status}` };
    }

    const result = await response.json();
    if (!result.success) {
      return { success: false, error: result.error || "MercadoLibre rechazó el cambio de estado" };
    }

    return { success: true, status: result.status };
  } catch (error) {
    console.error("Error al cambiar estado de publicación:", error);
    return { success: false, error: "Error inesperado al conectar con n8n" };
  }
}

// Actualiza el stock del depósito propio de una publicación en ML vía n8n.
// Para publicaciones con inventario combinado (Full + depósito), ML puede rechazar
// el cambio directo; en ese caso el error real de ML queda en result.error.
export async function setStockPublicacionML(
  itemId: string,
  nuevoStock: number
): Promise<{ success: boolean; available_quantity?: number; error?: string }> {
  try {
    const response = await fetch(N8N_ACTUALIZAR_STOCK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, available_quantity: nuevoStock }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false, error: `n8n respondió con estado ${response.status}` };
    }

    const result = await response.json();
    if (!result.success) {
      return { success: false, error: result.error || "MercadoLibre rechazó el cambio de stock" };
    }

    return { success: true, available_quantity: result.available_quantity };
  } catch (error) {
    console.error("Error al actualizar stock de publicación:", error);
    return { success: false, error: "Error inesperado al conectar con n8n" };
  }
}
