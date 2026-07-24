import { randomUUID } from "crypto"
import { prisma } from "./prisma"
import { sendPushNotification } from "./firebase-admin"

// Link de la notificación "Pedido preparado Full". Lleva envío + ítem para poder
// resolver (borrar) la alerta exacta en todos los usuarios cuando ese ítem se audita
// (aprueba/rechaza) en /admin/tools/audit. Debe construirse igual en notify.ts (al crear)
// y en audit.ts (al resolver), por eso vive acá como helper compartido.
export const linkAuditFull = (envioId: string, itemId: string) =>
    `/admin/tools/audit?envio=${envioId}&item=${itemId}`

export async function triggerNotification({
    eventType,
    sourceUserId,
    title,
    body,
    link,
}: {
    eventType: string
    sourceUserId?: string
    title: string
    body?: string
    link?: string
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

        // Todas las filas creadas acá comparten groupId: permite que al resolver
        // ("Ir a ver"/"Aceptar") una, se resuelva para todos los usuarios target.
        const groupId = randomUUID()
        await prisma.notification.createMany({
            data: rules.map(rule => ({
                userId: rule.targetUserId,
                eventType,
                title,
                body: body ?? null,
                link: link ?? null,
                groupId,
            })),
        })

        const targetUserIds = [...new Set(rules.map(r => r.targetUserId))]
        const users = await prisma.user.findMany({
            where: { id: { in: targetUserIds }, pushToken: { not: null } },
            select: { pushToken: true },
        })
        const tokens = users.map(u => u.pushToken!).filter(Boolean)
        if (tokens.length > 0) {
            await sendPushNotification({ tokens, title, body, link })
        }
    } catch (error) {
        console.error("[triggerNotification] Error:", error)
    }
}
