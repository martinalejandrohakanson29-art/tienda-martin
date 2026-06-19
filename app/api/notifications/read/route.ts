import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Marca como leída (descartada) una notificación del usuario actual.
// Se llama cuando el usuario toca "Aceptar" o "Ir a ver".
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ ok: false }, { status: 401 })

    const userId = (session.user as any).id

    let id: string | undefined
    try {
        const body = await req.json()
        id = typeof body?.id === "string" ? body.id : undefined
    } catch {
        id = undefined
    }

    if (!id) return NextResponse.json({ ok: false }, { status: 400 })

    // updateMany acotado por userId: nadie puede marcar notificaciones de otro.
    await prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true },
    })

    return NextResponse.json({ ok: true })
}
