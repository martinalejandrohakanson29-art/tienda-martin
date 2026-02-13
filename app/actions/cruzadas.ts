"use server";

import prisma from "@/lib/prisma";

export async function getTransferenciasCruzadas() {
  try {
    const transferencias = await prisma.transferenciaCruzada.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    // Convertimos los Decimal a Number para que Next.js no dé error al pasarlos al cliente
    return JSON.parse(JSON.stringify(transferencias));
  } catch (error) {
    console.error("Error al obtener transferencias:", error);
    return [];
  }
}
