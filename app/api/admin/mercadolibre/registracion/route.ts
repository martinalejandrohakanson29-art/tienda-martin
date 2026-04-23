// app/api/admin/mercadolibre/registracion/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // URL del webhook de n8n para obtener ventas a registrar
    const N8N_WEBHOOK_URL = process.env.N8N_REGISTRACION_VENTAS_URL || "https://n8n.revolucionmotos.tech/webhook/Registracion";

    if (!N8N_WEBHOOK_URL) {
      // Si no está configurado, devolvemos datos de prueba para que puedan trabajar en n8n
      return NextResponse.json([
        {
          id: "2000000000000001",
          cliente: "MOCK - Cliente Full",
          categoria: "Full",
          total: 25000.50,
          fecha: new Date().toISOString()
        },
        {
          id: "2000000000000002",
          cliente: "MOCK - Cliente Colecta",
          categoria: "Colecta",
          total: 12300.00,
          fecha: new Date().toISOString()
        },
        {
          id: "2000000000000003",
          cliente: "MOCK - Cliente Flex",
          categoria: "Flex",
          total: 8900.00,
          fecha: new Date().toISOString()
        }
      ]);
    }

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        action: action || 'get_sales_to_register',
        preparados: body.preparados || [],
        timestamp: new Date().toISOString()
      }),
    });

    if (!response.ok) {
      throw new Error(`Error en n8n: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Esperamos que n8n devuelva un array de objetos con el formato:
    // { id: string, cliente: string, categoria: string, total: number, fecha: string }
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Error en API Registracion:", error);
    return NextResponse.json(
      { error: error.message || "Error al conectar con n8n" },
      { status: 500 }
    );
  }
}
