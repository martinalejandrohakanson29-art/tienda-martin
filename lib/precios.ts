// Impuesto/retención (IIBB, etc.) que se descuenta sobre el precio público en
// cada venta de ML. Debe aplicarse en todo cálculo de ganancia neta y en el
// solver de precio objetivo para que coincidan entre sí (ver rentabilidad-table).
export const TAX_RATE_ML = 0.02;

// Redondea al múltiplo de 50 más cercano (precios más limpios en ML)
export function redondear(precio: number): number {
  return Math.round(precio / 50) * 50;
}

// % de descuento real entre precio original y precio final (positivo = baja)
export function pctDescuento(precioOriginal: number, precioFinal: number): number {
  return ((precioOriginal - precioFinal) / precioOriginal) * 100;
}

// Redondea el precio de un descuento garantizando que el % final quede
// estrictamente por encima del mínimo que exige ML (debe ser MAYOR a 5%,
// no igual). El redondeo a múltiplos de $50 puede subir el precio final y
// tirar el descuento justo por debajo del límite, lo que ML rechaza con
// el error MINIMUM_DISCOUNT_PERCENT aunque el cálculo original diera 5% o más.
export function redondearDescuento(
  precioOriginal: number,
  precioCrudo: number,
  pctMinimo = 5
): number {
  let precio = redondear(precioCrudo);
  while (precio > 0 && pctDescuento(precioOriginal, precio) <= pctMinimo) {
    precio -= 50;
  }
  return precio;
}
