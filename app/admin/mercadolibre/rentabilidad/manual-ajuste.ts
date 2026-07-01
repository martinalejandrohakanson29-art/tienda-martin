import type { AjustePrecio, TipoAjuste } from "@/app/actions/ajuste-precios";
import { redondear } from "@/lib/precios";
import type { ProductoRentabilidad } from "./rentabilidad-table";

export function crearAjusteManual(
  item: ProductoRentabilidad,
  pctNum: number,
  tipo: TipoAjuste
): AjustePrecio {
  const factor = tipo === "SUBA" ? 1 + pctNum / 100 : 1 - pctNum / 100;
  return {
    item_id: item.item_id,
    nombre: item.nombre,
    nombre_variante: item.nombre_variante,
    tipo,
    regla_nombre: "Manual",
    ganancia_actual: parseFloat((item.ganancia_porcentaje ?? 0).toFixed(1)),
    precio_original: Math.round(item.precio_original),
    precio_actual_nuestro: Math.round(item.precio_final_nuestro),
    nuevo_precio: redondear(item.precio_original * factor),
    ajuste_pct: parseFloat(pctNum.toFixed(2)),
    tiene_campana_ml: (item.desc_pct_ml ?? 0) > 0,
    es_manual: true,
  };
}
