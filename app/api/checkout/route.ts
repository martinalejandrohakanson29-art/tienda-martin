import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { prisma } from "@/lib/prisma";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return NextResponse.json({ error: "Carrito inválido" }, { status: 400 });
    }

    // Extraemos solo los datos que confiamos del cliente: id y cantidad
    const cartEntries: { productId: string; quantity: number }[] = items.map((item: any) => ({
      productId: String(item.product?.id ?? item.productId ?? ""),
      quantity: Math.max(1, Math.min(99, parseInt(item.quantity) || 1)),
    }));

    const productIds = cartEntries.map(e => e.productId).filter(Boolean);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "No se encontraron productos válidos" }, { status: 400 });
    }

    // Precios obtenidos de la BD — el cliente no puede manipularlos
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true, price: true, discount: true, imageUrl: true, stock: true },
    });

    const productMap = new Map(products.map(p => [p.id, p]));

    let totalAmount = 0;
    const dbItems: {
      productoId: string;
      nombre: string;
      cantidad: number;
      precio_unit: number;
      subtotal: number;
    }[] = [];

    for (const entry of cartEntries) {
      const product = productMap.get(entry.productId);
      if (!product) {
        return NextResponse.json(
          { error: `El producto no está disponible` },
          { status: 400 }
        );
      }
      if (product.stock < entry.quantity) {
        return NextResponse.json(
          { error: `Stock insuficiente para "${product.title}"` },
          { status: 400 }
        );
      }

      const unitPrice =
        product.discount > 0
          ? Number(product.price) * (1 - product.discount / 100)
          : Number(product.price);

      totalAmount += unitPrice * entry.quantity;
      dbItems.push({
        productoId: product.id,
        nombre: product.title,
        cantidad: entry.quantity,
        precio_unit: unitPrice,
        subtotal: unitPrice * entry.quantity,
      });
    }

    const webSale = await prisma.webSale.create({
      data: {
        total: totalAmount,
        status: "PENDIENTE",
        items: { create: dbItems },
      },
    });

    const bundledTitle = dbItems
      .map(i => (i.cantidad > 1 ? `${i.cantidad}x ${i.nombre}` : i.nombre))
      .join(" + ");

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: "carrito-combo",
            title: bundledTitle,
            quantity: 1,
            unit_price: Number(totalAmount.toFixed(2)),
            currency_id: "ARS",
            picture_url: products[0]?.imageUrl || "",
          },
        ],
        external_reference: webSale.id,
        back_urls: {
          success: "https://www.revolucionmotos.com.ar/compra-exitosa",
          failure: "https://www.revolucionmotos.com.ar/shop?status=failure",
          pending: "https://www.revolucionmotos.com.ar/shop?status=pending",
        },
        auto_return: "approved",
      },
    });

    return NextResponse.json({ url: result.init_point });
  } catch (error) {
    console.error("Error creando preferencia:", error);
    return NextResponse.json({ error: "Error al procesar el pago" }, { status: 500 });
  }
}
