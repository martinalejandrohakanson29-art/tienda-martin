"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createTodo(formData: FormData) {
  const content = formData.get("content") as string
  const priority = formData.get("priority") as string
  const userId = formData.get("userId") as string

  if (!content || !userId) return { error: "Faltan datos" }

  await prisma.todo.create({
    data: {
      content,
      priority,
      userId,
      isShared: true // Las tareas asignadas desde admin suelen ser compartidas/visibles
    }
  })

  revalidatePath("/admin")
}

export async function getUsers() {
    return await prisma.user.findMany({
        select: { id: true, username: true }
    })
}
