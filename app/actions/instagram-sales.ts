"use server"
import { prisma } from "@/lib/prisma"

export async function getInstagramSales() {
  try {
    // Traemos las ventas incluyendo sus artículos asociados
    const sales = await prisma.instagramSale.findMany({
      include: {
        articulos: true
      },
      orderBy: {
        fecha: "desc"
      }
    });

    // Convertimos los tipos Decimal de Prisma a Number para que el Frontend no tenga problemas
    return sales.map(sale => ({
      ...sale,
      total: Number(sale.total),
      envio: Number(sale.envio),
    }));
  } catch (error) {
    console.error("Error fetching Instagram sales:", error);
    return [];
  }
}
