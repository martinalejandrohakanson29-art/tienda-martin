import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hace15Dias = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    const pendientes = await prisma.mlMensajePostVentaLog.findMany({
      where: {
        estado: "pendiente_entrega_full",
        createdAt: { gte: hace15Dias },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      total: pendientes.length,
      data: pendientes.map((p) => ({
        log_id: p.id,
        order_id: p.orderId,
        pack_id: p.packId,
        shipment_id: p.shipmentId,
        buyer_id: p.buyerId,
        seller_id: p.sellerId,
        id_articulo: p.idArticulo,
        mla: p.mla,
        mensaje: p.mensajeEnviado,
        regla_id: p.reglaId,
        created_at: p.createdAt,
      })),
    });
  } catch (error: any) {
    console.error("Error al obtener pendientes de entrega Full:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
