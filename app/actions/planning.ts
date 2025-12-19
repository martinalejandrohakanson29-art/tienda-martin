"use server";

import { prisma } from "@/lib/prisma"; // 👈 Importamos prisma

export async function sendPlanningToN8N(data: any[]) {
  // CONFIGURACIÓN: Tu Webhook de n8n
  const N8N_WEBHOOK_URL = process.env.N8N_PLANNING_WEBHOOK || "https://n8n-on-render-production-52f0.up.railway.app/webhook/9d62433e-5fb1-4954-af7b-8a5dbaea7e4a";

  // 1. Generamos un nombre único para este envío (Ej: Envio_2024-05-20_14-30)
  const date = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const shipmentName = `Envio_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;

  try {
    // 2. GUARDAMOS EN BASE DE DATOS (NUEVO) 💾
    console.log(`Guardando envío ${shipmentName} en base de datos...`);
    
    await prisma.shipment.create({
        data: {
            name: shipmentName,
            items: {
                create: data.map((item) => ({
                    itemId: item.id || item.itemId || "S/D", // Asegúrate que tu tabla de planning tenga este campo
                    title: item.title || "Producto sin nombre",
                    sku: item.sku || "S/D",
                    quantity: Number(item.quantity || 0) // 👈 Aquí guardamos la cantidad
                }))
            }
        }
    });

    // 3. Preparamos el payload para n8n
    const payload = {
      timestamp: new Date().toISOString(),
      source: "Admin Panel - Tienda Martin",
      shipmentName: shipmentName, // 👈 Enviamos el nombre para que n8n lo use
      items: data
    };

    console.log("Enviando datos a n8n:", JSON.stringify(payload, null, 2));

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error n8n (${response.status}): ${errorText}`);
    }
    
    return { success: true, message: `Plan guardado como "${shipmentName}" y enviado a n8n.` };

  } catch (error: any) {
    console.error("Error en proceso de planificación:", error);
    return { success: false, message: "Error: " + error.message };
  }
}
