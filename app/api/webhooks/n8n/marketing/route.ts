import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // n8n puede enviar los datos directamente en un array o dentro de una propiedad 'data'
    const campaigns = Array.isArray(body) ? body : (body.data || []);

    console.log(`Recibidas ${campaigns.length} campañas desde n8n`);

    if (campaigns.length > 0) {
      for (const camp of campaigns) {
        // Obtenemos el ID de Meta (priorizamos campaign_id que viene de los insights)
        const idCampania = camp.campaign_id || camp.id;

        // VALIDACIÓN: Si no hay ID, no podemos hacer upsert. Saltamos esta campaña.
        if (!idCampania) {
          console.warn("⚠️ Saltando campaña sin ID:", camp.campaign_name || camp.name);
          continue;
        }

        // Extraemos mensajes y carritos buscando en el array de 'actions' de Meta
        const actions = camp.actions || [];
        
        const messages = actions.find((a: any) => 
          a.action_type === "onsite_conversion.messaging_conversation_started_7d"
        )?.value || 0;
        
        const carts = actions.find((a: any) => 
          a.action_type === "add_to_cart"
        )?.value || 0;

        // Guardamos o actualizamos en la DB
        await prisma.marketingCampaign.upsert({
          where: { id: idCampania.toString() },
          update: {
            name: camp.campaign_name || camp.name || "Sin nombre",
            spend: parseFloat(camp.spend || 0),
            reach: parseInt(camp.reach || 0),
            messages: parseInt(messages),
            carts: parseInt(carts),
            status: camp.status || 'Active'
          },
          create: {
            id: idCampania.toString(),
            name: camp.campaign_name || camp.name || "Sin nombre",
            spend: parseFloat(camp.spend || 0),
            reach: parseInt(camp.reach || 0),
            messages: parseInt(messages),
            carts: parseInt(carts),
            status: camp.status || 'Active'
          }
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Datos de marketing sincronizados correctamente" 
    }, { status: 200 });

  } catch (error: any) {
    console.error("❌ Error en webhook marketing:", error.message);
    return NextResponse.json({ 
      success: false, 
      error: "Error interno al procesar los datos" 
    }, { status: 500 });
  }
}
