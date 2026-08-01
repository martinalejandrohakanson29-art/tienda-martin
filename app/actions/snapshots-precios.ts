"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redondear, TAX_RATE_ML } from "@/lib/precios";

export type SnapshotPrecios = {
  id: string;
  nombre: string;
  createdAt: string;
  cantidadItems: number;
};

export async function getSnapshotsPrecios(): Promise<SnapshotPrecios[]> {
  const snapshots = await prisma.snapshotPrecios.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return snapshots.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    createdAt: s.createdAt.toISOString(),
    cantidadItems: s._count.items,
  }));
}

export async function crearSnapshotPrecios(nombre: string) {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { success: false, error: "El nombre no puede estar vacío" };

  try {
    const [productos, descuentos] = await Promise.all([
      prisma.productosMaestros.findMany({
        where: { estado: "active" },
        distinct: ["mla"],
        select: { mla: true, nombre_publicacion: true, precio_venta_ml: true },
      }),
      prisma.mLDescuentos.findMany({ where: { seller_percentage: { gt: 0 } } }),
    ]);

    const productosMap = new Map(productos.map((p) => [p.mla, p]));

    const items = descuentos
      .filter((d) => productosMap.has(d.mla))
      .map((d) => {
        const producto = productosMap.get(d.mla)!;
        const precioPublicado = Number(producto.precio_venta_ml || 0);
        return {
          mla: d.mla,
          nombre: producto.nombre_publicacion || "Sin título",
          ajustePct: d.seller_percentage!,
          precioOriginal: Number(d.original_price) || precioPublicado,
          nuevoPrecio: Number(d.precio_final) || precioPublicado,
        };
      });

    if (items.length === 0) {
      return { success: false, error: "No hay publicaciones con descuento propio vigente para guardar" };
    }

    await prisma.snapshotPrecios.create({
      data: { nombre: nombreLimpio, items: { create: items } },
    });

    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al crear snapshot de precios:", error);
    return { success: false, error: "Error al guardar la foto" };
  }
}

export async function eliminarSnapshotPrecios(id: string) {
  try {
    await prisma.snapshotPrecios.delete({ where: { id } });
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar snapshot de precios:", error);
    return { success: false };
  }
}

export type ItemRestaurable = {
  item_id: string;
  nombre: string;
  ajuste_pct: number;
  precio_original: number;
  nuevo_precio: number;
  ganancia_pct: number | null;
};

export type ItemExcluido = {
  item_id: string;
  nombre: string;
  motivo: string;
};

export async function prepararRestauracionSnapshot(snapshotId: string): Promise<{
  success: boolean;
  restaurables: ItemRestaurable[];
  excluidos: ItemExcluido[];
}> {
  try {
    const snapshot = await prisma.snapshotPrecios.findUnique({
      where: { id: snapshotId },
      include: { items: true },
    });
    if (!snapshot) return { success: false, restaurables: [], excluidos: [] };

    const [productos, cargos, descuentosActuales, costosRaw] = await Promise.all([
      prisma.productosMaestros.findMany({ where: { estado: "active" }, distinct: ["mla"] }),
      prisma.mLFees.findMany(),
      prisma.mLDescuentos.findMany(),
      prisma.$queryRaw<any[]>`SELECT mla, variation_id, costo_total FROM vista_costos_productos`,
    ]);

    const productosMap = new Map(productos.map((p) => [p.mla, p]));
    const cargosMap = new Map(cargos.map((c) => [c.mla, c]));
    const descuentosMap = new Map(descuentosActuales.map((d) => [d.mla, d]));
    const costosMap = new Map(
      costosRaw.map((c) => [`${c.mla}-${c.variation_id || ""}`, Number(c.costo_total || 0)])
    );

    const restaurables: ItemRestaurable[] = [];
    const excluidos: ItemExcluido[] = [];

    for (const item of snapshot.items) {
      const producto = productosMap.get(item.mla);
      if (!producto) {
        excluidos.push({ item_id: item.mla, nombre: item.nombre, motivo: "La publicación ya no está activa" });
        continue;
      }

      const fee = cargosMap.get(item.mla);
      if (!fee) {
        excluidos.push({ item_id: item.mla, nombre: item.nombre, motivo: "Sin tarifas de ML cargadas" });
        continue;
      }

      const matchKey = `${item.mla}-${producto.variation_id || ""}`;
      const costo = costosMap.get(matchKey) || 0;
      if (costo <= 0) {
        excluidos.push({ item_id: item.mla, nombre: item.nombre, motivo: "Sin costo cargado" });
        continue;
      }

      const desc = descuentosMap.get(item.mla);
      const precioPublicado = Number(producto.precio_venta_ml || 0);
      const precioOriginalActual = Number(desc?.original_price || precioPublicado);
      const ajustePct = Number(item.ajustePct);

      const nuevoPrecio = redondear(precioOriginalActual * (1 - ajustePct / 100));
      const sellerPctReal = parseFloat(((1 - nuevoPrecio / precioOriginalActual) * 100).toFixed(2));

      const pctCargoVenta = Number(fee.cargo_venta_percent || 0);
      const cargoVenta = pctCargoVenta > 0
        ? (nuevoPrecio * pctCargoVenta) / 100
        : Number(fee.cargo_venta_fijo || 0);

      const pctCuotas = Number(fee.cuotas_percent || 0);
      const costoCuotas = pctCuotas > 0
        ? (nuevoPrecio * pctCuotas) / 100
        : Number(fee.cuotas_fijo || 0);

      const envio = Number(fee.envio_costo || 0);
      const costoFijoML = Number(fee.costo_fijo_ml || 0);
      const impuesto = nuevoPrecio * TAX_RATE_ML;

      const neto = nuevoPrecio - cargoVenta - costoCuotas - envio - costoFijoML - impuesto;
      const gananciaPct = costo > 0 ? ((neto - costo) / costo) * 100 : null;

      restaurables.push({
        item_id: item.mla,
        nombre: producto.nombre_publicacion || item.nombre,
        ajuste_pct: sellerPctReal,
        precio_original: precioOriginalActual,
        nuevo_precio: nuevoPrecio,
        ganancia_pct: gananciaPct != null ? parseFloat(gananciaPct.toFixed(1)) : null,
      });
    }

    return { success: true, restaurables, excluidos };
  } catch (error) {
    console.error("Error al preparar restauración de snapshot:", error);
    return { success: false, restaurables: [], excluidos: [] };
  }
}
