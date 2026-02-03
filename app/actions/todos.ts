"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createTodo(formData: FormData) {
    const content = formData.get("content") as string
    const priority = formData.get("priority") as string
    const userId = formData.get("userId") as string

    // Si faltan datos, salimos de la función sin devolver nada.
    // Esto es necesario para que el build de Next.js no falle.
    if (!content || !userId) {
        return; 
    }

    try {
        await prisma.todo.create({
            data: {
                content,
                priority,
                userId,
                isShared: true 
            }
        })

        // Esto refresca la página para que aparezca el nuevo pendiente
        revalidatePath("/admin")
    } catch (error) {
        console.error("Error al crear el pendiente:", error)
    }
}

export async function getUsers() {
    return await prisma.user.findMany({
        select: { 
            id: true, 
            username: true 
        }
    })
}
