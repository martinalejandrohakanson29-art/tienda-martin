// app/api/webhooks/n8n/ventas-rango/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Recibimos las fechas que el usuario seleccionó en la pantalla
    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Faltan las fechas" }, { status: 400 });
    }

    // AQUÍ PONES LA URL DEL WEBHOOK DE TU N8N (Asegúrate de que sea un webhook POST)
    // Por ahora ponemos un placeholder, luego lo cambias por el real
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_VENTAS_RANGO || "AQUI_PONDREMOS_LA_URL_DE_N8N_MAS_ADELANTE";

    // Si todavía no configuraste el webhook, devolvemos datos de prueba simulados
    if (N8N_WEBHOOK_URL === "AQUI_PONDREMOS_LA_URL_DE_N8N_MAS_ADELANTE") {
        // Simulamos un pequeño retraso
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return NextResponse.json([
            {
                "mla": "MLA1517337609",
                "costo_total": "76263.77",
                "envio": 7000.49,
                "neto_recibido": 127613.85,
                "Impuestos": "2119.99",
                "comision": 23264.67,
                "external_reference": "2000014531651256",
                "titulo": "Cilindro Potenciado Ybrxtz 125 A 150 + Leva De Calle 5.6",
                "monto bruto": "159999"
            },
            {
                "mla": "MLA1133188751",
                "costo_total": "88678.80",
                "envio": 9355.49,
                "neto_recibido": 142085.74,
                "Impuestos": "2384.99",
                "comision": 26172.78,
                "external_reference": "2000014533055390",
                "titulo": "Tapa Cilindro Cdi 125cc Para Todos Los 110 Competición Smash",
                "monto bruto": "179999"
            }
        ]);
    }

    // Enviamos la petición a n8n
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ startDate, endDate }),
    });

    if (!response.ok) {
      throw new Error("Error al consultar n8n");
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error en el webhook ventas-rango:", error);
    return NextResponse.json(
      { error: "Error interno al consultar las ventas" },
      { status: 500 }
    );
  }
}
