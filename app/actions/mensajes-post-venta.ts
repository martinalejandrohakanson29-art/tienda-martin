"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface MensajePostVentaRule {
  id: string;
  titulo: string;
  idArticulo: string;
  nombreArticulo: string;
  mensaje: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MensajePostVentaLogItem {
  id: string;
  orderId: string;
  packId: string | null;
  shipmentId: string | null;
  buyerId: string | null;
  sellerId: string | null;
  idArticulo: string | null;
  mla: string | null;
  tipoLogistica: string | null;
  esFull: boolean;
  mensajeEnviado: string;
  reglaId: string | null;
  estado: string; // "enviado", "pendiente_entrega_full", "error", "ignorado"
  errorDetalle: string | null;
  createdAt: Date;
}

export async function getMensajesPostVentaRules(): Promise<{
  success: boolean;
  data: MensajePostVentaRule[];
  error?: string;
}> {
  try {
    const rules = await prisma.mlMensajePostVenta.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: rules };
  } catch (error: any) {
    console.error("Error al obtener reglas de mensajes post-venta:", error);
    return { success: false, data: [], error: error.message || "Error al cargar reglas" };
  }
}

export async function upsertMensajePostVentaRule(data: {
  id?: string;
  titulo: string;
  idArticulo: string;
  nombreArticulo: string;
  mensaje: string;
  activo?: boolean;
}): Promise<{ success: boolean; data?: MensajePostVentaRule; error?: string }> {
  try {
    const titulo = (data.titulo || "").trim();
    const idArticulo = (data.idArticulo || "").trim();
    const nombreArticulo = (data.nombreArticulo || "").trim();
    const mensaje = (data.mensaje || "").trim();

    if (!titulo) return { success: false, error: "El título de la regla es obligatorio." };
    if (!idArticulo) return { success: false, error: "Debe seleccionar un artículo." };
    if (!mensaje) return { success: false, error: "El contenido del mensaje no puede estar vacío." };

    let rule: MensajePostVentaRule;
    if (data.id) {
      rule = await prisma.mlMensajePostVenta.update({
        where: { id: data.id },
        data: {
          titulo,
          idArticulo,
          nombreArticulo: nombreArticulo || idArticulo,
          mensaje,
          activo: data.activo !== undefined ? data.activo : true,
        },
      });
    } else {
      rule = await prisma.mlMensajePostVenta.create({
        data: {
          titulo,
          idArticulo,
          nombreArticulo: nombreArticulo || idArticulo,
          mensaje,
          activo: data.activo !== undefined ? data.activo : true,
        },
      });
    }

    revalidatePath("/admin/mercadolibre/mensajes-post-venta");
    return { success: true, data: rule };
  } catch (error: any) {
    console.error("Error al guardar regla de mensaje post-venta:", error);
    return { success: false, error: error.message || "Error al guardar regla" };
  }
}

export async function toggleMensajePostVentaRule(
  id: string,
  activo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.mlMensajePostVenta.update({
      where: { id },
      data: { activo },
    });
    revalidatePath("/admin/mercadolibre/mensajes-post-venta");
    return { success: true };
  } catch (error: any) {
    console.error("Error al cambiar estado de regla post-venta:", error);
    return { success: false, error: error.message || "Error al actualizar estado" };
  }
}

export async function deleteMensajePostVentaRule(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.mlMensajePostVenta.delete({
      where: { id },
    });
    revalidatePath("/admin/mercadolibre/mensajes-post-venta");
    return { success: true };
  } catch (error: any) {
    console.error("Error al eliminar regla post-venta:", error);
    return { success: false, error: error.message || "Error al eliminar regla" };
  }
}

export async function getMensajesPostVentaLogs(
  limit = 50
): Promise<{ success: boolean; data: MensajePostVentaLogItem[]; error?: string }> {
  try {
    const logs = await prisma.mlMensajePostVentaLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { success: true, data: logs };
  } catch (error: any) {
    console.error("Error al obtener historial de mensajes post-venta:", error);
    return { success: false, data: [], error: error.message || "Error al cargar historial" };
  }
}
