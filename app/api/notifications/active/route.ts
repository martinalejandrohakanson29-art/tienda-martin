import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Devuelve, de un conjunto de ids de notificación, cuáles siguen existiendo
// (no fueron resueltas/eliminadas). El listener usa esto para retirar de la
// pantalla los toasts cuya acción ya fue realizada por otro usuario.
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json([], { status: 401 })

    const userId = (session.user as any).id

    let ids: string[] = []
    try {
        const body = await req.json()
        ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : []
    } catch {
        ids = []
    }

    if (ids.length === 0) return NextResponse.json([])

    // "Activa" = sigue existiendo (no fue resuelta/eliminada) y no fue leída/descartada.
    // Permite retirar de la pantalla los toasts ya resueltos por otro usuario o
    // descartados por el mismo usuario en otra pestaña.
    const activas = await prisma.notification.findMany({
        where: { id: { in: ids }, userId, read: false },
        select: { id: true },
    })

    return NextResponse.json(activas.map(n => n.id))
}
