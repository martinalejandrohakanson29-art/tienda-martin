"use server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

const N8N_SYNC_MARKETING_URL = process.env.N8N_WEBHOOK_SYNC_MARKETING || "https://n8n.revolucionmotos.tech/webhook/sincronizar-marketing";

export async function getMarketingPerformance() {
  try {
    // Traemos los datos reales de la DB
    const [campaignsDB, autoResponses] = await Promise.all([
      prisma.marketingCampaign.findMany({
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.marketingAutoResponse.findMany()
    ]);

    // Adaptamos los datos para que el componente los entienda
    const campaigns = campaignsDB.map(camp => {
      const spend = Number(camp.spend);
      const reach = camp.reach || 0;
      const impressions = camp.impressions || 0;
      const clicks = camp.clicks || 0;
      const messages = camp.messages || 0;
      const carts = camp.carts || 0;

      const cpc = camp.cpc !== null && camp.cpc !== undefined 
        ? Number(camp.cpc) 
        : (clicks > 0 ? spend / clicks : 0);

      const ctr = camp.ctr !== null && camp.ctr !== undefined 
        ? Number(camp.ctr) 
        : (impressions > 0 ? (clicks / impressions) * 100 : 0);

      const frequency = camp.frequency !== null && camp.frequency !== undefined 
        ? Number(camp.frequency) 
        : (reach > 0 && impressions > 0 ? impressions / reach : 0);

      const costPerMsg = messages > 0 ? spend / messages : 0;

      return {
        id: camp.id,
        name: camp.name,
        spend,
        reach,
        impressions,
        clicks,
        cpc,
        ctr,
        frequency,
        messages,
        carts,
        costPerMsg,
        status: camp.status,
        updatedAt: camp.updatedAt
      };
    });

    return { campaigns, autoResponses };
  } catch (error) {
    console.error("Error al obtener marketing:", error);
    return { campaigns: [], autoResponses: [] };
  }
}

export async function sincronizarMarketingWorkflow() {
  try {
    const res = await fetch(N8N_SYNC_MARKETING_URL, {
      method: "POST",
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      return { success: false, error: `n8n respondió HTTP ${res.status}: ${errorText}` };
    }

    revalidatePath("/admin/instagram");
    revalidatePath("/admin/marketing");

    const updatedData = await getMarketingPerformance();
    return { success: true, data: updatedData };
  } catch (error: any) {
    console.error("Error al sincronizar marketing con n8n:", error);
    return { success: false, error: error.message || "Error al conectar con n8n" };
  }
}

