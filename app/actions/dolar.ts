"use server"

import { requireAdmin } from "@/lib/auth-guard";
import { getCotizacionDolarVenta } from "@/lib/dolar";

export async function obtenerCotizacionDolar() {
  await requireAdmin();
  const cot = await getCotizacionDolarVenta();
  if (!cot) return { success: false as const, error: "No se pudo obtener la cotización del dólar." };
  return { success: true as const, valor: cot.valor, fecha: cot.fecha };
}
