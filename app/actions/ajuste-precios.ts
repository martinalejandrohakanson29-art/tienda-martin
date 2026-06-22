"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getReglasAjuste, type ReglaAjuste } from "./reglas-ajuste";

const WEBHOOK_DESCUENTO = "https://n8n.revolucionmotos.tech/webhook/ajuste-precios";
const WEBHOOK_SUBA = "https://n8n.revolucionmotos.tech/webhook/suba-precios";

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
  target: number; // fracción (ej. 0.65)
}): { sellerPct: number; nuevoPrecio: number } | null {
  const { precioOriginal, costo, cargoVentaPct, cuotasPct, envio, costoFijoML, meliPct, target } = params;

  if (precioOriginal <= 0 || costo <= 0) return null;

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

export type TipoAjuste = "DESCUENTO" | "SUBA";

export type AjustePrecio = {
  item_id: string;
  nombre: string;
  nombre_variante: string | null;
  tipo: TipoAjuste;
  regla_nombre: string;
  ganancia_actual: number;
  precio_original: number; // precio de lista actual (original_price)
  precio_actual_nuestro: number; // lo que cobramos hoy
  nuevo_precio: number; // DESCUENTO: deal_price; SUBA: nuevo precio de lista
  ajuste_pct: number; // DESCUENTO: % de descuento aplicado; SUBA: % de aumento
  tiene_campana_ml: boolean;
  es_manual?: boolean; // true cuando el ajuste lo carga el usuario a mano (no por regla)
};

// Devuelve la primera regla activa cuyas condiciones (AND) matcheen.
function matchRegla(reglas: ReglaAjuste[], ganancia: number, ventas: number): ReglaAjuste | null {
  for (const regla of reglas) {
    if (!regla.activa) continue;
    if (regla.margenMin != null && ganancia < regla.margenMin) continue;
    if (regla.margenMax != null && ganancia > regla.margenMax) continue;
    if (regla.ventasMin != null && ventas < regla.ventasMin) continue;
    if (regla.ventasMax != null && ventas > regla.ventasMax) continue;
    return regla;
  }
  return null;
}

export async function calcularAjustesRentabilidad(): Promise<{
  success: boolean;
  ajustes: AjustePrecio[];
}> {
  try {
    const reglas = (await getReglasAjuste())
      .filter((r) => r.activa)
      .sort((a, b) => a.prioridad - b.prioridad);

    if (reglas.length === 0) return { success: true, ajustes: [] };

    const productos = await prisma.productosMaestros.findMany({
      where: { estado: "active" },
      distinct: ["mla"],
      orderBy: [
        { mla: "asc" },
        { variation_id: { sort: "asc", nulls: "first" } },
      ],
    });

    const cargos = await prisma.mLFees.findMany();
    const cargosMap = new Map(cargos.map((c) => [c.mla, c]));

    const descuentos = await prisma.mLDescuentos.findMany();
    const descuentosMap = new Map(descuentos.map((d) => [d.mla, d]));

    const costosMla: any[] = await prisma.$queryRaw`
      SELECT mla, variation_id, costo_total FROM vista_costos_productos
    `;
    const costosMap = new Map(
      costosMla.map((c) => [`${c.mla}-${c.variation_id || ""}`, Number(c.costo_total || 0)])
    );

    // Ventas ML últimos 30 días por MLA (para condiciones de reglas por volumen)
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    hace30.setHours(0, 0, 0, 0);

    const pvML = await prisma.puntoVenta.findFirst({
      where: { nombre: { contains: "mercadolibre", mode: "insensitive" } },
      select: { id: true },
    });

    const ventasML = pvML
      ? await prisma.venta.groupBy({
          by: ["mlMla"],
          _count: { id: true },
          where: {
            puntoVentaId: pvML.id,
            mlMla: { not: "" },
            tipoVenta: { not: "PEDIDO" },
            createdAt: { gte: hace30, lte: hoy },
          },
        })
      : [];

    const ventasMLMap = new Map<string, number>();
    for (const v of ventasML) {
      if (v.mlMla) ventasMLMap.set(v.mlMla.trim(), v._count.id);
    }

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
      const ventas30d = ventasMLMap.get(p.mla.trim()) ?? 0;

      const regla = matchRegla(reglas, gananciaPct, ventas30d);
      if (!regla) continue;

      if (regla.tipo === "DESCUENTO") {
        const target = (regla.targetGanancia ?? 65) / 100;
        // Solo tiene sentido descontar si bajamos respecto a la ganancia actual
        if (gananciaPct <= (regla.targetGanancia ?? 65)) continue;

        const resultado = calcularNuevoPrecio({
          precioOriginal,
          costo,
          cargoVentaPct: pctCargoVenta,
          cuotasPct: pctCuotas,
          envio,
          costoFijoML,
          meliPct,
          target,
        });
        if (!resultado) continue;

        ajustes.push({
          item_id: p.mla,
          nombre: p.nombre_publicacion || "Sin título",
          nombre_variante: p.nombre_variante || null,
          tipo: "DESCUENTO",
          regla_nombre: regla.nombre,
          ganancia_actual: parseFloat(gananciaPct.toFixed(1)),
          precio_original: precioOriginal,
          precio_actual_nuestro: Math.round(precioFinalNuestro),
          nuevo_precio: resultado.nuevoPrecio,
          ajuste_pct: resultado.sellerPct,
          tiene_campana_ml: meliPct > 0,
        });
      } else {
        // SUBA: aumento fijo % sobre el precio de lista actual
        const pct = regla.subaPct ?? 0;
        if (pct <= 0) continue;
        const nuevoPrecio = redondear(precioOriginal * (1 + pct / 100));
        if (nuevoPrecio <= precioOriginal) continue;

        ajustes.push({
          item_id: p.mla,
          nombre: p.nombre_publicacion || "Sin título",
          nombre_variante: p.nombre_variante || null,
          tipo: "SUBA",
          regla_nombre: regla.nombre,
          ganancia_actual: parseFloat(gananciaPct.toFixed(1)),
          precio_original: precioOriginal,
          precio_actual_nuestro: Math.round(precioFinalNuestro),
          nuevo_precio: nuevoPrecio,
          ajuste_pct: parseFloat(pct.toFixed(2)),
          tiene_campana_ml: meliPct > 0,
        });
      }
    }

    // Ordenar: primero subas (margen bajo, más urgente), luego descuentos por ganancia desc
    ajustes.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === "SUBA" ? -1 : 1;
      return a.tipo === "SUBA"
        ? a.ganancia_actual - b.ganancia_actual
        : b.ganancia_actual - a.ganancia_actual;
    });

    return { success: true, ajustes };
  } catch (error) {
    console.error("Error al calcular ajustes:", error);
    return { success: false, ajustes: [] };
  }
}

export type AjusteEjecutar = {
  item_id: string;
  nuevo_precio: number;
  precio_original: number;
  tipo: TipoAjuste;
};

export async function ejecutarAjustesRentabilidad(ajustes: AjusteEjecutar[]) {
  try {
    const descuentos = ajustes
      .filter((a) => a.tipo === "DESCUENTO")
      .map((a) => ({ item_id: a.item_id, nuevo_precio: a.nuevo_precio, precio_original: a.precio_original }));

    const subas = ajustes
      .filter((a) => a.tipo === "SUBA")
      .map((a) => ({ item_id: a.item_id, nuevo_precio: a.nuevo_precio }));

    // fire-and-forget: n8n responde inmediatamente y procesa en background
    if (descuentos.length > 0) {
      fetch(WEBHOOK_DESCUENTO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: descuentos }),
        cache: "no-store",
      }).catch(() => {});
    }

    if (subas.length > 0) {
      fetch(WEBHOOK_SUBA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: subas }),
        cache: "no-store",
      }).catch(() => {});
    }

    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true, descuentos: descuentos.length, subas: subas.length };
  } catch (error) {
    console.error("Error al ejecutar ajustes:", error);
    return { success: false, descuentos: 0, subas: 0 };
  }
}
