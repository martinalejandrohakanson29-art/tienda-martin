"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

// 1. Función para obtener todos los registros de la tabla NumerosMayoristas
export async function getMayoristas() {
    try {
        const mayoristas = await prisma.numerosMayoristas.findMany({
            orderBy: {
                createdAt: 'desc' // Ordena del más nuevo al más viejo
            }
        })
        return mayoristas
    } catch (error) {
        console.error("Error al obtener la lista de NumerosMayoristas:", error)
        return []
    }
}

// 2. Función para guardar un nuevo registro en la tabla NumerosMayoristas
export async function createMayorista(data: { nombre: string; telefono: string }) {
    try {
        const nuevoMayorista = await prisma.numerosMayoristas.create({
            data: {
                nombre: data.nombre,
                telefono: data.telefono
            }
        })
        
        // Refrescamos la ruta para que la tabla visual se actualice
        revalidatePath('/admin/chatwoot') 
        return { success: true, mayorista: nuevoMayorista }
    } catch (error) {
        console.error("Error al guardar en NumerosMayoristas:", error)
        throw new Error("No se pudo guardar el mayorista")
    }
}
