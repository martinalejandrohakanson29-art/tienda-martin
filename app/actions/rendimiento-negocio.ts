"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Tipos
export type UnidadNegocio = "mostrador" | "mercadolibre" | "mayorista" | "instagram";

export interface RendimientoData {
  id: string;
  mes: number;
  anio: number;
  unidadNegocio: string;
  ventaTotal: number;
}

export interface GastoData {
  id: string;
  fecha: Date;
  mes: number;
  anio: number;
  categoria: string;
  descripcion: string | null;
  monto: number;
}

// =====================
// RENDIMIENTO DEL NEGOCIO
// =====================

// Obtener todos los rendimientos de un mes/año específico
export async function obtenerRendimientoPorMes(mes: number, anio: number) {
  try {
    const rendimientos = await prisma.rendimientoNegocio.findMany({
      where: { mes, anio },
      orderBy: { unidadNegocio: "asc" },
    });

    return rendimientos.map(r => ({
      ...r,
      ventaTotal: Number(r.ventaTotal),
    }));
  } catch (error) {
    console.error("Error al obtener rendimiento por mes:", error);
    return [];
  }
}

// Obtener todos los rendimientos agrupados por año
export async function obtenerTodosRendimientos() {
  try {
    const rendimientos = await prisma.rendimientoNegocio.findMany({
      orderBy: [{ anio: "desc" }, { mes: "desc" }, { unidadNegocio: "asc" }],
    });

    return rendimientos.map(r => ({
      ...r,
      ventaTotal: Number(r.ventaTotal),
    }));
  } catch (error) {
    console.error("Error al obtener todos los rendimientos:", error);
    return [];
  }
}

// Guardar o actualizar un rendimiento
export async function guardarRendimiento(data: {
  mes: number;
  anio: number;
  unidadNegocio: string;
  ventaTotal: number;
}) {
  try {
    const rendimiento = await prisma.rendimientoNegocio.upsert({
      where: {
        mes_anio_unidadNegocio: {
          mes: data.mes,
          anio: data.anio,
          unidadNegocio: data.unidadNegocio,
        },
      },
      update: {
        ventaTotal: data.ventaTotal,
      },
      create: {
        mes: data.mes,
        anio: data.anio,
        unidadNegocio: data.unidadNegocio,
        ventaTotal: data.ventaTotal,
      },
    });

    revalidatePath("/admin/mercadolibre/interna");
    return { success: true, data: rendimiento };
  } catch (error) {
    console.error("Error al guardar rendimiento:", error);
    return { success: false, error: "Error al guardar el rendimiento" };
  }
}

// Eliminar un rendimiento
export async function eliminarRendimiento(id: string) {
  try {
    await prisma.rendimientoNegocio.delete({
      where: { id },
    });

    revalidatePath("/admin/mercadolibre/interna");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar rendimiento:", error);
    return { success: false, error: "Error al eliminar el rendimiento" };
  }
}

// Obtener años disponibles
export async function obtenerAniosDisponibles() {
  try {
    const result = await prisma.rendimientoNegocio.findMany({
      select: { anio: true },
      distinct: ["anio"],
      orderBy: { anio: "desc" },
    });

    return result.map(r => r.anio);
  } catch (error) {
    console.error("Error al obtener años disponibles:", error);
    return [];
  }
}

// Obtener meses disponibles para un año
export async function obtenerMesesDisponibles(anio: number) {
  try {
    const result = await prisma.rendimientoNegocio.findMany({
      where: { anio },
      select: { mes: true },
      distinct: ["mes"],
      orderBy: { mes: "asc" },
    });

    return result.map(r => r.mes);
  } catch (error) {
    console.error("Error al obtener meses disponibles:", error);
    return [];
  }
}

// =====================
// GASTOS DEL NEGOCIO
// =====================

// Obtener gastos de un mes/año específico
export async function obtenerGastosPorMes(mes: number, anio: number) {
  try {
    const gastos = await prisma.gastoNegocio.findMany({
      where: { mes, anio },
      orderBy: { fecha: "desc" },
    });

    return gastos.map(g => ({
      ...g,
      monto: Number(g.monto),
    }));
  } catch (error) {
    console.error("Error al obtener gastos por mes:", error);
    return [];
  }
}

// Obtener todos los gastos
export async function obtenerTodosGastos() {
  try {
    const gastos = await prisma.gastoNegocio.findMany({
      orderBy: [{ anio: "desc" }, { mes: "desc" }, { fecha: "desc" }],
    });

    return gastos.map(g => ({
      ...g,
      monto: Number(g.monto),
    }));
  } catch (error) {
    console.error("Error al obtener todos los gastos:", error);
    return [];
  }
}

// Guardar un gasto
export async function guardarGasto(data: {
  categoria: string;
  descripcion?: string;
  monto: number;
  mes: number;
  anio: number;
}) {
  try {
    const gasto = await prisma.gastoNegocio.create({
      data: {
        categoria: data.categoria,
        descripcion: data.descripcion || null,
        monto: data.monto,
        mes: data.mes,
        anio: data.anio,
        fecha: new Date(),
      },
    });

    revalidatePath("/admin/mercadolibre/interna");
    return { success: true, data: gasto };
  } catch (error) {
    console.error("Error al guardar gasto:", error);
    return { success: false, error: "Error al guardar el gasto" };
  }
}

// Actualizar un gasto
export async function actualizarGasto(id: string, data: {
  categoria: string;
  descripcion?: string;
  monto: number;
  mes: number;
  anio: number;
}) {
  try {
    const gasto = await prisma.gastoNegocio.update({
      where: { id },
      data: {
        categoria: data.categoria,
        descripcion: data.descripcion || null,
        monto: data.monto,
        mes: data.mes,
        anio: data.anio,
      },
    });

    revalidatePath("/admin/mercadolibre/interna");
    return { success: true, data: gasto };
  } catch (error) {
    console.error("Error al actualizar gasto:", error);
    return { success: false, error: "Error al actualizar el gasto" };
  }
}

// Eliminar un gasto
export async function eliminarGasto(id: string) {
  try {
    await prisma.gastoNegocio.delete({
      where: { id },
    });

    revalidatePath("/admin/mercadolibre/interna");
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar gasto:", error);
    return { success: false, error: "Error al eliminar el gasto" };
  }
}

// Obtener años disponibles para gastos
export async function obtenerAniosGastos() {
  try {
    const result = await prisma.gastoNegocio.findMany({
      select: { anio: true },
      distinct: ["anio"],
      orderBy: { anio: "desc" },
    });

    return result.map(r => r.anio);
  } catch (error) {
    console.error("Error al obtener años de gastos:", error);
    return [];
  }
}

// Obtener meses disponibles para gastos en un año
export async function obtenerMesesGastos(anio: number) {
  try {
    const result = await prisma.gastoNegocio.findMany({
      where: { anio },
      select: { mes: true },
      distinct: ["mes"],
      orderBy: { mes: "asc" },
    });

    return result.map(r => r.mes);
  } catch (error) {
    console.error("Error al obtener meses de gastos:", error);
    return [];
  }
}
