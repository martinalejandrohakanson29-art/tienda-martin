// app/actions/ml-maestros.ts
"use server";

import { prisma } from "@/lib/prisma"; //
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
    const cleanVarName = nombre_variante?.trim() || null;
    const cleanVarId = variation_id?.trim() || null;

    // 3. Lógica CORREGIDA: Check-then-Act
    // En lugar de upsert, buscamos primero usando findFirst (que sí acepta nulls en la búsqueda)
    const existingProduct = await prisma.productosMaestros.findFirst({
      where: {
        mla: cleanMla,
        variation_id: cleanVarId
      }
    });

    if (existingProduct) {
      // SI EXISTE: Actualizamos usando su ID único interno (esto nunca falla)
      await prisma.productosMaestros.update({
        where: { id: existingProduct.id },
        data: {
          nombre_publicacion: cleanTitle,
          nombre_variante: cleanVarName,
          estado: "active",
          ultima_actualizacion: new Date()
        }
      });
    } else {
      // NO EXISTE: Creamos
      await prisma.productosMaestros.create({
        data: {
          mla: cleanMla,
          nombre_publicacion: cleanTitle,
          nombre_variante: cleanVarName,
          variation_id: cleanVarId,
          estado: "active",
          link_publicacion: `https://articulo.mercadolibre.com.ar/${cleanMla}`
        }
      });
    }

    // 4. Revalidamos para que aparezca en todas las tablas
    revalidatePath("/admin/mercadolibre/composicion");
    revalidatePath("/admin/mercadolibre/costos");

    return { success: true };
  } catch (error: any) {
    console.error("Error al crear producto maestro:", error);
    return { success: false, error: "Error de base de datos: " + error.message };
  }
}
