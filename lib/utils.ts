import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 👇 Esta es la nueva función para dar formato a los precios
export function formatPrice(price: number | string) {
  return "$" + Number(price).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

// Mismos umbrales que /admin/mercadolibre/rentabilidad para colorear "Ganancia %"
export function getGananciaPctStyle(pct: number) {
  if (pct <= 40) return "text-red-600 font-black"
  if (pct <= 50) return "text-amber-500 font-black"
  if (pct <= 60) return "text-green-600 font-black"
  return "text-[#d413c3] font-black"
}
