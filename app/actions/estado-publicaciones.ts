"use server";

import { prisma } from "@/lib/prisma";
import { crearResolverAgregados } from "@/lib/agregados";
import { getRentabilidadData } from "./rentabilidad";

export interface PublicacionEstado {
  item_id: string;
  variation_id: string | null; // MLU: presente = esta fila es una variante puntual del MLA, no el item entero
  variant_label: string | null; // ej: "Rojo / L", armado con los attribute_combinations de ML
  title: string;
  price: number;
  currency_id: string | null;
  available_quantity: number;
  sold_quantity: number;
  status: string;
  permalink: string | null;
  ventas_30d: number;
  stock_full: number | null; // null = no tiene stock en Full
  stock_deposito: number | null; // null = no hay depósito propio editable (Full puro)
  user_product_id: string | null; // presente = stock multi-origen (Full + depósito por ubicación)
  stock_nuestro: number | null; // null = no hay receta de composición cargada para este MLA/variante
  ganancia_pct: number | null; // mismo cálculo que /admin/mercadolibre/rentabilidad; null = sin datos de costo/rentabilidad
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
    const [response, ventasMap, rentabilidadData] = await Promise.all([
      fetch(N8N_ESTADO_PUBLICACIONES_URL, { method: "POST", cache: "no-store" }),
      getVentasML30dMap(),
      getRentabilidadData(),
    ]);

    // Ganancia %: mismo cálculo que /admin/mercadolibre/rentabilidad (fees + descuentos + costo
    // real de la receta). Esa función devuelve 1 fila por MLA (no por variante), así que el
    // porcentaje se repite en todas las variantes de un mismo MLA — igual que ventas_30d.
    const gananciaPorMla = new Map<string, number>(
      rentabilidadData.map((r) => [r.item_id, r.ganancia_porcentaje])
    );

    if (!response.ok) {
      return { success: false, data: [], error: `n8n respondió con estado ${response.status}` };
    }

    const items = await response.json();
    if (!Array.isArray(items)) {
      return { success: false, data: [], error: "Respuesta inesperada de n8n" };
    }

    // "Stock nuestro": para cada MLA/variante, resolvemos la receta de composición (misma
    // fuente de verdad que /admin/mercadolibre/composicion) y calculamos el stock disponible
    // como el mínimo de floor(stock_componente / cantidad) entre sus componentes — la misma
    // fórmula que ya usan los packs de mostrador (lib/packs-stock.ts, ventas-mostrador.ts).
    // null = no hay receta cargada para ese MLA/variante (no se puede calcular).
    const resolverAgregados = await crearResolverAgregados(items.map((it: any) => it.item_id));
    const componentesPorItem = items.map((it: any) =>
      resolverAgregados(it.item_id, it.variation_id != null ? String(it.variation_id) : null)
    );
    const idsArticulos = Array.from(
      new Set(componentesPorItem.flatMap((comps) => comps.map((c) => c.id_articulo)))
    );
    const articulos = idsArticulos.length > 0
      ? await prisma.articuloMostrador.findMany({
          where: { id: { in: idsArticulos } },
          select: { id: true, stock: true },
        })
      : [];
    const stockPorArticulo = new Map(articulos.map((a) => [a.id, a.stock]));

    const data: PublicacionEstado[] = items.map((it: any, idx: number) => {
      const componentes = componentesPorItem[idx];
      const stockNuestro = componentes.length > 0
        ? Math.min(
            ...componentes.map((c) => Math.floor((stockPorArticulo.get(c.id_articulo) ?? 0) / (c.cantidad || 1)))
          )
        : null;

      return {
        item_id: it.item_id,
        variation_id: it.variation_id != null ? String(it.variation_id) : null,
        variant_label: it.variant_label ?? null,
        title: it.title || "Sin título",
        price: Number(it.price || 0),
        currency_id: it.currency_id ?? null,
        available_quantity: Number(it.available_quantity || 0),
        sold_quantity: Number(it.sold_quantity || 0),
        status: it.status,
        permalink: it.permalink ?? null,
        ventas_30d: ventasMap.get((it.item_id || "").trim()) ?? 0,
        // n8n ya separó Full vs depósito propio consultando /user-products/{id}/stock
        // (stock multi-origen) cuando corresponde; acá solo tipamos los valores.
        stock_full: it.stock_full === null || it.stock_full === undefined ? null : Number(it.stock_full),
        stock_deposito: it.stock_deposito === null || it.stock_deposito === undefined ? null : Number(it.stock_deposito),
        user_product_id: it.user_product_id ?? null,
        stock_nuestro: stockNuestro,
        ganancia_pct: gananciaPorMla.get(it.item_id) ?? null,
      };
    });

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

// Actualiza el stock del depósito propio de una publicación (o de una variante puntual) en ML vía n8n.
// Si tiene user_product_id (stock multi-origen) n8n lee la ubicación actual del depósito
// propio (seller_warehouse/selling_address) y la actualiza vía /user-products; el stock
// en Full (meli_facility) queda intacto porque es de solo lectura para el vendedor.
// Si no tiene user_product_id pero sí variation_id (variante sin stock distribuido), n8n
// actualiza el stock de esa variación puntual vía /items/{id}/variations/{variation_id}.
export async function setStockPublicacionML(
  itemId: string,
  userProductId: string | null,
  nuevoStock: number,
  variationId: string | null = null
): Promise<{ success: boolean; available_quantity?: number; error?: string }> {
  try {
    const response = await fetch(N8N_ACTUALIZAR_STOCK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: itemId,
        user_product_id: userProductId,
        variation_id: variationId,
        available_quantity: nuevoStock,
      }),
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
