"use server"
import { prisma } from "@/lib/prisma"

export async function getInstagramArticlesSummary() {
  try {
    // 1. Traemos todas las ventas para el total general y los envíos
    const allSales = await prisma.instagramSale.findMany();
    
    // Sumamos el total facturado y el total gastado en envíos
    const totalVentas = allSales.reduce((acc, sale) => acc + Number(sale.total), 0);
    const totalEnvios = allSales.reduce((acc, sale) => acc + Number(sale.envio || 0), 0);

    // 2. Traemos todos los ítems vendidos
    const allItems = await prisma.instagramSaleItem.findMany();

    // 3. Agrupamos por "detalle", sumando cantidad y monto recaudado
    // Usamos un objeto para guardar tanto la cantidad como el dinero por artículo
    const summaryMap: Record<string, { cantidad: number; recaudado: number }> = {};

    allItems.forEach((item) => {
      // IMPORTANTE: Ya no usamos .replace() porque 'cantidad' ahora es un número (Decimal)
      const cantidadNum = Number(item.cantidad);
      const precioNum = Number(item.precio_total || 0);
      
      if (summaryMap[item.detalle]) {
        summaryMap[item.detalle].cantidad += cantidadNum;
        summaryMap[item.detalle].recaudado += precioNum;
      } else {
        summaryMap[item.detalle] = {
          cantidad: cantidadNum,
          recaudado: precioNum
        };
      }
    });

    // 4. Convertimos el mapa en una lista para la tabla del frontend
    const articlesList = Object.entries(summaryMap).map(([detalle, data]) => ({
      detalle,
      cantidad: data.cantidad,
      recaudado: data.recaudado,
    })).sort((a, b) => b.cantidad - a.cantidad); // Ordenamos de más vendido a menos

    return {
      articles: articlesList,
      totalGeneral: totalVentas,
      totalEnvios: totalEnvios // Ahora devolvemos también el total de envíos
    };
  } catch (error) {
    console.error("Error al resumir artículos:", error);
    return { articles: [], totalGeneral: 0, totalEnvios: 0 };
  }
}
