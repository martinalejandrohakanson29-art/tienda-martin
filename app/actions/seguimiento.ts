"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function guardarSeguimientoVentas(datos: any[]) {
  try {
    // 1. Limpiamos los datos del análisis anterior
    await prisma.seguimientoVentas.deleteMany({});

    // 2. Guardamos la nueva comparativa
    // Usamos una transacción para asegurar que la limpieza y el guardado sean atómicos
    await prisma.$transaction(
      datos.map(item => prisma.seguimientoVentas.create({
        data: {
          mla: item.mla,
          nombre: item.nombre,
          ventasActual: item.ventasActual || 0,
          ventasAnterior: item.ventasAnterior || 0,
          diffVentas: item.diffVentas || 0,
          netoActual: item.netoActual || 0,
          netoAnterior: item.netoAnterior || 0,
          growthNeto: item.growthNeto || 0,
          ultimaActualizacion: new Date()
        }
      }))
    );

    revalidatePath("/admin/mercadolibre/seguimiento-ventas");
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar datos de ventas:", error);
    return { success: false, error: error.message };
  }
}

export async function obtenerSeguimientoVentas() {
  try {
    const data = await prisma.seguimientoVentas.findMany({
      orderBy: { netoActual: 'desc' }
    });
    // Convertimos Decimal a Number para evitar problemas de serialización en el cliente
    return data.map(item => ({
      ...item,
      netoActual: Number(item.netoActual),
      netoAnterior: Number(item.netoAnterior),
      growthNeto: Number(item.growthNeto)
    }));
  } catch (error) {
    console.error("Error al recuperar datos de ventas:", error);
    return [];
  }
}
