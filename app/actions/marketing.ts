"use server"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

const N8N_SYNC_MARKETING_URL = process.env.N8N_WEBHOOK_SYNC_MARKETING || "https://n8n.revolucionmotos.tech/webhook/sincronizar-marketing";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "Bearer EAAUmeCFZB4bQBQoH2Alcc5LT1yUoSLC3RwjcYjz4H4Rq8PIdUtZCThr9QWkQyWZAwA1LVXOZA2wuELPeEJgkHf9BZCXeY2xHCMVIb8DINOZAJGq3DjgYMk2CTfa1OuMj9xy6uZC6yJBTR1XPY5jxk1ryfCb1qd0i4oLc5xMyhcTMOOpeZAKH695QGS9VS83omYOF7gZDZD";
const META_AD_ACCOUNT = "act_1382686226631627";

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
  cpm?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  createdTime?: string
  updatedTime?: string
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
  cpm?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  createdTime?: string
  startTime?: string
  updatedTime?: string
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
  cpm?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  createdTime?: string
  startTime?: string
  updatedTime?: string
  dateStart?: string
  dateStop?: string
  datePreset?: string
  adSets?: MarketingAdSetData[]
  updatedAt?: Date | string
}

function parseActions(actions: any[] = []) {
  actions = Array.isArray(actions) ? actions : [];
  const msgObj = actions.find(a => 
    a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
    a.action_type === 'onsite_conversion.messaging_first_reply' ||
    a.action_type === 'onsite_conversion.total_messaging_connection'
  ) || actions.find(a => a.action_type && typeof a.action_type === "string" && a.action_type.includes('messaging'));
  const messages = msgObj ? parseInt(msgObj.value) || 0 : 0;

  const cartObj = actions.find(a => 
    a.action_type === 'add_to_cart' || 
    a.action_type === 'offsite_conversion.fb_pixel_add_to_cart' ||
    a.action_type === 'omni_add_to_cart'
  );
  const carts = cartObj ? parseInt(cartObj.value) || 0 : 0;

  return { messages, carts };
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

      const cpm = camp.cpm !== null && camp.cpm !== undefined
        ? Number(camp.cpm)
        : (impressions > 0 ? (spend / impressions) * 1000 : 0);

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
        const asCpm = as.cpm !== null && as.cpm !== undefined ? Number(as.cpm) : (asImpressions > 0 ? (asSpend / asImpressions) * 1000 : 0);
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
          const adCpm = ad.cpm !== null && ad.cpm !== undefined ? Number(ad.cpm) : (adImpressions > 0 ? (adSpend / adImpressions) * 1000 : 0);
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
            cpm: adCpm,
            ctr: adCtr,
            frequency: adFrequency,
            messages: adMessages,
            carts: adCarts,
            costPerMsg: adCostPerMsg,
            createdTime: ad.createdTime || ad.created_time,
            updatedTime: ad.updatedTime || ad.updated_time
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
          cpm: asCpm,
          ctr: asCtr,
          frequency: asFrequency,
          messages: asMessages,
          carts: asCarts,
          costPerMsg: asCostPerMsg,
          createdTime: as.createdTime || as.created_time,
          startTime: as.startTime || as.start_time,
          updatedTime: as.updatedTime || as.updated_time,
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
        cpm,
        ctr,
        frequency,
        messages,
        carts,
        costPerMsg,
        status: camp.status || 'ACTIVE',
        createdTime: camp.createdTime ? camp.createdTime.toISOString() : undefined,
        startTime: camp.startTime ? camp.startTime.toISOString() : undefined,
        dateStart: camp.dateStart ? camp.dateStart.toISOString().split('T')[0] : undefined,
        dateStop: camp.dateStop ? camp.dateStop.toISOString().split('T')[0] : undefined,
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

/**
 * Consulta la API de Meta Graph directamente en tiempo real con un período / preset específico
 * y actualiza la base de datos PostgreSQL de forma atómica.
 */
export async function consultarMarketingMetaDirecto(datePreset: string = "last_30d") {
  try {
    const authHeader = META_ACCESS_TOKEN.startsWith("Bearer ") ? META_ACCESS_TOKEN : `Bearer ${META_ACCESS_TOKEN}`;

    const [campaignsRes, adsetsRes, adsRes, adInsightsRes, campaignInsightsRes] = await Promise.all([
      fetch(`https://graph.facebook.com/v19.0/${META_AD_ACCOUNT}/campaigns?fields=id,name,status,effective_status,objective,created_time,start_time,stop_time,updated_time&limit=500`, { 
        headers: { 'Authorization': authHeader },
        cache: 'no-store' 
      }),
      fetch(`https://graph.facebook.com/v19.0/${META_AD_ACCOUNT}/adsets?fields=id,name,status,effective_status,campaign_id,created_time,start_time,updated_time&limit=500`, { 
        headers: { 'Authorization': authHeader },
        cache: 'no-store' 
      }),
      fetch(`https://graph.facebook.com/v19.0/${META_AD_ACCOUNT}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,created_time,updated_time&limit=500`, { 
        headers: { 'Authorization': authHeader },
        cache: 'no-store' 
      }),
      fetch(`https://graph.facebook.com/v19.0/${META_AD_ACCOUNT}/insights?fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,inline_link_clicks,actions,cpc,cpm,cost_per_inline_link_click,ctr,inline_link_click_ctr,frequency,objective,date_start,date_stop&date_preset=${datePreset}&level=ad&limit=500`, { 
        headers: { 'Authorization': authHeader },
        cache: 'no-store' 
      }),
      fetch(`https://graph.facebook.com/v19.0/${META_AD_ACCOUNT}/insights?fields=campaign_id,campaign_name,spend,reach,impressions,inline_link_clicks,actions,cpc,cpm,cost_per_inline_link_click,ctr,inline_link_click_ctr,frequency,objective,date_start,date_stop&date_preset=${datePreset}&level=campaign&limit=500`, { 
        headers: { 'Authorization': authHeader },
        cache: 'no-store' 
      }),
    ]);

    const campaignsMeta = (await campaignsRes.json()).data || [];
    const adsetsMeta = (await adsetsRes.json()).data || [];
    const adsMeta = (await adsRes.json()).data || [];
    const adInsights = (await adInsightsRes.json()).data || [];
    const campaignInsights = (await campaignInsightsRes.json()).data || [];

    const adsData = adsMeta.map((ad: any) => {
      const insight = adInsights.find((i: any) => i.ad_id === ad.id);
      const spend = parseFloat(insight ? insight.spend : 0) || 0;
      const reach = parseInt(insight ? insight.reach : 0) || 0;
      const impressions = parseInt(insight ? insight.impressions : 0) || 0;
      const clicks = parseInt(insight ? (insight.inline_link_clicks || insight.clicks) : 0) || 0;
      const actions = (insight && insight.actions) || [];
      const parsed = parseActions(actions);
      const cpc = insight && insight.cpc ? parseFloat(insight.cpc) : (clicks > 0 ? spend / clicks : null);
      const cpm = insight && insight.cpm ? parseFloat(insight.cpm) : (impressions > 0 ? (spend / impressions) * 1000 : null);
      const ctr = insight && insight.ctr ? parseFloat(insight.ctr) : (impressions > 0 ? (clicks / impressions) * 100 : null);
      const frequency = insight && insight.frequency ? parseFloat(insight.frequency) : (reach > 0 && impressions > 0 ? impressions / reach : null);
      const costPerMsg = parsed.messages > 0 ? spend / parsed.messages : 0;

      return {
        id: ad.id,
        adSetId: ad.adset_id,
        campaignId: ad.campaign_id,
        name: ad.name || "Sin nombre",
        status: ad.effective_status || ad.status || "PAUSED",
        spend: Number(spend.toFixed(2)),
        reach,
        impressions,
        clicks,
        cpc: cpc !== null && !isNaN(cpc) ? Number(cpc.toFixed(2)) : null,
        cpm: cpm !== null && !isNaN(cpm) ? Number(cpm.toFixed(2)) : null,
        ctr: ctr !== null && !isNaN(ctr) ? Number(ctr.toFixed(2)) : null,
        frequency: frequency !== null && !isNaN(frequency) ? Number(frequency.toFixed(2)) : null,
        messages: parsed.messages,
        carts: parsed.carts,
        costPerMsg: Number(costPerMsg.toFixed(2)),
        createdTime: ad.created_time,
        updatedTime: ad.updated_time,
        actions
      };
    });

    const adsetsData = adsetsMeta.map((as: any) => {
      const childAds = adsData.filter((a: any) => a.adSetId === as.id);
      const spend = childAds.reduce((acc: number, a: any) => acc + a.spend, 0);
      const reach = childAds.reduce((acc: number, a: any) => acc + a.reach, 0);
      const impressions = childAds.reduce((acc: number, a: any) => acc + a.impressions, 0);
      const clicks = childAds.reduce((acc: number, a: any) => acc + a.clicks, 0);
      const messages = childAds.reduce((acc: number, a: any) => acc + a.messages, 0);
      const carts = childAds.reduce((acc: number, a: any) => acc + a.carts, 0);
      const cpc = clicks > 0 ? spend / clicks : null;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
      const frequency = reach > 0 && impressions > 0 ? impressions / reach : null;
      const costPerMsg = messages > 0 ? spend / messages : 0;

      return {
        id: as.id,
        campaignId: as.campaign_id,
        name: as.name || "Sin nombre",
        status: as.effective_status || as.status || "PAUSED",
        spend: Number(spend.toFixed(2)),
        reach,
        impressions,
        clicks,
        cpc: cpc !== null && !isNaN(cpc) ? Number(cpc.toFixed(2)) : null,
        cpm: cpm !== null && !isNaN(cpm) ? Number(cpm.toFixed(2)) : null,
        ctr: ctr !== null && !isNaN(ctr) ? Number(ctr.toFixed(2)) : null,
        frequency: frequency !== null && !isNaN(frequency) ? Number(frequency.toFixed(2)) : null,
        messages,
        carts,
        costPerMsg: Number(costPerMsg.toFixed(2)),
        createdTime: as.created_time,
        startTime: as.start_time,
        updatedTime: as.updated_time,
        ads: childAds
      };
    });

    const campaignsData = campaignsMeta.map((camp: any) => {
      const insight = campaignInsights.find((i: any) => i.campaign_id === camp.id);
      const childAdsets = adsetsData.filter((as: any) => as.campaignId === camp.id);

      const spend = insight ? parseFloat(insight.spend || 0) : childAdsets.reduce((acc: number, as: any) => acc + as.spend, 0);
      const reach = insight ? parseInt(insight.reach || 0) : childAdsets.reduce((acc: number, as: any) => acc + as.reach, 0);
      const impressions = insight ? parseInt(insight.impressions || 0) : childAdsets.reduce((acc: number, as: any) => acc + as.impressions, 0);
      const clicks = insight ? parseInt(insight.inline_link_clicks || insight.clicks || 0) : childAdsets.reduce((acc: number, as: any) => acc + as.clicks, 0);
      const actions = (insight && insight.actions) || [];
      const parsed = parseActions(actions);
      const messages = parsed.messages || childAdsets.reduce((acc: number, as: any) => acc + as.messages, 0);
      const carts = parsed.carts || childAdsets.reduce((acc: number, as: any) => acc + as.carts, 0);
      const cpc = insight && insight.cpc ? parseFloat(insight.cpc) : (clicks > 0 ? spend / clicks : null);
      const cpm = insight && insight.cpm ? parseFloat(insight.cpm) : (impressions > 0 ? (spend / impressions) * 1000 : null);
      const ctr = insight && insight.ctr ? parseFloat(insight.ctr) : (impressions > 0 ? (clicks / impressions) * 100 : null);
      const frequency = insight && insight.frequency ? parseFloat(insight.frequency) : (reach > 0 && impressions > 0 ? impressions / reach : null);
      const costPerMsg = messages > 0 ? spend / messages : 0;

      const dateStart = insight?.date_start ? new Date(insight.date_start) : undefined;
      const dateStop = insight?.date_stop ? new Date(insight.date_stop) : undefined;
      const createdTime = camp.created_time ? new Date(camp.created_time) : undefined;
      const startTime = camp.start_time ? new Date(camp.start_time) : undefined;

      return {
        id: camp.id,
        name: camp.name || "Sin nombre",
        status: camp.effective_status || camp.status || "PAUSED",
        spend: Number(spend.toFixed(2)),
        reach,
        impressions,
        clicks,
        cpc: cpc !== null && !isNaN(cpc) ? Number(cpc.toFixed(2)) : null,
        cpm: cpm !== null && !isNaN(cpm) ? Number(cpm.toFixed(2)) : null,
        ctr: ctr !== null && !isNaN(ctr) ? Number(ctr.toFixed(2)) : null,
        frequency: frequency !== null && !isNaN(frequency) ? Number(frequency.toFixed(2)) : null,
        messages,
        carts,
        costPerMsg: Number(costPerMsg.toFixed(2)),
        createdTime,
        startTime,
        dateStart,
        dateStop,
        datePreset,
        rawActions: actions,
        adSets: childAdsets
      };
    });

    // Guardar en la DB
    for (const camp of campaignsData) {
      await prisma.marketingCampaign.upsert({
        where: { id: camp.id.toString() },
        update: {
          name: camp.name,
          spend: camp.spend,
          reach: camp.reach,
          impressions: camp.impressions,
          clicks: camp.clicks,
          cpc: camp.cpc,
          cpm: camp.cpm,
          ctr: camp.ctr,
          frequency: camp.frequency,
          messages: camp.messages,
          carts: camp.carts,
          rawActions: camp.rawActions,
          adSets: camp.adSets,
          status: camp.status,
          createdTime: camp.createdTime,
          startTime: camp.startTime,
          dateStart: camp.dateStart,
          dateStop: camp.dateStop
        },
        create: {
          id: camp.id.toString(),
          name: camp.name,
          spend: camp.spend,
          reach: camp.reach,
          impressions: camp.impressions,
          clicks: camp.clicks,
          cpc: camp.cpc,
          cpm: camp.cpm,
          ctr: camp.ctr,
          frequency: camp.frequency,
          messages: camp.messages,
          carts: camp.carts,
          rawActions: camp.rawActions,
          adSets: camp.adSets,
          status: camp.status,
          createdTime: camp.createdTime,
          startTime: camp.startTime,
          dateStart: camp.dateStart,
          dateStop: camp.dateStop
        }
      });
    }

    revalidatePath("/admin/instagram");
    revalidatePath("/admin/marketing");

    const updatedData = await getMarketingPerformance();
    return { 
      success: true, 
      data: updatedData,
      dateStart: campaignInsights[0]?.date_start,
      dateStop: campaignInsights[0]?.date_stop,
      datePreset
    };
  } catch (error: any) {
    console.error("Error al consultar Meta directamente:", error);
    return { success: false, error: error.message || "Error al conectar con Meta Graph API" };
  }
}

export async function sincronizarMarketingWorkflow(datePreset: string = "last_30d") {
  // Realizamos consulta directa a Meta para máxima velocidad y flexibilidad de fecha
  return await consultarMarketingMetaDirecto(datePreset);
}


