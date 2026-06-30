// Tipos y constantes compartidos del panel de Comparativa Mensual.
// Viven fuera del archivo "use server" porque los módulos server-action solo
// pueden exportar funciones async; cualquier constante/tipo se descarta en runtime.

// Canales canónicos del panel comparativo. El orden define el orden de apilado/leyenda.
export const CANALES = [
  "MercadoLibre",
  "Mostrador",
  "Instagram",
  "Mayorista",
] as const

export type Canal = (typeof CANALES)[number]

export interface MesComparativa {
  anio: number
  mes: number // 1-12
  /** "2024-03" — clave ordenable */
  clave: string
  /** etiqueta corta para gráficos: "mar 24" */
  label: string
  /** importe nominal por canal */
  canales: Record<Canal, number>
  total: number
  /** "historico" = sistema viejo (CSV) · "nuevo" = sistema actual (Venta) */
  origen: "historico" | "nuevo"
}
