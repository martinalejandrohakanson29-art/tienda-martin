"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

// 1. Función para obtener todos los registros
export async function getMayoristas() {
    await requireAdmin();
    try {
        // CORREGIDO: n minúscula
        const mayoristas = await prisma.numerosMayoristas.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        })
        return mayoristas
    } catch (error) {
        console.error("Error al obtener la lista de numerosMayoristas:", error)
        return []
    }
}

// 2. Función para guardar un nuevo registro
export async function createMayorista(data: { nombre: string; telefono: string }) {
    await requireAdmin();
    try {
        // CORREGIDO: n minúscula
        const nuevoMayorista = await prisma.numerosMayoristas.create({
            data: {
                nombre: data.nombre,
                telefono: data.telefono
            }
        })
        
        revalidatePath('/admin/chatwoot') 
        return { success: true, mayorista: nuevoMayorista }
    } catch (error) {
        console.error("Error al guardar en numerosMayoristas:", error)
        throw new Error("No se pudo guardar el mayorista")
    }
}
