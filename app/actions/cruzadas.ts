"use server";

// El cambio principal está aquí: agregamos las llaves { prisma }
import { prisma } from "@/lib/prisma"; 

export async function getTransferenciasCruzadas() {
  try {
    const transferencias = await prisma.transferenciaCruzada.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    
    // Prisma devuelve objetos Decimal que no se pueden pasar directamente 
    // a un Client Component, por eso usamos este truco para serializarlos.
    return JSON.parse(JSON.stringify(transferencias));
  } catch (error) {
    console.error("Error al obtener transferencias:", error);
    return [];
  }
}
