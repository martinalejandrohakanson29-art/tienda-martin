import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderData = body.order_data || body;
    const orderId = String(orderData.id || body.order_id || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { should_send: false, error: "Falta order_id o id en el payload." },
        { status: 400 }
      );
    }

    // Omitir órdenes canceladas o inválidas
    const orderStatus = String(orderData.status || body.status || "").trim().toLowerCase();
    if (orderStatus === "cancelled" || orderStatus === "invalid") {
      return NextResponse.json({
        should_send: false,
        reason: `La orden está en estado '${orderStatus}'. No se envía mensaje post-venta.`,
        order_id: orderId,
      });
    }

    // 1. Chequeo de duplicados y condición de carrera: ¿Ya enviamos o estamos procesando esta orden?
    const yaProcesado = await prisma.mlMensajePostVentaLog.findFirst({
      where: {
        orderId: orderId,
        estado: { in: ["enviado", "procesando"] },
      },
    });

    if (yaProcesado) {
      return NextResponse.json({
        should_send: false,
        reason: `Mensaje post-venta ya fue enviado o está en proceso para la orden ${orderId} (estado actual: ${yaProcesado.estado})`,
        order_id: orderId,
        log_id: yaProcesado.id,
      });
    }

    // 2. Extraer información del envío (Full vs Flex/Colecta)
    const shipping = orderData.shipping || body.shipping || body.shipment || {};
    const shipmentId = shipping.id ? String(shipping.id).trim() : (body.shipment_id ? String(body.shipment_id).trim() : null);
    const logisticType = String(shipping.logistic_type || body.logistic_type || "").trim().toLowerCase();
    const shippingStatus = String(shipping.status || body.shipping_status || "").trim().toLowerCase();

    const isFull = logisticType === "fulfillment" || body.is_full === true;
    const isDelivered = shippingStatus === "delivered" || orderData.status === "delivered";

    // 3. Extraer MLAs y SKUs directos de la orden
    const orderItems = Array.isArray(orderData.order_items) ? orderData.order_items : [];
    const mlas: string[] = [];
    const directSkus: string[] = [];
    for (const item of orderItems) {
      const mlaId = item?.item?.id || item?.id;
      if (mlaId) mlas.push(String(mlaId).trim().toUpperCase());
      const sellerSku = item?.item?.seller_sku || item?.item?.seller_custom_field || item?.seller_sku;
      if (sellerSku) directSkus.push(String(sellerSku).trim());
    }

    if (mlas.length === 0 && body.mla) {
      mlas.push(String(body.mla).trim().toUpperCase());
    }

    if (mlas.length === 0 && directSkus.length === 0) {
      return NextResponse.json({
        should_send: false,
        reason: "La orden no contiene items/MLAs válidos para evaluar.",
        order_id: orderId,
      });
    }

    // 4. Obtener reglas activas
    const activeRules = await prisma.mlMensajePostVenta.findMany({
      where: { activo: true },
    });

    if (activeRules.length === 0) {
      return NextResponse.json({
        should_send: false,
        reason: "No hay reglas de mensajes post-venta activas.",
        order_id: orderId,
      });
    }

    // 5. Resolver artículos presentes en los MLAs de la orden (directos y por combos/BOM)
    const [kits, bom] = await Promise.all([
      prisma.composicionKits.findMany({
        where: { mla: { in: mlas } },
        select: { mla: true, id_articulo: true },
      }),
      prisma.articulosCompuestos.findMany({
        select: { sku_padre: true, sku_hijo: true },
      }),
    ]);

    // Grafo de explosión de combos: sku_padre -> sku_hijo
    const childrenOf = new Map<string, Set<string>>();
    for (const r of bom) {
      const padre = (r.sku_padre || "").trim();
      const hijo = (r.sku_hijo || "").trim();
      if (!padre || !hijo) continue;
      if (!childrenOf.has(padre)) childrenOf.set(padre, new Set());
      childrenOf.get(padre)!.add(hijo);
    }

    const explodeArticles = (sku: string, visited = new Set<string>()): Set<string> => {
      const out = new Set<string>();
      if (!sku || visited.has(sku)) return out;
      visited.add(sku);
      out.add(sku);
      const directChildren = childrenOf.get(sku);
      if (directChildren) {
        for (const child of directChildren) {
          out.add(child);
          const subChildren = explodeArticles(child, visited);
          for (const sc of subChildren) out.add(sc);
        }
      }
      return out;
    };

    // Artículos totales contenidos en la orden
    const articulosEnOrden = new Set<string>();
    for (const k of kits) {
      const idArt = (k.id_articulo || "").trim();
      if (idArt) {
        const exploded = explodeArticles(idArt);
        for (const a of exploded) articulosEnOrden.add(a);
      }
    }
    for (const sku of directSkus) {
      if (sku) {
        const exploded = explodeArticles(sku);
        for (const a of exploded) articulosEnOrden.add(a);
      }
    }

    // 6. Comparar con las reglas activas
    let matchedRule: typeof activeRules[0] | null = null;
    let matchedMla: string | null = null;

    for (const rule of activeRules) {
      const targetArticulo = (rule.idArticulo || "").trim();
      if (articulosEnOrden.has(targetArticulo)) {
        matchedRule = rule;
        matchedMla = mlas[0] || null;
        break;
      }
    }

    if (!matchedRule) {
      return NextResponse.json({
        should_send: false,
        reason: "Ninguno de los artículos de la orden coincide con las reglas post-venta activas.",
        order_id: orderId,
        mlas_evaluados: mlas,
        articulos_detectados: Array.from(articulosEnOrden),
      });
    }

    // 7. Preparar payload y mensaje
    const buyer = orderData.buyer || {};
    const seller = orderData.seller || {};
    const buyerId = String(buyer.id || body.buyer_id || "").trim();
    const sellerId = String(seller.id || body.seller_id || "194083300").trim();
    const packId = String(orderData.pack_id || orderId).trim();
    const buyerName = buyer.first_name || buyer.nickname || "Comprador";

    // Reemplazo amigable de etiquetas dinámicas en el mensaje
    let mensajeFinal = matchedRule.mensaje
      .replace(/{comprador}/gi, buyerName)
      .replace(/{articulo}/gi, matchedRule.nombreArticulo)
      .replace(/{orden}/gi, orderId);

    // 8. MANEJO ESPECIAL PARA FULL:
    // Si la orden es de Full y todavía no se entregó al comprador, Mercado Libre no permite abrir
    // el chat. Por lo tanto, registramos el log como "pendiente_entrega_full" y diferimos el envío.
    if (isFull && !isDelivered) {
      // Buscar si ya existe un registro pendiente para no duplicarlo
      const existingPending = await prisma.mlMensajePostVentaLog.findFirst({
        where: {
          orderId: orderId,
          estado: "pendiente_entrega_full",
        },
      });

      let pendingLogId = existingPending?.id;
      if (existingPending) {
        await prisma.mlMensajePostVentaLog.update({
          where: { id: existingPending.id },
          data: {
            shipmentId,
            tipoLogistica: logisticType || "fulfillment",
            esFull: true,
            mensajeEnviado: mensajeFinal,
            buyerId,
            sellerId,
            mla: matchedMla,
            idArticulo: matchedRule.idArticulo,
            reglaId: matchedRule.id,
          },
        });
      } else {
        const created = await prisma.mlMensajePostVentaLog.create({
          data: {
            orderId,
            packId,
            shipmentId,
            buyerId,
            sellerId,
            idArticulo: matchedRule.idArticulo,
            mla: matchedMla,
            tipoLogistica: logisticType || "fulfillment",
            esFull: true,
            mensajeEnviado: mensajeFinal,
            reglaId: matchedRule.id,
            estado: "pendiente_entrega_full",
          },
        });
        pendingLogId = created.id;
      }

      return NextResponse.json({
        should_send: false,
        status: "pendiente_entrega_full",
        is_full: true,
        reason: "La compra es por Full. El mensaje queda programado para enviarse al momento de la entrega al comprador.",
        order_id: orderId,
        shipment_id: shipmentId,
        log_id: pendingLogId,
        articulo: matchedRule.nombreArticulo,
      });
    }

    // 9. MANEJO PARA NO FULL O YA ENTREGADAS:
    // Registrar log previo en estado "procesando" para evitar que notificaciones
    // casi simultáneas de la misma orden disparen envíos duplicados.
    let logId: string;
    const existingLog = await prisma.mlMensajePostVentaLog.findFirst({
      where: { orderId: orderId },
    });

    if (existingLog) {
      const updated = await prisma.mlMensajePostVentaLog.update({
        where: { id: existingLog.id },
        data: {
          packId,
          shipmentId,
          buyerId,
          sellerId,
          idArticulo: matchedRule.idArticulo,
          mla: matchedMla,
          tipoLogistica: logisticType || (isFull ? "fulfillment" : "standard"),
          esFull: isFull,
          mensajeEnviado: mensajeFinal,
          reglaId: matchedRule.id,
          estado: "procesando",
        },
      });
      logId = updated.id;
    } else {
      const created = await prisma.mlMensajePostVentaLog.create({
        data: {
          orderId,
          packId,
          shipmentId,
          buyerId,
          sellerId,
          idArticulo: matchedRule.idArticulo,
          mla: matchedMla,
          tipoLogistica: logisticType || (isFull ? "fulfillment" : "standard"),
          esFull: isFull,
          mensajeEnviado: mensajeFinal,
          reglaId: matchedRule.id,
          estado: "procesando",
        },
      });
      logId = created.id;
    }

    return NextResponse.json({
      should_send: true,
      status: "listo_para_enviar",
      log_id: logId,
      is_full: isFull,
      order_id: orderId,
      pack_id: packId,
      shipment_id: shipmentId,
      buyer_id: buyerId,
      seller_id: sellerId,
      buyer_name: buyerName,
      mla: matchedMla,
      id_articulo: matchedRule.idArticulo,
      nombre_articulo: matchedRule.nombreArticulo,
      tipo_logistica: logisticType || (isFull ? "fulfillment" : "standard"),
      regla_id: matchedRule.id,
      regla_titulo: matchedRule.titulo,
      mensaje: mensajeFinal,
    });
  } catch (error: any) {
    console.error("Error al evaluar orden para mensaje post-venta:", error);
    return NextResponse.json(
      { should_send: false, error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
