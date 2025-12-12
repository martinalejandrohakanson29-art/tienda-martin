import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

// Inicializamos el cliente con tu token
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
        // Calculamos precio unitario real (con descuento si aplica)
        const unitPrice = item.product.discount > 0
            ? Number(item.product.price) * (1 - item.product.discount / 100)
            : Number(item.product.price);
        
        totalAmount += unitPrice * item.quantity;
    });

    // 2. Construimos el NOMBRE concatenado del link
    const productNames = items.map((item: any) => {
        const quantityPrefix = item.quantity > 1 ? `${item.quantity}x ` : "";
        return `${quantityPrefix}${item.product.title}`;
    });
    
    const bundledTitle = productNames.join(" + ");

    // 3. Creamos la preferencia con UN SOLO ítem
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
            {
                id: "carrito-combo", // 👈 ESTA ES LA LÍNEA QUE FALTABA (FIX)
                title: bundledTitle, 
                quantity: 1,
                unit_price: Number(totalAmount.toFixed(2)),
                currency_id: "ARS",
                picture_url: items[0]?.product.imageUrl || "",
            }
        ],
        // Configuración de redirección al finalizar el pago
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?status=success`,
          failure: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?status=failure`,
          pending: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?status=pending`,
        },
        auto_return: "approved",
      },
    });

    // Devolvemos el link de pago al frontend
    return NextResponse.json({ url: result.init_point });

  } catch (error) {
    console.error("Error creando preferencia:", error);
    return NextResponse.json({ error: "Error al procesar el pago" }, { status: 500 });
  }
}
