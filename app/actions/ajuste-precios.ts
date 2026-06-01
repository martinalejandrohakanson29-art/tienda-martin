"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const TARGET_GANANCIA = 65;
const THRESHOLD_GANANCIA = 70;
const WEBHOOK_AJUSTE = "https://n8n.revolucionmotos.tech/webhook/ajuste-precios";

// Redondea al múltiplo de 50 más cercano (precios más limpios en ML)
function redondear(precio: number): number {
  return Math.round(precio / 50) * 50;
}

// Fórmula inversa: calcula el descuento propio (seller_pct) que lleva la ganancia al target%.
// Derivación:
//   neto = precioOriginal*(1-x) - precioOriginal*(1-x-m)*r - envio - costoFijo
//   ganancia/costo = target  →  neto = (1+target)*costo + envio + costoFijo
//   despejando x: x = [p*(1 - r*(1-m)) - K] / [p*(1-r)]
//   donde K = (1+target)*costo + envio + costoFijo,  r = tarifa total,  m = meli_pct
function calcularNuevoPrecio(params: {
  precioOriginal: number;
  costo: number;
  cargoVentaPct: number;
  cuotasPct: number;
  envio: number;
  costoFijoML: number;
  meliPct: number;
}): { sellerPct: number; nuevoPrecio: number } | null {
  const { precioOriginal, costo, cargoVentaPct, cuotasPct, envio, costoFijoML, meliPct } = params;

  if (precioOriginal <= 0 || costo <= 0) return null;

  const target = TARGET_GANANCIA / 100;
  const r = (cargoVentaPct + cuotasPct) / 100;
  const m = meliPct / 100;
  const K = (1 + target) * costo + envio + costoFijoML;

  const denominador = precioOriginal * (1 - r);
  if (denominador <= 0) return null;

  const x = (precioOriginal * (1 - r * (1 - m)) - K) / denominador;
  // ML exige descuento entre 5% y 80%
  if (x < 0.05 || x >= 0.8) return null;

  const nuevoPrecio = redondear(precioOriginal * (1 - x));
  // Recalcular seller_pct real después del redondeo
  const sellerPct = parseFloat(((1 - nuevoPrecio / precioOriginal) * 100).toFixed(2));

  return { sellerPct, nuevoPrecio };
}

export type AjustePrecio = {
  item_id: string;
  nombre: string;
  nombre_variante: string | null;
  ganancia_actual: number;
  precio_original: number;
  precio_actual_nuestro: number;
  nuevo_precio: number;
  nuevo_seller_pct: number;
  tiene_campana_ml: boolean;
};

export async function calcularAjustesRentabilidad(): Promise<{
  success: boolean;
  ajustes: AjustePrecio[];
}> {
  try {
    const productos = await prisma.productosMaestros.findMany({
      where: { estado: "active" },
      distinct: ["mla"],
      orderBy: [
        { mla: "asc" },
        { variation_id: { sort: "asc", nulls: "first" } },
      ],
    });

    const cargos = await prisma.mLFees.findMany();
    const cargosMap = new Map(cargos.map(c => [c.mla, c]));

    const descuentos = await prisma.mLDescuentos.findMany();
    const descuentosMap = new Map(descuentos.map(d => [d.mla, d]));

    const costosMla: any[] = await prisma.$queryRaw`
      SELECT mla, variation_id, costo_total FROM vista_costos_productos
    `;
    const costosMap = new Map(
      costosMla.map(c => [`${c.mla}-${c.variation_id || ""}`, Number(c.costo_total || 0)])
    );

    const ajustes: AjustePrecio[] = [];

    for (const p of productos) {
      const fee = cargosMap.get(p.mla);
      const desc = descuentosMap.get(p.mla);
      const matchKey = `${p.mla}-${p.variation_id || ""}`;
      const costo = costosMap.get(matchKey) || 0;

      if (costo <= 0 || !fee) continue;

      const precioPublicado = Number(p.precio_venta_ml || 0);
      const precioOriginal = Number(desc?.original_price || precioPublicado);
      const precioFinalML = Number(desc?.precio_final || precioPublicado);
      const pctVendedor = Number(desc?.seller_percentage || 0);
      const meliPct = Number(desc?.meli_percentage || 0);

      const pctCargoVenta = Number(fee.cargo_venta_percent || 0);
      const cargoVenta = pctCargoVenta > 0
        ? (precioFinalML * pctCargoVenta) / 100
        : Number(fee.cargo_venta_fijo || 0);

      const pctCuotas = Number(fee.cuotas_percent || 0);
      const costoCuotas = pctCuotas > 0
        ? (precioFinalML * pctCuotas) / 100
        : Number(fee.cuotas_fijo || 0);

      const envio = Number(fee.envio_costo || 0);
      const costoFijoML = Number(fee.costo_fijo_ml || 0);

      const precioFinalNuestro = precioOriginal * (1 - pctVendedor / 100);
      const neto = precioFinalNuestro - cargoVenta - costoCuotas - envio - costoFijoML;
      const gananciaPct = ((neto - costo) / costo) * 100;

      if (gananciaPct <= THRESHOLD_GANANCIA) continue;

      const resultado = calcularNuevoPrecio({
        precioOriginal,
        costo,
        cargoVentaPct: pctCargoVenta,
        cuotasPct: pctCuotas,
        envio,
        costoFijoML,
        meliPct,
      });

      if (!resultado) continue;

      ajustes.push({
        item_id: p.mla,
        nombre: p.nombre_publicacion || "Sin título",
        nombre_variante: p.nombre_variante || null,
        ganancia_actual: parseFloat(gananciaPct.toFixed(1)),
        precio_original: precioOriginal,
        precio_actual_nuestro: Math.round(precioFinalNuestro),
        nuevo_precio: resultado.nuevoPrecio,
        nuevo_seller_pct: resultado.sellerPct,
        tiene_campana_ml: meliPct > 0,
      });
    }

    ajustes.sort((a, b) => b.ganancia_actual - a.ganancia_actual);
    return { success: true, ajustes };
  } catch (error) {
    console.error("Error al calcular ajustes:", error);
    return { success: false, ajustes: [] };
  }
}

export async function ejecutarAjustesRentabilidad(
  ajustes: { item_id: string; nuevo_precio: number; precio_original: number }[]
) {
  try {
    const res = await fetch(WEBHOOK_AJUSTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: ajustes }),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`n8n error: ${res.status}`);
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al ejecutar ajustes:", error);
    return { success: false };
  }
}
