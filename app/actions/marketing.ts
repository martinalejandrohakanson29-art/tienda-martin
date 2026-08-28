"use server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

const N8N_SYNC_MARKETING_URL = process.env.N8N_WEBHOOK_SYNC_MARKETING || "https://n8n.revolucionmotos.tech/webhook/sincronizar-marketing";

export interface MarketingAdData {
  id: string
  adSetId?: string
  campaignId?: string
  name: string
  status: string
  spend: number
  reach: number
  impressions: number
  clicks: number
  cpc?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
}

export interface MarketingAdSetData {
  id: string
  campaignId?: string
  name: string
  status: string
  spend: number
  reach: number
  impressions: number
  clicks: number
  cpc?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  ads: MarketingAdData[]
}

export interface MarketingCampaignData {
  id: string
  name: string
  status: string
  spend: number
  reach: number
  impressions: number
  clicks: number
  cpc?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  adSets?: MarketingAdSetData[]
  updatedAt?: Date | string
}

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
    const campaigns: MarketingCampaignData[] = campaignsDB.map(camp => {
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

      // Parsear adSets si existen
      let rawAdSets: any[] = [];
      if (camp.adSets) {
        if (Array.isArray(camp.adSets)) {
          rawAdSets = camp.adSets;
        } else if (typeof camp.adSets === "string") {
          try { rawAdSets = JSON.parse(camp.adSets); } catch (e) {}
        }
      }

      const adSets: MarketingAdSetData[] = rawAdSets.map((as: any) => {
        const asSpend = typeof as.spend === "number" ? as.spend : parseFloat(as.spend || 0);
        const asReach = parseInt(as.reach || 0);
        const asImpressions = parseInt(as.impressions || 0);
        const asClicks = parseInt(as.clicks || 0);
        const asMessages = parseInt(as.messages || 0);
        const asCarts = parseInt(as.carts || 0);
        const asCpc = as.cpc !== null && as.cpc !== undefined ? Number(as.cpc) : (asClicks > 0 ? asSpend / asClicks : 0);
        const asCtr = as.ctr !== null && as.ctr !== undefined ? Number(as.ctr) : (asImpressions > 0 ? (asClicks / asImpressions) * 100 : 0);
        const asFrequency = as.frequency !== null && as.frequency !== undefined ? Number(as.frequency) : (asReach > 0 && asImpressions > 0 ? asImpressions / asReach : 0);
        const asCostPerMsg = asMessages > 0 ? asSpend / asMessages : 0;

        const rawAds = Array.isArray(as.ads) ? as.ads : [];
        const ads: MarketingAdData[] = rawAds.map((ad: any) => {
          const adSpend = typeof ad.spend === "number" ? ad.spend : parseFloat(ad.spend || 0);
          const adReach = parseInt(ad.reach || 0);
          const adImpressions = parseInt(ad.impressions || 0);
          const adClicks = parseInt(ad.clicks || 0);
          const adMessages = parseInt(ad.messages || 0);
          const adCarts = parseInt(ad.carts || 0);
          const adCpc = ad.cpc !== null && ad.cpc !== undefined ? Number(ad.cpc) : (adClicks > 0 ? adSpend / adClicks : 0);
          const adCtr = ad.ctr !== null && ad.ctr !== undefined ? Number(ad.ctr) : (adImpressions > 0 ? (adClicks / adImpressions) * 100 : 0);
          const adFrequency = ad.frequency !== null && ad.frequency !== undefined ? Number(ad.frequency) : (adReach > 0 && adImpressions > 0 ? adImpressions / adReach : 0);
          const adCostPerMsg = adMessages > 0 ? adSpend / adMessages : 0;

          return {
            id: String(ad.id),
            adSetId: ad.adSetId ? String(ad.adSetId) : as.id,
            campaignId: ad.campaignId ? String(ad.campaignId) : camp.id,
            name: ad.name || "Sin nombre",
            status: ad.status || "PAUSED",
            spend: asSpend > 0 || adSpend > 0 ? adSpend : 0,
            reach: adReach,
            impressions: adImpressions,
            clicks: adClicks,
            cpc: adCpc,
            ctr: adCtr,
            frequency: adFrequency,
            messages: adMessages,
            carts: adCarts,
            costPerMsg: adCostPerMsg
          };
        });

        return {
          id: String(as.id),
          campaignId: as.campaignId ? String(as.campaignId) : camp.id,
          name: as.name || "Sin nombre",
          status: as.status || "PAUSED",
          spend: asSpend,
          reach: asReach,
          impressions: asImpressions,
          clicks: asClicks,
          cpc: asCpc,
          ctr: asCtr,
          frequency: asFrequency,
          messages: asMessages,
          carts: asCarts,
          costPerMsg: asCostPerMsg,
          ads
        };
      });

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
        status: camp.status || 'ACTIVE',
        adSets,
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

