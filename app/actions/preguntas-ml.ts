"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface AutoRespuestaConfig {
  id: string;
  habilitado: boolean;
  mensaje: string;
  usarHorario: boolean;
  horaInicioComercial: string;
  horaFinComercial: string;
  diasComerciales: string;
  updatedAt: Date;
}

export async function getAutoRespuestaConfig(): Promise<AutoRespuestaConfig> {
  let config = await prisma.mlAutoRespuesta.findFirst();
  if (!config) {
    config = await prisma.mlAutoRespuesta.create({ data: {} });
  }
  return config;
}

export async function updateAutoRespuestaConfig(data: {
  habilitado: boolean;
  mensaje: string;
  usarHorario: boolean;
  horaInicioComercial: string;
  horaFinComercial: string;
  diasComerciales: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await prisma.mlAutoRespuesta.findFirst();
    if (existing) {
      await prisma.mlAutoRespuesta.update({ where: { id: existing.id }, data });
    } else {
      await prisma.mlAutoRespuesta.create({ data });
    }
    revalidatePath("/admin/mercadolibre/preguntas");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
