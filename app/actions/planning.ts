"use server";

export async function sendPlanningToN8N(data: any[]) {
  // CONFIGURACIÓN: Aquí pondrás la URL que te dé n8n cuando crees el nodo "Webhook"
  // Por ahora puedes dejar este placeholder o probar con una URL de prueba (ej. webhook.site)
  const N8N_WEBHOOK_URL = process.env.N8N_PLANNING_WEBHOOK || "https://n8n-on-render-production-52f0.up.railway.app/webhook-test/9d62433e-5fb1-4954-af7b-8a5dbaea7e4a";

  const payload = {
    timestamp: new Date().toISOString(),
    // Enviamos un resumen de quién hace el pedido si tienes auth (opcional)
    source: "Admin Panel - Tienda Martin", 
    items: data
  };

  try {
    console.log("Enviando datos a n8n:", JSON.stringify(payload, null, 2));

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        // "Authorization": "Bearer tu_token_secreto" // (Opcional: si aseguras tu webhook)
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error n8n (${response.status}): ${errorText}`);
    }
    
    return { success: true, message: "Plan enviado a n8n correctamente. La hoja se está generando." };
  } catch (error) {
    console.error("Fallo al conectar con n8n:", error);
    return { success: false, message: "Error al conectar con n8n. Revisa la consola del servidor." };
  }
}
