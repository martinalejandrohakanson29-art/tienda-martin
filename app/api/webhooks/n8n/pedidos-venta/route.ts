import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const id = searchParams.get("id");

    // Si se solicita un ID específico
    if (id) {
      const pedido = await prisma.venta.findUnique({
        where: { id },
        include: {
          items: true,
          auditorias: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      return NextResponse.json(pedido);
    }

    // Filtro por defecto: Solo pedidos (no ventas confirmadas)
    const where: any = {
      tipoVenta: "PEDIDO",
    };

    // Filtro por fecha si se proporciona
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const pedidos = await prisma.venta.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Formatear para que sea más amigable para n8n
    const pedidosFormateados = pedidos.map(p => ({
      id: p.id,
      id_corto: p.id.slice(0, 8),
      cliente: p.cliente,
      vendedor: p.vendedor,
      dni: p.dni,
      telefono: p.telefono,
      email: p.email,
      total: Number(p.total),
      interes: Number(p.interes),
      totalFinal: Number(p.totalFinal),
      metodo_pago: p.metodo_pago,
      fecha: p.createdAt,
      observaciones: p.info,
      envio_de: p.de,
      envio_para: p.para,
      estado: p.estadoPedido,
      registrada: p.registrada,
      pdfUrl: p.pdfUrl,
      items: p.items.map(i => ({
        sku: i.productoId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio: Number(i.precio_unit),
        subtotal: Number(i.subtotal)
      }))
    }));

    return NextResponse.json(pedidosFormateados);
  } catch (error: any) {
    console.error("Error en API pedidos-venta:", error);
    return NextResponse.json(
      { error: "Error al obtener pedidos", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Endpoint para que n8n pueda "notificar" o "procesar" pedidos específicos
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pedidosIds, action } = body;

    if (!pedidosIds || !Array.isArray(pedidosIds)) {
      return NextResponse.json({ error: "Se requiere un array de pedidosIds" }, { status: 400 });
    }

    const pedidos = await prisma.venta.findMany({
      where: {
        id: { in: pedidosIds }
      },
      include: {
        items: true
      }
    });

    // Formatear para n8n
    const dataToSend = pedidos.map(p => ({
      id: p.id,
      cliente: p.cliente,
      total: Number(p.totalFinal),
      observaciones: p.info,
      items: p.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad }))
    }));

    // Si hay una URL configurada, enviamos el push
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_PEDIDOS_VENTA;

    if (N8N_WEBHOOK_URL) {
      try {
        await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: action || "sync",
            count: dataToSend.length,
            pedidos: dataToSend
          }),
        });
      } catch (pushError) {
        console.error("Error enviando a n8n:", pushError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Procesando ${pedidos.length} pedidos`,
      data: dataToSend
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: "Error en el procesamiento", message: error.message },
      { status: 500 }
    );
  }
}
