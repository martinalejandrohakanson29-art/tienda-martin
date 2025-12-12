import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN! 
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items } = body;

    // 1. Calculamos el TOTAL exacto de la compra
    let totalAmount = 0;
    items.forEach((item: any) => {
        const unitPrice = item.product.discount > 0
            ? Number(item.product.price) * (1 - item.product.discount / 100)
            : Number(item.product.price);
        
        totalAmount += unitPrice * item.quantity;
    });

    // 2. Construimos el NOMBRE concatenado
    // Ejemplo resultado: "Tapa CDI + 2x Carburador CG 125"
    const productNames = items.map((item: any) => {
        // Si lleva más de 1 unidad, le agregamos "2x " al principio
        const quantityPrefix = item.quantity > 1 ? `${item.quantity}x ` : "";
        return `${quantityPrefix}${item.product.title}`;
    });
    
    // Unimos todo con " + "
    const bundledTitle = productNames.join(" + ");

    // 3. Creamos la preferencia con UN SOLO ítem que representa todo el carrito
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
            {
                title: bundledTitle, // <--- Aquí va el nombre automático
                quantity: 1,
                unit_price: Number(totalAmount.toFixed(2)),
                currency_id: "ARS",
                picture_url: items[0]?.product.imageUrl || "", // Usamos la foto del primer producto
            }
        ],
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?status=success`,
          failure: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?status=failure`,
          pending: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?status=pending`,
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
