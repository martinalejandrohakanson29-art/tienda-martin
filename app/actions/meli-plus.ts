"use server";

import { prisma } from "@/lib/prisma";
import { TAX_RATE_ML } from "@/lib/precios";

export interface CandidatoMeliPlus {
  item_id: string;
  variation_id: string | null;
  nombre: string;
  nombre_variante: string | null;
  costo_total: number;
  precio_actual: number;
  ganancia_actual: number;
  ganancia_actual_pct: number;
  precio_original: number;
  precio_sugerido: number;
  ganancia_sugerida: number;
  ganancia_sugerida_pct: number;
  precio_min_descuento: number; // mayor % de descuento permitido (min_discounted_price)
  ganancia_min_descuento: number;
  ganancia_min_descuento_pct: number;
  start_date: string | null;
  finish_date: string | null;
}

// Simula, sin tocar ml_fees/ml_descuentos reales, qué pasaría con la rentabilidad
// de cada publicación si se aplicara la campaña "CAMPAÑA MELI +" (type: DEAL en
// /seller-promotions). A diferencia de SMART, esta campaña es 100% financiada por
// el vendedor (no trae seller_percentage/meli_percentage), por eso acá el precio
// final ML = precio final nuestro directamente.
export async function getMeliPlusData(): Promise<CandidatoMeliPlus[]> {
  try {
    const candidatos = await prisma.mLMeliPlus.findMany();
    if (candidatos.length === 0) return [];

    const mlas = candidatos.map((c) => c.mla);

    const productos = await prisma.productosMaestros.findMany({
      where: { mla: { in: mlas }, estado: "active" },
      distinct: ["mla"],
      orderBy: [{ mla: "asc" }, { variation_id: { sort: "asc", nulls: "first" } }],
    });

    const fees = await prisma.mLFees.findMany({ where: { mla: { in: mlas } } });
    const feesMap = new Map(fees.map((f) => [f.mla, f]));

    const costos: any[] = await prisma.$queryRaw`
      SELECT mla, variation_id, costo_total
      FROM vista_costos_productos
      WHERE mla = ANY(${mlas})
    `;
    const costosMap = new Map(
      costos.map((c) => [`${c.mla}-${c.variation_id || ""}`, Number(c.costo_total || 0)])
    );

    const candidatosMap = new Map(candidatos.map((c) => [c.mla, c]));

    function calcular(precioFinalML: number, fee: (typeof fees)[number] | undefined) {
      const pctCargoVenta = Number(fee?.cargo_venta_percent || 0);
      const cargoVenta =
        pctCargoVenta > 0 ? (precioFinalML * pctCargoVenta) / 100 : Number(fee?.cargo_venta_fijo || 0);

      const pctCuotas = Number(fee?.cuotas_percent || 0);
      const costoCuotas = pctCuotas > 0 ? (precioFinalML * pctCuotas) / 100 : Number(fee?.cuotas_fijo || 0);

      const envio = Number(fee?.envio_costo || 0);
      const costoFijoML = Number(fee?.costo_fijo_ml || 0);
      const impuesto = precioFinalML * TAX_RATE_ML;

      const netoTeorico = precioFinalML - cargoVenta - costoCuotas - envio - costoFijoML - impuesto;
      return netoTeorico;
    }

    const out: CandidatoMeliPlus[] = [];
    for (const p of productos) {
      const candidato = candidatosMap.get(p.mla);
      if (!candidato) continue;

      const matchKey = `${p.mla}-${p.variation_id || ""}`;
      const costoPropio = costosMap.get(matchKey) || 0;
      if (costoPropio <= 0) continue; // sin costo cargado, no se puede evaluar

      const fee = feesMap.get(p.mla);
      const precioActual = Number(p.precio_venta_ml || 0);
      const precioOriginal = Number(candidato.original_price || precioActual);
      const precioSugerido = Number(candidato.suggested_discounted_price || 0);
      const precioMinDescuento = Number(candidato.min_discounted_price || 0);

      const netoActual = calcular(precioActual, fee);
      const netoSugerido = calcular(precioSugerido, fee);
      const netoMinDescuento = calcular(precioMinDescuento, fee);

      const gananciaActual = netoActual - costoPropio;
      const gananciaSugerida = netoSugerido - costoPropio;
      const gananciaMinDescuento = netoMinDescuento - costoPropio;

      out.push({
        item_id: p.mla,
        variation_id: p.variation_id,
        nombre: p.nombre_publicacion || "Sin título",
        nombre_variante: p.nombre_variante,
        costo_total: costoPropio,
        precio_actual: precioActual,
        ganancia_actual: gananciaActual,
        ganancia_actual_pct: costoPropio > 0 ? (gananciaActual / costoPropio) * 100 : 0,
        precio_original: precioOriginal,
        precio_sugerido: precioSugerido,
        ganancia_sugerida: gananciaSugerida,
        ganancia_sugerida_pct: costoPropio > 0 ? (gananciaSugerida / costoPropio) * 100 : 0,
        precio_min_descuento: precioMinDescuento,
        ganancia_min_descuento: gananciaMinDescuento,
        ganancia_min_descuento_pct: costoPropio > 0 ? (gananciaMinDescuento / costoPropio) * 100 : 0,
        start_date: candidato.start_date ? candidato.start_date.toISOString() : null,
        finish_date: candidato.finish_date ? candidato.finish_date.toISOString() : null,
      });
    }

    return out.sort((a, b) => a.ganancia_sugerida_pct - b.ganancia_sugerida_pct);
  } catch (error) {
    console.error("Error al obtener candidatos Meli+:", error);
    return [];
  }
}
