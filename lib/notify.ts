import { prisma } from "./prisma"

export async function triggerNotification({
    eventType,
    sourceUserId,
    title,
    body,
}: {
    eventType: string
    sourceUserId?: string
    title: string
    body?: string
}) {
    try {
        const rules = await prisma.notificationRule.findMany({
            where: {
                eventType,
                isActive: true,
                OR: [
                    { sourceUserId: null },
                    ...(sourceUserId ? [{ sourceUserId }] : []),
                ],
            },
        })

        if (rules.length === 0) return

        await prisma.notification.createMany({
            data: rules.map(rule => ({
                userId: rule.targetUserId,
                eventType,
                title,
                body: body ?? null,
            })),
        })
    } catch (error) {
        console.error("[triggerNotification] Error:", error)
    }
}
