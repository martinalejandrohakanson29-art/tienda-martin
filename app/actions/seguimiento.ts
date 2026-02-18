"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function guardarSeguimientoVentas(datos: any[]) {
  try {
    // 1. Limpiamos la tabla antes de guardar los nuevos resultados del análisis actual
    await prisma.seguimientoVentas.deleteMany({});

    // 2. Guardamos los nuevos datos de ventas y facturación
    await prisma.seguimientoVentas.createMany({
      data: datos.map(item => ({
        mla: item.mla,
        nombre: item.nombre,
        ventasActual: item.ventasActual || 0,
        ventasAnterior: item.ventasAnterior || 0,
        diffVentas: item.diffVentas || 0,
        netoActual: item.netoActual || 0,
        netoAnterior: item.netoAnterior || 0,
        growthNeto: item.growthNeto || 0,
        ultimaActualizacion: new Date()
      }))
    });

    revalidatePath("/admin/mercadolibre/seguimiento-ventas");
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar seguimiento de ventas:", error);
    return { success: false };
  }
}

export async function obtenerSeguimientoVentas() {
  try {
    return await prisma.seguimientoVentas.findMany({
      orderBy: { netoActual: 'desc' }
    });
  } catch (error) {
    console.error("Error al obtener datos de seguimiento:", error);
    return [];
  }
}
