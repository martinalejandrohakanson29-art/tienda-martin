import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json([], { status: 401 })

    const userId = (session.user as any).id

    // No se marca como leída acá: la notificación queda activa hasta que el usuario
    // la descarta ("Aceptar") o la acción la resuelve (aprobar/rechazar la elimina).
    // El cliente deduplica para no repetir el toast en cada poll.
    const notifications = await prisma.notification.findMany({
        where: { userId, read: false },
        orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(notifications)
}
