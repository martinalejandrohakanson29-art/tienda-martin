"use server"
import { prisma } from "@/lib/prisma"

export async function getInstagramArticlesSummary() {
  try {
    // 1. Traemos todas las ventas para el total general
    const allSales = await prisma.instagramSale.findMany();
    const totalVentas = allSales.reduce((acc, sale) => acc + Number(sale.total), 0);

    // 2. Traemos todos los ítems vendidos
    const allItems = await prisma.instagramSaleItem.findMany();

    // 3. Agrupamos y sumamos por "detalle" (nombre del artículo)
    const summaryMap: Record<string, number> = {};

    allItems.forEach((item) => {
      // Convertimos "2,00" -> 2
      const cantidadNum = parseFloat(item.cantidad.replace(",", "."));
      
      if (summaryMap[item.detalle]) {
        summaryMap[item.detalle] += cantidadNum;
      } else {
        summaryMap[item.detalle] = cantidadNum;
      }
    });

    // 4. Convertimos el mapa en una lista para la tabla
    const articlesList = Object.entries(summaryMap).map(([detalle, cantidad]) => ({
      detalle,
      cantidad,
    })).sort((a, b) => b.cantidad - a.cantidad); // Ordenamos de más vendido a menos

    return {
      articles: articlesList,
      totalGeneral: totalVentas
    };
  } catch (error) {
    console.error("Error al resumir artículos:", error);
    return { articles: [], totalGeneral: 0 };
  }
}
