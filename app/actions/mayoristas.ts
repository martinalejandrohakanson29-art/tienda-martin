"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

// Función para obtener todos los mayoristas
export async function getMayoristas() {
    try {
        const mayoristas = await prisma.mayorista.findMany({
            orderBy: {
                createdAt: 'desc' // Los ordenamos para que los más nuevos salgan primero
            }
        })
        return mayoristas
    } catch (error) {
        console.error("Error al obtener la lista de mayoristas:", error)
        return []
    }
}

// NUEVA Función para guardar un mayorista en la Base de Datos
export async function createMayorista(data: { nombre: string; telefono: string }) {
    try {
        const nuevoMayorista = await prisma.mayorista.create({
            data: {
                nombre: data.nombre,
                telefono: data.telefono
            }
        })
        
        // Le avisamos a la página que se actualice
        revalidatePath('/admin/chatwoot') 
        return { success: true, mayorista: nuevoMayorista }
    } catch (error) {
        console.error("Error al guardar el mayorista en la BD:", error)
        throw new Error("No se pudo guardar el mayorista")
    }
}
