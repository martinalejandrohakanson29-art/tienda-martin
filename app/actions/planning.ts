"use server";

import { prisma } from "@/lib/prisma";

/**
 * Envía la planificación a n8n y guarda los datos en la base de datos local.
 * Se han agregado las columnas de agregados (N, O, P, Q) para que sean visibles en auditoría.
 */
export async function sendPlanningToN8N(data: any[], shipmentName: string) {
  // CONFIGURACIÓN: Webhook de n8n
  const N8N_WEBHOOK_URL = process.env.N8N_PLANNING_WEBHOOK || "https://n8n-on-render-production-52f0.up.railway.app/webhook/9d62433e-5fb1-4954-af7b-8a5dbaea7e4a";

  // Validación de seguridad básica
  if (!shipmentName || shipmentName.trim() === "") {
      return { success: false, message: "El nombre del envío es obligatorio." };
  }

  try {
    // 1. GUARDAMOS EN BASE DE DATOS LOCAL 💾
    console.log(`Guardando envío "${shipmentName}" en base de datos...`);
    
    // Verificamos duplicados por nombre
    const existing = await prisma.shipment.findUnique({ where: { name: shipmentName } });
    if (existing) {
        return { success: false, message: `¡Cuidado! El envío #${shipmentName} ya existe en el sistema.` };
    }
    
    await prisma.shipment.create({
        data: {
            name: shipmentName,
            items: {
                create: data.map((item) => {
                    // Procesamos los agregados de las columnas N, O, P, Q
                    // Asumimos que en el objeto 'item' vienen mapeados como agregado1, agregado2, etc.
                    const listaAgregados = [
                        item.agregado1, // Columna N
                        item.agregado2, // Columna O
                        item.agregado3, // Columna P
                        item.agregado4  // Columna Q
                    ]
                    .filter(val => val && val.trim() !== "") // Quitamos los vacíos
                    .join(", "); // Los unimos con coma para guardarlos en el campo String?

                    return {
                        itemId: item.sku || "S/D",        // ID de Mercado Libre (MLA)
                        title: item.title || "Sin título",
                        sku: item.seller_sku || "S/D",    // SKU del vendedor
                        quantity: Number(item.quantity_to_send || 0),
                        agregados: listaAgregados          // 👈 Guardamos los agregados aquí
                    };
                })
            }
        }
    });

    // 2. PREPARAMOS Y ENVIAMOS EL PAYLOAD A N8N 🚀
    const payload = {
      timestamp: new Date().toISOString(),
      source: "Admin Panel - Tienda Martin",
      shipmentName: shipmentName,
      items: data
    };

    console.log("Enviando datos a n8n...");

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
    
    return { success: true, message: `Plan #${shipmentName} guardado con agregados y enviado a n8n.` };

  } catch (error: any) {
    console.error("Error en proceso de planificación:", error);
    return { success: false, message: "Error: " + error.message };
  }
}
