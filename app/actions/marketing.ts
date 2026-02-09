"use server"
import { prisma } from "@/lib/prisma"

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
    const campaigns = campaignsDB.map(camp => ({
      id: camp.id,
      name: camp.name,
      spend: Number(camp.spend),
      reach: camp.reach,
      messages: camp.messages,
      carts: camp.carts,
      // Calculamos el costo por mensaje en el momento
      costPerMsg: camp.messages > 0 ? Number(camp.spend) / camp.messages : 0,
      status: camp.status
    }));

    return { campaigns, autoResponses };
  } catch (error) {
    console.error("Error al obtener marketing:", error);
    return { campaigns: [], autoResponses: [] };
  }
}
