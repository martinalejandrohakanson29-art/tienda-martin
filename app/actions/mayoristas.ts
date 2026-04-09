"use server"

// IMPORTANTE: prisma debe importarse entre llaves
import { prisma } from "@/lib/prisma" 
import { revalidatePath } from "next/cache"

// 1. Función para obtener todos los registros de la tabla NumerosMayoristas
export async function getMayoristas() {
    try {
        // CORRECCIÓN: Cambia 'NumerosMayoristas' por 'numerosMayoristas'
        const mayoristas = await prisma.numerosMayoristas.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        })
        return mayoristas
    } catch (error) {
        console.error("Error al obtener mayoristas:", error)
        return []
    }
}

// 2. Función para guardar un nuevo registro en la tabla NumerosMayoristas
export async function createMayorista(data: { nombre: string; telefono: string }) {
    try {
        const nuevoMayorista = await prisma.NumerosMayoristas.create({
            data: {
                nombre: data.nombre,
                telefono: data.telefono
            }
        })
        
        // Refrescamos la ruta para que la tabla visual se actualice automáticamente
        revalidatePath('/admin/chatwoot') 
        return { success: true, mayorista: nuevoMayorista }
    } catch (error) {
        console.error("Error al guardar en NumerosMayoristas:", error)
        throw new Error("No se pudo guardar el mayorista")
    }
}
