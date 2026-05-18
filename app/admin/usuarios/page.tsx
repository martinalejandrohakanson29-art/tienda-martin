import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import UsuariosClient from "./usuarios-client"

export const dynamic = "force-dynamic"

export default async function UsuariosPage() {
    const session = await getServerSession(authOptions)
    if (!session || (session.user as any).role !== "SUPER_ADMIN") {
        redirect("/admin")
    }

    const [users, rules] = await Promise.all([
        prisma.user.findMany({
            select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        prisma.notificationRule.findMany({
            include: {
                targetUser: { select: { username: true } },
                sourceUser: { select: { username: true } },
            },
            orderBy: { createdAt: "desc" },
        }),
    ])

    return (
        <UsuariosClient
            initialUsers={JSON.parse(JSON.stringify(users))}
            initialRules={JSON.parse(JSON.stringify(rules))}
            currentUserId={(session.user as any).id}
        />
    )
}
