import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

export async function POST(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

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

        // Extraemos mensajes y carritos buscando en el array de 'actions' de Meta o directo
        const actions = camp.rawActions || camp.actions || [];
        
        let messages = camp.messages !== undefined ? parseInt(camp.messages) : 0;
        if (!messages && actions.length > 0) {
          const msgFound = actions.find((a: any) => 
            a.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
            a.action_type === "onsite_conversion.messaging_first_reply" ||
            a.action_type === "onsite_conversion.total_messaging_connection"
          )?.value || actions.find((a: any) => a.action_type?.includes("messaging"))?.value;
          messages = parseInt(msgFound || 0);
        }
        
        let carts = camp.carts !== undefined ? parseInt(camp.carts) : 0;
        if (!carts && actions.length > 0) {
          const cartFound = actions.find((a: any) => 
            a.action_type === "add_to_cart" ||
            a.action_type === "offsite_conversion.fb_pixel_add_to_cart" ||
            a.action_type === "omni_add_to_cart"
          )?.value;
          carts = parseInt(cartFound || 0);
        }

        const impressions = parseInt(camp.impressions || 0);
        const clicks = parseInt(camp.inline_link_clicks || camp.clicks || 0);
        const spend = parseFloat(camp.spend || 0);
        const reach = parseInt(camp.reach || 0);
        const cpcVal = camp.cpc !== null && camp.cpc !== undefined
          ? parseFloat(camp.cpc) 
          : (camp.cost_per_inline_link_click ? parseFloat(camp.cost_per_inline_link_click) : (clicks > 0 ? spend / clicks : null));
        const ctrVal = camp.ctr !== null && camp.ctr !== undefined
          ? parseFloat(camp.ctr) 
          : (camp.inline_link_click_ctr ? parseFloat(camp.inline_link_click_ctr) : (impressions > 0 ? (clicks / impressions) * 100 : null));
        const frequencyVal = camp.frequency !== null && camp.frequency !== undefined 
          ? parseFloat(camp.frequency) 
          : (reach > 0 && impressions > 0 ? impressions / reach : null);

        const cpmVal = camp.cpm !== null && camp.cpm !== undefined
          ? parseFloat(camp.cpm)
          : (impressions > 0 ? (spend / impressions) * 1000 : null);

        const status = camp.status || camp.effective_status || 'ACTIVE';
        const adSets = camp.adSets && Array.isArray(camp.adSets) ? camp.adSets : null;

        const dateStart = camp.date_start || camp.dateStart ? new Date(camp.date_start || camp.dateStart) : undefined;
        const dateStop = camp.date_stop || camp.dateStop ? new Date(camp.date_stop || camp.dateStop) : undefined;
        const createdTime = camp.created_time || camp.createdTime ? new Date(camp.created_time || camp.createdTime) : undefined;
        const startTime = camp.start_time || camp.startTime ? new Date(camp.start_time || camp.startTime) : undefined;

        // Guardamos o actualizamos en la DB
        await prisma.marketingCampaign.upsert({
          where: { id: idCampania.toString() },
          update: {
            name: camp.campaign_name || camp.name || "Sin nombre",
            spend: spend,
            reach: reach,
            impressions: impressions,
            clicks: clicks,
            cpc: cpcVal !== null && !isNaN(cpcVal) ? Number(cpcVal.toFixed(2)) : null,
            cpm: cpmVal !== null && !isNaN(cpmVal) ? Number(cpmVal.toFixed(2)) : null,
            ctr: ctrVal !== null && !isNaN(ctrVal) ? Number(ctrVal.toFixed(2)) : null,
            frequency: frequencyVal !== null && !isNaN(frequencyVal) ? Number(frequencyVal.toFixed(2)) : null,
            messages: messages,
            carts: carts,
            rawActions: actions.length > 0 ? actions : null,
            adSets: adSets || undefined,
            status: status,
            createdTime: createdTime || undefined,
            startTime: startTime || undefined,
            dateStart: dateStart || undefined,
            dateStop: dateStop || undefined
          },
          create: {
            id: idCampania.toString(),
            name: camp.campaign_name || camp.name || "Sin nombre",
            spend: spend,
            reach: reach,
            impressions: impressions,
            clicks: clicks,
            cpc: cpcVal !== null && !isNaN(cpcVal) ? Number(cpcVal.toFixed(2)) : null,
            cpm: cpmVal !== null && !isNaN(cpmVal) ? Number(cpmVal.toFixed(2)) : null,
            ctr: ctrVal !== null && !isNaN(ctrVal) ? Number(ctrVal.toFixed(2)) : null,
            frequency: frequencyVal !== null && !isNaN(frequencyVal) ? Number(frequencyVal.toFixed(2)) : null,
            messages: messages,
            carts: carts,
            rawActions: actions.length > 0 ? actions : null,
            adSets: adSets || undefined,
            status: status,
            createdTime: createdTime || undefined,
            startTime: startTime || undefined,
            dateStart: dateStart || undefined,
            dateStop: dateStop || undefined
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
