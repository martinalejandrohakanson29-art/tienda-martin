"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function guardarSeguimientoVentas(datos: any[]) {
  try {
    // Borramos lo anterior para sobreescribir con la nueva consulta
    await prisma.seguimientoVentas.deleteMany({});

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
    console.error("Error al guardar:", error);
    return { success: false };
  }
}

// Función para traer los datos ordenados por facturación neta
export async function obtenerSeguimientoVentas() {
  try {
    return await prisma.seguimientoVentas.findMany({
      orderBy: { netoActual: 'desc' }
    });
  } catch (error) {
    console.error("Error al obtener datos:", error);
    return [];
  }
}
