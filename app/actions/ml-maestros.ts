// app/actions/ml-maestros.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createManualProduct(data: {
  mla: string;
  titulo: string;
  nombre_variante?: string;
  variation_id?: string;
}) {
  try {
    const { mla, titulo, nombre_variante, variation_id } = data;

    // 1. Validaciones básicas
    if (!mla || !titulo) {
      return { success: false, error: "El MLA y el Título son obligatorios." };
    }

    // 2. Preparamos los datos (limpieza)
    const cleanMla = mla.trim().toUpperCase();
    const cleanTitle = titulo.trim();
    // Si no hay variante, usamos null para respetar la unicidad de la base de datos
    const cleanVarName = nombre_variante?.trim() || null;
    const cleanVarId = variation_id?.trim() || null;

    // 3. Insertamos en ProductosMaestros
    // Usamos upsert por si ya existe, para actualizar el título
    await prisma.productosMaestros.upsert({
      where: {
        unique_mla_variation: {
          mla: cleanMla,
          variation_id: cleanVarId // Prisma maneja el null correctamente aquí
        }
      },
      update: {
        nombre_publicacion: cleanTitle,
        nombre_variante: cleanVarName,
        estado: "active", // Lo activamos por defecto
        ultima_actualizacion: new Date()
      },
      create: {
        mla: cleanMla,
        nombre_publicacion: cleanTitle,
        nombre_variante: cleanVarName,
        variation_id: cleanVarId,
        estado: "active",
        link_publicacion: `https://articulo.mercadolibre.com.ar/${cleanMla}`
      }
    });

    // 4. Revalidamos para que aparezca en todas las tablas
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");

    return { success: true };
  } catch (error: any) {
    console.error("Error al crear producto maestro:", error);
    return { success: false, error: "Error de base de datos: " + error.message };
  }
}
