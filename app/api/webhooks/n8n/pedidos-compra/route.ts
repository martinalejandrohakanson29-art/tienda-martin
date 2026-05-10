import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const id = searchParams.get("id");
    const estado = searchParams.get("estado");

    // Si se solicita un ID específico
    if (id) {
      const pedido = await prisma.compra.findUnique({
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

    // Filtro por defecto: Solo pedidos (no compras confirmadas)
    const where: any = {
      tipoCompra: "PEDIDO",
    };

    // Filtro por estado si se proporciona
    if (estado) {
      where.estadoPedido = estado;
    }

    // Filtro por fecha si se proporciona
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const pedidos = await prisma.compra.findMany({
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
      proveedor: p.proveedor,
      comprador: p.comprador,
      dni: p.dni,
      telefono: p.telefono,
      total: Number(p.total),
      interes: Number(p.interes),
      descuento: Number(p.descuento),
      totalFinal: Number(p.totalFinal),
      metodo_pago: p.metodo_pago,
      fecha: p.createdAt,
      fechaActualizacion: p.updatedAt,
      observaciones: p.info,
      estado: p.estadoPedido,
      registrada: p.registrada,
      pdfUrl: p.pdfUrl,
      comprobante: p.comprobante,
      transaccionId: p.transaccionId,
      items: p.items.map(i => ({
        sku: i.productoId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        costo: Number(i.costo_unit),
        subtotal: Number(i.subtotal)
      }))
    }));

    return NextResponse.json(pedidosFormateados);
  } catch (error: any) {
    console.error("Error en API pedidos-compra:", error);
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
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { pedidosIds, action } = body;

    if (!pedidosIds || !Array.isArray(pedidosIds)) {
      return NextResponse.json({ error: "Se requiere un array de pedidosIds" }, { status: 400 });
    }

    const pedidos = await prisma.compra.findMany({
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
      proveedor: p.proveedor,
      total: Number(p.totalFinal),
      observaciones: p.info,
      items: p.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad }))
    }));

    // Si hay una URL configurada, enviamos el push (opcional, si se quiere paridad total)
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_PEDIDOS_COMPRA;

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

/**
 * Endpoint para que n8n pueda actualizar el estado de un pedido
 */
export async function PATCH(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { id, estado } = body;

    if (!id || !estado) {
      return NextResponse.json({ error: "Se requiere id y estado" }, { status: 400 });
    }

    // Validar estados permitidos para compras
    const estadosPermitidos = ["PENDIENTE", "RECIBIDO", "CANCELADO"];
    if (!estadosPermitidos.includes(estado)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    const updated = await prisma.compra.update({
      where: { id },
      data: { estadoPedido: estado },
      include: { items: true }
    });

    // Registrar en auditoría
    await prisma.compraAuditoria.create({
      data: {
        compraId: id,
        usuario: "n8n_automation",
        accion: "ACTUALIZACION_ESTADO_N8N",
        detalle: `Estado actualizado a ${estado} vía API n8n`
      }
    });

    return NextResponse.json({
      success: true,
      message: `Pedido ${id} actualizado a ${estado}`,
      data: updated
    });

  } catch (error: any) {
    console.error("Error en PATCH API pedidos-compra:", error);
    return NextResponse.json(
      { error: "Error al actualizar pedido", message: error.message },
      { status: 500 }
    );
  }
}
