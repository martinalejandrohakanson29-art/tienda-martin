import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Si n8n nos manda una lista de campañas
    if (Array.isArray(body)) {
      for (const camp of body) {
        // Buscamos si hay mensajes y carritos en el array de 'actions' de Meta
        const messages = camp.actions?.find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value || 0;
        const carts = camp.actions?.find((a: any) => a.action_type === "add_to_cart")?.value || 0;

        await prisma.marketingCampaign.upsert({
          where: { id: camp.campaign_id || camp.id },
          update: {
            name: camp.campaign_name || camp.name,
            spend: parseFloat(camp.spend),
            reach: parseInt(camp.reach),
            messages: parseInt(messages),
            carts: parseInt(carts),
            status: camp.status || 'Active'
          },
          create: {
            id: camp.campaign_id || camp.id,
            name: camp.campaign_name || camp.name,
            spend: parseFloat(camp.spend),
            reach: parseInt(camp.reach),
            messages: parseInt(messages),
            carts: parseInt(carts),
            status: camp.status || 'Active'
          }
        });
      }
    }

    return NextResponse.json({ message: "Datos actualizados correctamente" }, { status: 200 });
  } catch (error) {
    console.error("Error en webhook marketing:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
