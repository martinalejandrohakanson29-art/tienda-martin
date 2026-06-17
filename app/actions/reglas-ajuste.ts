"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type TipoRegla = "DESCUENTO" | "SUBA";

export type ReglaAjuste = {
  id: string;
  nombre: string;
  prioridad: number;
  activa: boolean;
  tipo: TipoRegla;
  margenMin: number | null;
  margenMax: number | null;
  ventasMin: number | null;
  ventasMax: number | null;
  targetGanancia: number | null;
  subaPct: number | null;
};

export type ReglaInput = {
  nombre: string;
  tipo: TipoRegla;
  prioridad?: number;
  activa?: boolean;
  margenMin?: number | null;
  margenMax?: number | null;
  ventasMin?: number | null;
  ventasMax?: number | null;
  targetGanancia?: number | null;
  subaPct?: number | null;
};

function serialize(r: any): ReglaAjuste {
  return {
    id: r.id,
    nombre: r.nombre,
    prioridad: r.prioridad,
    activa: r.activa,
    tipo: r.tipo as TipoRegla,
    margenMin: r.margenMin != null ? Number(r.margenMin) : null,
    margenMax: r.margenMax != null ? Number(r.margenMax) : null,
    ventasMin: r.ventasMin ?? null,
    ventasMax: r.ventasMax ?? null,
    targetGanancia: r.targetGanancia != null ? Number(r.targetGanancia) : null,
    subaPct: r.subaPct != null ? Number(r.subaPct) : null,
  };
}

// Si no hay ninguna regla cargada, siembra la regla equivalente al comportamiento
// histórico (descontar publicaciones con ganancia > 70% hasta dejarlas en 65%).
// Así la sección sigue sugiriendo lo mismo que antes hasta que el usuario configure.
export async function ensureDefaultRules(): Promise<void> {
  const count = await prisma.reglaAjustePrecio.count();
  if (count > 0) return;
  await prisma.reglaAjustePrecio.create({
    data: {
      nombre: "Descuento ganancia alta",
      prioridad: 10,
      activa: true,
      tipo: "DESCUENTO",
      margenMin: 70,
      targetGanancia: 65,
    },
  });
}

export async function getReglasAjuste(): Promise<ReglaAjuste[]> {
  await ensureDefaultRules();
  const reglas = await prisma.reglaAjustePrecio.findMany({
    orderBy: [{ prioridad: "asc" }, { createdAt: "asc" }],
  });
  return reglas.map(serialize);
}

function normalize(input: ReglaInput) {
  const num = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? null : v;
  const int = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v);

  return {
    nombre: input.nombre.trim() || "Regla sin nombre",
    tipo: input.tipo,
    prioridad: input.prioridad ?? 100,
    activa: input.activa ?? true,
    margenMin: num(input.margenMin),
    margenMax: num(input.margenMax),
    ventasMin: int(input.ventasMin),
    ventasMax: int(input.ventasMax),
    // Solo persistir el campo de acción que corresponde al tipo
    targetGanancia: input.tipo === "DESCUENTO" ? num(input.targetGanancia) : null,
    subaPct: input.tipo === "SUBA" ? num(input.subaPct) : null,
  };
}

export async function crearReglaAjuste(input: ReglaInput) {
  try {
    await prisma.reglaAjustePrecio.create({ data: normalize(input) });
    revalidatePath("/admin/mercadolibre/rentabilidad/reglas");
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al crear regla:", error);
    return { success: false };
  }
}

export async function actualizarReglaAjuste(id: string, input: ReglaInput) {
  try {
    await prisma.reglaAjustePrecio.update({ where: { id }, data: normalize(input) });
    revalidatePath("/admin/mercadolibre/rentabilidad/reglas");
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar regla:", error);
    return { success: false };
  }
}

export async function toggleReglaAjuste(id: string, activa: boolean) {
  try {
    await prisma.reglaAjustePrecio.update({ where: { id }, data: { activa } });
    revalidatePath("/admin/mercadolibre/rentabilidad/reglas");
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al cambiar estado de regla:", error);
    return { success: false };
  }
}

export async function eliminarReglaAjuste(id: string) {
  try {
    await prisma.reglaAjustePrecio.delete({ where: { id } });
    revalidatePath("/admin/mercadolibre/rentabilidad/reglas");
    revalidatePath("/admin/mercadolibre/rentabilidad");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar regla:", error);
    return { success: false };
  }
}
