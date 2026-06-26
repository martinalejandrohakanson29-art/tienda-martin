import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { token } = await req.json()
    if (!token || typeof token !== "string") {
        return NextResponse.json({ error: "Token inválido" }, { status: 400 })
    }

    const userId = (session.user as any).id
    await prisma.user.update({ where: { id: userId }, data: { pushToken: token } })

    return NextResponse.json({ ok: true })
}
