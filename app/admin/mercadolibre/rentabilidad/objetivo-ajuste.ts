import type { AjustePrecio } from "@/app/actions/ajuste-precios";
import { redondear, redondearDescuento, pctDescuento, TAX_RATE_ML } from "@/lib/precios";
import type { ProductoRentabilidad } from "./rentabilidad-table";

// Límites que exige la API de ML para promociones PRICE_DISCOUNT.
const PCT_DESCUENTO_MIN = 5;
const PCT_DESCUENTO_MAX = 80;

export type ModoBaja = "DESCUENTO" | "PRECIO";

export type ResultadoObjetivo =
  | { ajuste: AjustePrecio; motivo?: undefined }
  | { ajuste: null; motivo: string };

// Lleva un artículo a una ganancia % objetivo, subiendo o bajando el precio
// según corresponda. Si necesita subir, siempre modifica el precio de lista
// real (ML no tiene "promoción" que suba precio). Si necesita bajar, respeta
// el modo elegido: promoción PRICE_DISCOUNT (5%-80%, precio de lista intacto)
// o modificación directa del precio de lista.
// Misma derivación que calcularNuevoPrecio en app/actions/ajuste-precios.ts,
// generalizada para permitir precio objetivo directo (sube o baja) además del
// descuento vía promoción.
export function crearAjusteObjetivo(
  item: ProductoRentabilidad,
  targetPct: number,
  modoBaja: ModoBaja
): ResultadoObjetivo {
  if (item.precio_original <= 0 || item.costo_total <= 0) {
    return { ajuste: null, motivo: "Sin costo o precio cargado" };
  }

  const gananciaActual = item.ganancia_porcentaje;
  if (Math.abs(gananciaActual - targetPct) < 0.1) {
    return { ajuste: null, motivo: "Ya está en el objetivo" };
  }

  const necesitaSubir = gananciaActual < targetPct;
  const target = targetPct / 100;

  // Tasa combinada de comisión ML (ya incluye cuotas) + impuesto, sobre precio público.
  const feeRate = item.precio_final > 0 ? item.cargo_venta_real / item.precio_final : 0;
  const r = feeRate + TAX_RATE_ML;

  // % que ya aporta una campaña propia de ML (independiente de nuestro descuento manual).
  const descNuestroReal = (1 - item.precio_final_nuestro / item.precio_original) * 100;
  const m = Math.max(0, item.desc_pct_total - descNuestroReal) / 100;

  const K = (1 + target) * item.costo_total + item.envio_costo + item.costo_fijo_ml;

  const base = {
    item_id: item.item_id,
    nombre: item.nombre,
    nombre_variante: item.nombre_variante,
    regla_nombre: "Objetivo",
    ganancia_actual: parseFloat(gananciaActual.toFixed(1)),
    precio_original: Math.round(item.precio_original),
    precio_actual_nuestro: Math.round(item.precio_final_nuestro),
    tiene_campana_ml: item.desc_pct_total > 0,
    es_manual: true as const,
  };

  if (necesitaSubir || modoBaja === "PRECIO") {
    const denom = 1 - (1 - m) * r;
    if (denom <= 0) return { ajuste: null, motivo: "No alcanzable con este costo/comisión" };

    const nuevoPrecio = redondear(K / denom);
    if (nuevoPrecio <= 0) return { ajuste: null, motivo: "No alcanzable" };
    if (nuevoPrecio === base.precio_original) {
      return { ajuste: null, motivo: "Ya está en el objetivo" };
    }

    return {
      ajuste: {
        ...base,
        tipo: "SUBA",
        nuevo_precio: nuevoPrecio,
        ajuste_pct: parseFloat(
          (((nuevoPrecio - item.precio_original) / item.precio_original) * 100).toFixed(2)
        ),
      },
    };
  }

  // Bajar vía promoción ML: descuento propio sobre precio_original.
  const denomX = item.precio_original * (1 - r);
  if (denomX <= 0) return { ajuste: null, motivo: "No alcanzable con este costo/comisión" };

  const xCalculado = (item.precio_original * (1 - r * (1 - m)) - K) / denomX;
  if (xCalculado >= PCT_DESCUENTO_MAX / 100) {
    return {
      ajuste: null,
      motivo: `Requiere más de ${PCT_DESCUENTO_MAX}% de descuento — probá "modificar precio"`,
    };
  }
  if (xCalculado <= 0) {
    return { ajuste: null, motivo: "Ya está en el objetivo" };
  }

  // Igual que en el motor de reglas: si el cálculo da menos del mínimo que
  // exige ML, se aplica el piso de 5% (la ganancia resultante queda un poco
  // por debajo del objetivo, pero es un descuento válido).
  const x = Math.max(xCalculado, PCT_DESCUENTO_MIN / 100);
  const nuevoPrecio = redondearDescuento(item.precio_original, item.precio_original * (1 - x), PCT_DESCUENTO_MIN);
  const sellerPct = parseFloat(pctDescuento(item.precio_original, nuevoPrecio).toFixed(2));

  return {
    ajuste: {
      ...base,
      tipo: "DESCUENTO",
      nuevo_precio: nuevoPrecio,
      ajuste_pct: sellerPct,
    },
  };
}
