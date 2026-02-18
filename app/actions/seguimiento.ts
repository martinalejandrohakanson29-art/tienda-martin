"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function guardarSeguimientoVentas(datos: any[]) {
  try {
    // 1. Limpiamos la tabla (Sobreescribir)
    // Usamos deleteMany sin filtros para borrar TODO
    await prisma.seguimientoVentas.deleteMany({});

    // 2. Insertamos los nuevos datos en bloque
    await prisma.seguimientoVentas.createMany({
      data: datos.map(item => ({
        mla: item.mla,
        nombre: item.nombre,
        ventasActual: item.ventasActual,
        ventasAnterior: item.ventasAnterior,
        diffVentas: item.diffVentas,
        visitasActual: item.visitasActual,
        visitasAnterior: item.visitasAnterior,
        diffVisitas: item.diffVisitas,
        growthVisitas: item.growthVisitas,
        netoActual: item.netoActual,
        netoAnterior: item.netoAnterior,
        growthNeto: item.growthNeto,
        ultimaActualizacion: new Date()
      }))
    });

    revalidatePath("/admin/mercadolibre/seguimiento-ventas");
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar seguimiento:", error);
    return { success: false, error: error.message };
  }
}
