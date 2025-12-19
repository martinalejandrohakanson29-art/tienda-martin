"use server";

import { prisma } from "@/lib/prisma";

export async function sendPlanningToN8N(data: any[], shipmentName: string) {
  // CONFIGURACIÓN: Tu Webhook de n8n
  const N8N_WEBHOOK_URL = process.env.N8N_PLANNING_WEBHOOK || "https://n8n-on-render-production-52f0.up.railway.app/webhook/9d62433e-5fb1-4954-af7b-8a5dbaea7e4a";

  // Validación de seguridad básica
  if (!shipmentName || shipmentName.trim() === "") {
      return { success: false, message: "El nombre del envío es obligatorio." };
  }

  try {
    // 1. GUARDAMOS EN BASE DE DATOS USANDO EL NOMBRE MANUAL 💾
    console.log(`Guardando envío "${shipmentName}" en base de datos...`);
    
    // Verificamos si ya existe para evitar errores feos
    const existing = await prisma.shipment.findUnique({ where: { name: shipmentName } });
    if (existing) {
        return { success: false, message: `¡Cuidado! El envío #${shipmentName} ya existe en el sistema.` };
    }
    
    await prisma.shipment.create({
        data: {
            name: shipmentName, // 👈 Usamos el ID manual (Ej: 123456)
            items: {
                create: data.map((item) => ({
                    // Mapeo corregido basado en tu tabla:
                    itemId: item.sku || "S/D",        // row[0] es el MLA ID
                    title: item.title || "Sin título",
                    sku: item.seller_sku || "S/D",    // row[1] es el SKU del vendedor
                    quantity: Number(item.quantity_to_send || 0) 
                }))
            }
        }
    });

    // 2. Preparamos el payload para n8n
    const payload = {
      timestamp: new Date().toISOString(),
      source: "Admin Panel - Tienda Martin",
      shipmentName: shipmentName, // 👈 Enviamos el mismo nombre a n8n
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
    
    return { success: true, message: `Plan #${shipmentName} guardado y enviado a n8n.` };

  } catch (error: any) {
    console.error("Error en proceso de planificación:", error);
    return { success: false, message: "Error: " + error.message };
  }
}
