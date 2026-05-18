import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json([], { status: 401 })

    const userId = (session.user as any).id

    const notifications = await prisma.notification.findMany({
        where: { userId, read: false },
        orderBy: { createdAt: "asc" },
    })

    if (notifications.length > 0) {
        await prisma.notification.updateMany({
            where: { id: { in: notifications.map(n => n.id) } },
            data: { read: true },
        })
    }

    return NextResponse.json(notifications)
}
