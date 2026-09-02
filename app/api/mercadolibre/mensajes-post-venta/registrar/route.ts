import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const logId = body.log_id || body.logId ? String(body.log_id || body.logId).trim() : null;
    const orderId = String(body.order_id || body.orderId || "").trim();
    const packId = body.pack_id || body.packId ? String(body.pack_id || body.packId).trim() : null;
    const shipmentId = body.shipment_id || body.shipmentId ? String(body.shipment_id || body.shipmentId).trim() : null;
    const buyerId = body.buyer_id || body.buyerId ? String(body.buyer_id || body.buyerId).trim() : null;
    const sellerId = body.seller_id || body.sellerId ? String(body.seller_id || body.sellerId).trim() : null;
    const idArticulo = body.id_articulo || body.idArticulo ? String(body.id_articulo || body.idArticulo).trim() : null;
    const mla = body.mla ? String(body.mla).trim() : null;
    const tipoLogistica = body.tipo_logistica || body.tipoLogistica ? String(body.tipo_logistica || body.tipoLogistica).trim() : null;
    const esFull = body.es_full === true || body.esFull === true || tipoLogistica === "fulfillment";
    const mensajeEnviado = String(body.mensaje || body.mensaje_enviado || body.mensajeEnviado || "").trim();
    const reglaId = body.regla_id || body.reglaId ? String(body.regla_id || body.reglaId).trim() : null;
    const estado = String(body.estado || "enviado").trim();
    const errorDetalle = body.error_detalle || body.errorDetalle ? String(body.error_detalle || body.errorDetalle) : null;

    if (!orderId && !logId) {
      return NextResponse.json(
        { success: false, error: "order_id o log_id es obligatorio para registrar el log." },
        { status: 400 }
      );
    }

    // 1. Si viene log_id directo, actualizar ese log
    if (logId) {
      const updated = await prisma.mlMensajePostVentaLog.update({
        where: { id: logId },
        data: {
          estado,
          errorDetalle,
          ...(mensajeEnviado ? { mensajeEnviado } : {}),
        },
      });
      return NextResponse.json({ success: true, log_id: updated.id, updated: true });
    }

    // 2. Si existe un log en estado "pendiente_entrega_full" para este orderId o shipmentId, actualizarlo
    const existing = await prisma.mlMensajePostVentaLog.findFirst({
      where: {
        OR: [
          ...(orderId ? [{ orderId }] : []),
          ...(shipmentId ? [{ shipmentId }] : []),
        ],
        estado: "pendiente_entrega_full",
      },
    });

    if (existing) {
      const updated = await prisma.mlMensajePostVentaLog.update({
        where: { id: existing.id },
        data: {
          estado,
          errorDetalle,
          ...(mensajeEnviado ? { mensajeEnviado } : {}),
        },
      });
      return NextResponse.json({ success: true, log_id: updated.id, updated: true });
    }

    // 3. Sino, crear un nuevo registro
    const created = await prisma.mlMensajePostVentaLog.create({
      data: {
        orderId,
        packId,
        shipmentId,
        buyerId,
        sellerId,
        idArticulo,
        mla,
        tipoLogistica,
        esFull,
        mensajeEnviado: mensajeEnviado || "(sin contenido)",
        reglaId,
        estado,
        errorDetalle,
      },
    });

    return NextResponse.json({ success: true, log_id: created.id, created: true });
  } catch (error: any) {
    console.error("Error al registrar log de mensaje post-venta:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error interno al registrar log" },
      { status: 500 }
    );
  }
}
