"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export async function createTodo(formData: FormData) {
    const content = formData.get("content") as string
    const priority = formData.get("priority") as string
    const userId = formData.get("userId") as string

    if (!content || !userId) return;

    try {
        await prisma.todo.create({
            data: {
                content,
                priority,
                userId,
                isShared: true 
            }
        })
        revalidatePath("/admin")
        revalidatePath("/admin/todos")
    } catch (error) {
        console.error("Error al crear el pendiente:", error)
    }
}

export async function getUsers() {
    return await prisma.user.findMany({
        select: { id: true, username: true }
    })
}

// NUEVA ACCIÓN: Obtener todas las tareas
export async function getTodos() {
    return await prisma.todo.findMany({
        include: {
            user: { select: { username: true } }
        },
        orderBy: { createdAt: 'desc' }
    })
}

// NUEVA ACCIÓN: Alternar estado de la tarea (completar/descompletar)
export async function toggleTodoStatus(id: string, completed: boolean) {
    try {
        await prisma.todo.update({
            where: { id },
            data: { completed }
        })
        revalidatePath("/admin/todos")
    } catch (error) {
        console.error("Error al actualizar tarea:", error)
    }
}
