// Redondea al múltiplo de 50 más cercano (precios más limpios en ML)
export function redondear(precio: number): number {
  return Math.round(precio / 50) * 50;
}
