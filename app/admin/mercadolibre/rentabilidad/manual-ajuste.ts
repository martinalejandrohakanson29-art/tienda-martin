import type { AjustePrecio, TipoAjuste } from "@/app/actions/ajuste-precios";
import { redondear, redondearDescuento, pctDescuento } from "@/lib/precios";
import type { ProductoRentabilidad } from "./rentabilidad-table";

// Límites que exige la API de ML para promociones PRICE_DISCOUNT.
const PCT_DESCUENTO_MIN = 5;
const PCT_DESCUENTO_MAX = 80;

export function crearAjusteManual(
  item: ProductoRentabilidad,
  pctNum: number,
  tipo: TipoAjuste
): AjustePrecio {
  if (tipo === "DESCUENTO" && (pctNum <= PCT_DESCUENTO_MIN || pctNum >= PCT_DESCUENTO_MAX)) {
    throw new Error(
      `ML exige un descuento mayor a ${PCT_DESCUENTO_MIN}% y menor a ${PCT_DESCUENTO_MAX}%.`
    );
  }

  const factor = tipo === "SUBA" ? 1 + pctNum / 100 : 1 - pctNum / 100;
  const precioCrudo = item.precio_original * factor;
  // En descuentos, redondeo "seguro" para que el % final (después de
  // redondear a $50) no quede en el límite que rechaza ML.
  const nuevoPrecio =
    tipo === "DESCUENTO"
      ? redondearDescuento(item.precio_original, precioCrudo, PCT_DESCUENTO_MIN)
      : redondear(precioCrudo);

  return {
    item_id: item.item_id,
    nombre: item.nombre,
    nombre_variante: item.nombre_variante,
    tipo,
    regla_nombre: "Manual",
    ganancia_actual: parseFloat((item.ganancia_porcentaje ?? 0).toFixed(1)),
    precio_original: Math.round(item.precio_original),
    precio_actual_nuestro: Math.round(item.precio_final_nuestro),
    nuevo_precio: nuevoPrecio,
    ajuste_pct:
      tipo === "DESCUENTO"
        ? parseFloat(pctDescuento(item.precio_original, nuevoPrecio).toFixed(2))
        : parseFloat(pctNum.toFixed(2)),
    tiene_campana_ml: (item.desc_pct_ml ?? 0) > 0,
    es_manual: true,
  };
}
