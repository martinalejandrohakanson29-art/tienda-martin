import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shipmentData = body.shipment_data || body;
    const shipmentId = String(shipmentData.id || body.shipment_id || "").trim();
    const orderId = String(body.order_id || shipmentData.order_id || "").trim();
    const status = String(shipmentData.status || body.status || "").trim().toLowerCase();

    if (!shipmentId && !orderId) {
      return NextResponse.json(
        { should_send: false, error: "Falta shipment_id o order_id." },
        { status: 400 }
      );
    }

    if (status && status !== "delivered") {
      return NextResponse.json({
        should_send: false,
        reason: `El envío aún no está entregado (estado actual: ${status}).`,
        shipment_id: shipmentId,
      });
    }

    // Buscar en los logs si hay un mensaje pendiente de entrega Full
    const pendingLog = await prisma.mlMensajePostVentaLog.findFirst({
      where: {
        OR: [
          ...(shipmentId ? [{ shipmentId: shipmentId }] : []),
          ...(orderId ? [{ orderId: orderId }] : []),
        ],
        estado: "pendiente_entrega_full",
      },
    });

    if (!pendingLog) {
      return NextResponse.json({
        should_send: false,
        reason: "No hay ningún mensaje post-venta pendiente para este envío/orden.",
        shipment_id: shipmentId,
        order_id: orderId,
      });
    }

    // Bloqueo atómico contra disparos duplicados concurrentes:
    // Marcamos inmediatamente como 'procesando' para que cualquier webhook
    // o ejecución paralela no vuelva a tomar este mismo registro.
    await prisma.mlMensajePostVentaLog.update({
      where: { id: pendingLog.id },
      data: { estado: "procesando" },
    });

    return NextResponse.json({
      should_send: true,
      log_id: pendingLog.id,
      order_id: pendingLog.orderId,
      pack_id: pendingLog.packId || pendingLog.orderId,
      shipment_id: pendingLog.shipmentId || shipmentId,
      buyer_id: pendingLog.buyerId,
      seller_id: pendingLog.sellerId || "194083300",
      id_articulo: pendingLog.idArticulo,
      mla: pendingLog.mla,
      mensaje: pendingLog.mensajeEnviado,
      regla_id: pendingLog.reglaId,
    });
  } catch (error: any) {
    console.error("Error al procesar entrega de envío Full:", error);
    return NextResponse.json(
      { should_send: false, error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
