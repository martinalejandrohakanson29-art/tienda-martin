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
  items?: MarketingCampaignItemData[]
  health?: CampaignHealthData
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
  items?: MarketingCampaignItemData[]
  health?: CampaignHealthData
}

export interface MarketingCampaignItemData {
  id: string
  campaignId: string
  adId?: string
  articuloId: string
  articulo: {
    id: string
    nombre: string
    precio: number
    costo: number
    stock: number
    esPack: boolean
  }
  unidadesVendidas: number
  facturacion: number
  costoTotal: number
  gananciaBruta: number
  totalVentasArticulo?: number
  totalFacturacionArticulo?: number
  anunciosCompartidosCount?: number
  pesoAtribucion?: number
}

export interface CampaignHealthData {
  unidadesVendidas: number
  facturacionReal: number
  costoMercaderia: number
  margenBruto: number
  margenNeto: number
  roasFacturacion: number
  poasMargen: number
  cpaReal: number
  conversionRate: number
  estadoSalud: "SALUDABLE" | "NEUTRO" | "CRITICO" | "SIN_VENTAS" | "SIN_ASIGNAR"
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
  items?: MarketingCampaignItemData[]
  health?: CampaignHealthData
  updatedAt?: Date | string
}

export interface PuntoVentaFilterItem {
  id: string
  nombre: string
  color?: string | null
  active?: boolean
}

export interface MarketingPerformanceResult {
  campaigns: MarketingCampaignData[]
  autoResponses: any[]
  puntosVenta: PuntoVentaFilterItem[]
  globalHealth: {
    totalSpend: number
    totalVentas: number
    totalFacturacion: number
    totalCosto: number
    totalMargenBruto: number
    totalMargenNeto: number
    globalRoas: number
    globalPoas: number
    globalCpa: number
    globalConversionRate: number
    totalMessages: number
  }
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

function getPresetDateRange(preset: string = "last_30d") {
  const now = new Date();
  const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      inicio.setDate(inicio.getDate() - 1);
      fin.setDate(fin.getDate() - 1);
      break;
    case "last_7d":
      inicio.setDate(inicio.getDate() - 7);
      break;
    case "last_14d":
      inicio.setDate(inicio.getDate() - 14);
      break;
    case "this_month":
      inicio = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    case "last_month":
      inicio = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      fin.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime());
      break;
    case "maximum":
      inicio = new Date(2020, 0, 1);
      break;
    case "last_30d":
    default:
      inicio.setDate(inicio.getDate() - 30);
      break;
  }

  return { inicio, fin };
}

export async function obtenerArticulosParaAsignacion() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      where: { oculto: false },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        precio: true,
        costo: true,
        stock: true,
        esPack: true
      }
    });

    return {
      success: true,
      data: articulos.map(a => ({
        id: a.id,
        nombre: a.nombre,
        precio: Number(a.precio),
        costo: Number(a.costo || 0),
        stock: a.stock,
        esPack: a.esPack || false
      }))
    };
  } catch (error: any) {
    console.error("Error al obtener artículos para asignación:", error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function vincularArticulosACampana(
  campaignId: string, 
  articuloIds: string[], 
  adId?: string | null
) {
  try {
    if (!campaignId) throw new Error("ID de campaña no especificado");

    await prisma.$transaction(async (tx) => {
      // 1. Borramos vinculaciones previas del adId o de la campaña
      if (adId) {
        await tx.marketingCampaignItem.deleteMany({
          where: { campaignId, adId }
        });
      } else {
        await tx.marketingCampaignItem.deleteMany({
          where: { campaignId, adId: null }
        });
      }

      // 2. Insertamos las nuevas vinculaciones
      if (articuloIds && articuloIds.length > 0) {
        const uniqueIds = Array.from(new Set(articuloIds));
        await tx.marketingCampaignItem.createMany({
          data: uniqueIds.map(articuloId => ({
            campaignId,
            adId: adId || null,
            articuloId
          }))
        });
      }
    });

    revalidatePath("/admin/instagram");
    return { success: true };
  } catch (error: any) {
    console.error("Error al vincular artículos a campaña/anuncio:", error);
    return { success: false, error: error.message };
  }
}

export async function getMarketingPerformance(options?: {
  datePreset?: string
  fechaDesde?: string
  fechaHasta?: string
  puntoVentaIds?: string[]
}): Promise<MarketingPerformanceResult> {
  try {
    const datePreset = options?.datePreset || "last_30d";

    // 1. Puntos de venta
    const allPuntosVenta = await prisma.puntoVenta.findMany({
      orderBy: { nombre: 'asc' }
    });

    // Puntos de venta activos: si no se pasan, por defecto "Instagram" y "Mostrador"
    let activePvIds = options?.puntoVentaIds;
    if (!activePvIds || activePvIds.length === 0) {
      const defaultPvs = allPuntosVenta.filter(pv => {
        const nom = pv.nombre.toLowerCase();
        return nom.includes("instagram") || nom.includes("mostrador");
      });
      activePvIds = defaultPvs.length > 0 ? defaultPvs.map(p => p.id) : allPuntosVenta.map(p => p.id);
    }

    const puntosVentaFormatted: PuntoVentaFilterItem[] = allPuntosVenta.map(pv => ({
      id: pv.id,
      nombre: pv.nombre,
      color: pv.color,
      active: activePvIds!.includes(pv.id)
    }));

    // 2. Rango de fechas para el cruce de ventas
    let { inicio, fin } = getPresetDateRange(datePreset);
    if (options?.fechaDesde && options?.fechaHasta) {
      inicio = new Date(`${options.fechaDesde}T00:00:00-03:00`);
      fin = new Date(`${options.fechaHasta}T23:59:59.999-03:00`);
    }

    // 3. Traemos datos de DB en paralelo
    const [campaignsDB, autoResponses, ventas, packsDef, todosArticulos] = await Promise.all([
      prisma.marketingCampaign.findMany({
        include: {
          items: {
            include: {
              articulo: {
                select: {
                  id: true,
                  nombre: true,
                  precio: true,
                  costo: true,
                  stock: true,
                  esPack: true
                }
              }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.marketingAutoResponse.findMany(),
      prisma.venta.findMany({
        where: {
          tipoVenta: { not: "PEDIDO" },
          estadoPedido: { not: "CANCELADO" },
          createdAt: { gte: inicio, lte: fin },
          ...(activePvIds.length > 0 ? { puntoVentaId: { in: activePvIds } } : {})
        },
        include: { items: true }
      }),
      prisma.articuloMostrador.findMany({
        where: { esPack: true },
        include: { packItems: true }
      }),
      prisma.articuloMostrador.findMany({
        select: { id: true, nombre: true, precio: true, costo: true, esPack: true }
      })
    ]);

    // 4. Mapeo de artículos y reconstrucción de packs
    type ArticuloItemType = { id: string; nombre: string; precio: any; costo: any; esPack: boolean | null };
    const articuloById = new Map<string, ArticuloItemType>(todosArticulos.map(a => [a.id, a]));
    const articuloByNombre = new Map<string, ArticuloItemType>(todosArticulos.map(a => [a.nombre.toLowerCase().trim(), a]));

    const packs = packsDef
      .filter(p => p.packItems.length > 0)
      .map(p => ({
        id: p.id,
        nombre: p.nombre,
        componentes: p.packItems.map(pi => ({ componenteId: pi.componenteId, cantidad: pi.cantidad })),
        totalComponentes: p.packItems.reduce((s, pi) => s + pi.cantidad, 0),
      }))
      .sort((a, b) => b.totalComponentes - a.totalComponentes);

    // Contenedor de ventas por ID de artículo/pack
    const salesByProductKey: Record<string, { cantidad: number; facturacion: number; nombre: string }> = {};

    const acumularVenta = (key: string, nombre: string, cantidad: number, monto: number) => {
      if (!salesByProductKey[key]) {
        salesByProductKey[key] = { cantidad: 0, facturacion: 0, nombre };
      }
      salesByProductKey[key].cantidad += cantidad;
      salesByProductKey[key].facturacion += monto;
    };

    for (const venta of ventas) {
      const disp: Record<string, { qty: number; monto: number; nombre: string }> = {};

      for (const item of venta.items) {
        if (item.esNota) continue;

        // Pack vendido directamente
        if (item.productoId?.startsWith("PACK-")) {
          // Buscamos si coincide con algún pack por nombre
          const matchPack = packsDef.find(p => p.nombre.toLowerCase().trim() === item.nombre.toLowerCase().trim());
          const packKey = matchPack ? matchPack.id : item.nombre.toLowerCase().trim();
          acumularVenta(packKey, item.nombre, item.cantidad, Number(item.subtotal));
          continue;
        }

        const pid = item.productoId;
        if (!pid) {
          // Sin ID, acumulamos por nombre
          const matchArt = articuloByNombre.get(item.nombre.toLowerCase().trim());
          const artKey = matchArt ? matchArt.id : item.nombre.toLowerCase().trim();
          acumularVenta(artKey, item.nombre, item.cantidad, Number(item.subtotal));
          continue;
        }

        if (!disp[pid]) disp[pid] = { qty: 0, monto: 0, nombre: item.nombre };
        disp[pid].qty += item.cantidad;
        disp[pid].monto += Number(item.subtotal);
      }

      // Reconstruir packs vendidos por componentes
      for (const pack of packs) {
        let copias = Infinity;
        for (const comp of pack.componentes) {
          const d = disp[comp.componenteId];
          const posibles = d ? Math.floor(d.qty / comp.cantidad) : 0;
          if (posibles < copias) copias = posibles;
          if (copias === 0) break;
        }
        if (!isFinite(copias) || copias <= 0) continue;

        let montoPack = 0;
        for (const comp of pack.componentes) {
          const d = disp[comp.componenteId];
          const consumir = comp.cantidad * copias;
          const precioUnit = d.qty > 0 ? d.monto / d.qty : 0;
          const montoConsumido = precioUnit * consumir;
          d.qty -= consumir;
          d.monto -= montoConsumido;
          montoPack += montoConsumido;
        }
        acumularVenta(pack.id, pack.nombre, copias, montoPack);
      }

      // Componentes restantes
      for (const [pid, d] of Object.entries(disp)) {
        if (d.qty > 0) acumularVenta(pid, d.nombre, d.qty, d.monto);
      }
    }

    // Costos unitarios de packs (suma de componentes)
    const costoPackMap = new Map<string, number>();
    for (const p of packsDef) {
      let costTotal = 0;
      for (const pi of p.packItems) {
        const comp = articuloById.get(pi.componenteId);
        const compCosto = comp ? Number(comp.costo || 0) : 0;
        costTotal += compCosto * pi.cantidad;
      }
      costoPackMap.set(p.id, costTotal);
    }

    // 5. Adaptamos campañas y calculamos métricas de salud
    let totalSpendGlobal = 0;
    let totalVentasGlobal = 0;
    let totalFacturacionGlobal = 0;
    let totalCostoGlobal = 0;
    let totalMessagesGlobal = 0;

    const campaigns: MarketingCampaignData[] = campaignsDB.map(camp => {
      const spend = Number(camp.spend);
      const reach = camp.reach || 0;
      const impressions = camp.impressions || 0;
      const clicks = camp.clicks || 0;
      const messages = camp.messages || 0;
      const carts = camp.carts || 0;

      totalSpendGlobal += spend;
      totalMessagesGlobal += messages;

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

      // Helper para calcular métricas de salud
      const computeHealth = (items: MarketingCampaignItemData[], spend: number, messages: number): CampaignHealthData => {
        const unidadesVendidas = items.reduce((acc, it) => acc + it.unidadesVendidas, 0);
        const facturacionReal = items.reduce((acc, it) => acc + it.facturacion, 0);
        const costoMercaderia = items.reduce((acc, it) => acc + it.costoTotal, 0);
        const margenBruto = facturacionReal - costoMercaderia;
        const margenNeto = margenBruto - spend;

        const roasFacturacion = spend > 0 ? facturacionReal / spend : (facturacionReal > 0 ? 999 : 0);
        const poasMargen = spend > 0 ? margenBruto / spend : (margenBruto > 0 ? 999 : 0);
        const cpaReal = unidadesVendidas > 0 ? spend / unidadesVendidas : 0;
        const conversionRate = messages > 0 ? (unidadesVendidas / messages) * 100 : 0;

        let estadoSalud: CampaignHealthData["estadoSalud"] = "SIN_ASIGNAR";
        if (items.length === 0) {
          estadoSalud = "SIN_ASIGNAR";
        } else if (spend === 0 && unidadesVendidas === 0) {
          estadoSalud = "NEUTRO";
        } else if (spend > 0 && unidadesVendidas === 0) {
          estadoSalud = "SIN_VENTAS";
        } else if (poasMargen >= 1.5) {
          estadoSalud = "SALUDABLE";
        } else if (poasMargen >= 1.0) {
          estadoSalud = "NEUTRO";
        } else {
          estadoSalud = "CRITICO";
        }

        return {
          unidadesVendidas,
          facturacionReal,
          costoMercaderia,
          margenBruto,
          margenNeto,
          roasFacturacion,
          poasMargen,
          cpaReal,
          conversionRate,
          estadoSalud
        };
      };

      // Todos los items asociados a esta campaña en la DB
      const allDbItems = (camp.items || []);

      // Parsear adSets y sus anuncios
      let rawAdSets: any[] = [];
      if (camp.adSets) {
        if (Array.isArray(camp.adSets)) {
          rawAdSets = camp.adSets;
        } else if (typeof camp.adSets === "string") {
          try { rawAdSets = JSON.parse(camp.adSets); } catch (e) {}
        }
      }

      // Mapa de todos los anuncios de la campaña para saber el gasto de cada uno
      const allAdsList: { id: string; spend: number }[] = [];
      rawAdSets.forEach((as: any) => {
        const rawAds = Array.isArray(as.ads) ? as.ads : [];
        rawAds.forEach((ad: any) => {
          const adSpend = typeof ad.spend === "number" ? ad.spend : parseFloat(ad.spend || 0);
          allAdsList.push({ id: String(ad.id), spend: adSpend });
        });
      });

      // Mapear qué anuncios promocionan cada artículo para prorratear las ventas equitativa o proporcionalmente al gasto
      const adsByArticuloMap = new Map<string, { id: string; spend: number }[]>();
      allDbItems.forEach(it => {
        if (it.adId) {
          const adInfo = allAdsList.find(a => a.id === it.adId) || { id: it.adId, spend: 0 };
          const list = adsByArticuloMap.get(it.articuloId) || [];
          if (!list.some(a => a.id === it.adId)) {
            list.push(adInfo);
          }
          adsByArticuloMap.set(it.articuloId, list);
        }
      });

      // Helper para mapear un item de la DB a un anuncio o a la campaña
      const mapItemForTarget = (ci: any, targetSpend?: number, isCampaignLevel = false): MarketingCampaignItemData => {
        const art = ci.articulo;
        const artCostoUnit = art.esPack ? (costoPackMap.get(art.id) || Number(art.costo || 0)) : Number(art.costo || 0);
        const saleData = salesByProductKey[art.id] || salesByProductKey[art.nombre.toLowerCase().trim()] || { cantidad: 0, facturacion: 0, nombre: art.nombre };
        
        const totalVentasArticulo = saleData.cantidad;
        const totalFacturacionArticulo = saleData.facturacion;

        // Si es a nivel campaña, se toma el 100% de la venta (sin dividir)
        // Si es a nivel anuncio, se calcula la proporción entre los anuncios que comparten este artículo
        let pesoAtribucion = 1;
        const sharingAds = adsByArticuloMap.get(ci.articuloId) || [];
        const anunciosCompartidosCount = sharingAds.length;

        if (!isCampaignLevel && anunciosCompartidosCount > 1 && ci.adId) {
          const totalSpendSharing = sharingAds.reduce((acc, a) => acc + a.spend, 0);
          const currentAdSpend = targetSpend !== undefined ? targetSpend : (sharingAds.find(a => a.id === ci.adId)?.spend || 0);
          
          if (totalSpendSharing > 0) {
            pesoAtribucion = currentAdSpend / totalSpendSharing;
          } else {
            pesoAtribucion = 1 / anunciosCompartidosCount;
          }
        }

        const unidadesVendidas = Number((totalVentasArticulo * pesoAtribucion).toFixed(2));
        const facturacion = Number((totalFacturacionArticulo * pesoAtribucion).toFixed(2));
        const costoTotal = Number((unidadesVendidas * artCostoUnit).toFixed(2));
        const gananciaBruta = Number((facturacion - costoTotal).toFixed(2));

        return {
          id: ci.id,
          campaignId: ci.campaignId,
          adId: ci.adId || undefined,
          articuloId: ci.articuloId,
          articulo: {
            id: art.id,
            nombre: art.nombre,
            precio: Number(art.precio),
            costo: artCostoUnit,
            stock: art.stock,
            esPack: art.esPack || false
          },
          unidadesVendidas,
          facturacion,
          costoTotal,
          gananciaBruta,
          totalVentasArticulo,
          totalFacturacionArticulo,
          anunciosCompartidosCount,
          pesoAtribucion
        };
      };

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

          // Artículos asignados a este anuncio específico
          const adDbItems = allDbItems.filter(it => it.adId === String(ad.id));
          const adItems = adDbItems.map(it => mapItemForTarget(it, adSpend, false));
          const adHealth = computeHealth(adItems, adSpend, adMessages);

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
            updatedTime: ad.updatedTime || ad.updated_time,
            items: adItems,
            health: adHealth
          };
        });

        // Items del AdSet: sumamos los items de sus anuncios hijos
        const adSetItems = ads.flatMap(a => a.items || []);
        const adSetHealth = computeHealth(adSetItems, asSpend, asMessages);

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
          ads,
          items: adSetItems,
          health: adSetHealth
        };
      });

      // Para la campaña: tomamos cada artículo asignado una sola vez al 100% de la venta real
      const uniqueArticulosCampMap = new Map<string, any>();
      allDbItems.forEach(ci => {
        if (!uniqueArticulosCampMap.has(ci.articuloId)) {
          uniqueArticulosCampMap.set(ci.articuloId, ci);
        }
      });
      const campaignItems = Array.from(uniqueArticulosCampMap.values()).map(ci => mapItemForTarget(ci, spend, true));
      const health = computeHealth(campaignItems, spend, messages);

      totalVentasGlobal += health.unidadesVendidas;
      totalFacturacionGlobal += health.facturacionReal;
      totalCostoGlobal += health.costoMercaderia;

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
        items: campaignItems,
        health,
        updatedAt: camp.updatedAt
      };
    });

    const totalMargenBrutoGlobal = totalFacturacionGlobal - totalCostoGlobal;
    const totalMargenNetoGlobal = totalMargenBrutoGlobal - totalSpendGlobal;
    const globalRoas = totalSpendGlobal > 0 ? totalFacturacionGlobal / totalSpendGlobal : (totalFacturacionGlobal > 0 ? 999 : 0);
    const globalPoas = totalSpendGlobal > 0 ? totalMargenBrutoGlobal / totalSpendGlobal : (totalMargenBrutoGlobal > 0 ? 999 : 0);
    const globalCpa = totalVentasGlobal > 0 ? totalSpendGlobal / totalVentasGlobal : 0;
    const globalConversionRate = totalMessagesGlobal > 0 ? (totalVentasGlobal / totalMessagesGlobal) * 100 : 0;

    return {
      campaigns,
      autoResponses,
      puntosVenta: puntosVentaFormatted,
      globalHealth: {
        totalSpend: totalSpendGlobal,
        totalVentas: totalVentasGlobal,
        totalFacturacion: totalFacturacionGlobal,
        totalCosto: totalCostoGlobal,
        totalMargenBruto: totalMargenBrutoGlobal,
        totalMargenNeto: totalMargenNetoGlobal,
        globalRoas,
        globalPoas,
        globalCpa,
        globalConversionRate,
        totalMessages: totalMessagesGlobal
      }
    };
  } catch (error) {
    console.error("Error al obtener marketing con salud:", error);
    return {
      campaigns: [],
      autoResponses: [],
      puntosVenta: [],
      globalHealth: {
        totalSpend: 0,
        totalVentas: 0,
        totalFacturacion: 0,
        totalCosto: 0,
        totalMargenBruto: 0,
        totalMargenNeto: 0,
        globalRoas: 0,
        globalPoas: 0,
        globalCpa: 0,
        globalConversionRate: 0,
        totalMessages: 0
      }
    };
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

    const updatedData = await getMarketingPerformance({ datePreset });
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


