import { prisma } from "./prisma"

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

        await prisma.notification.createMany({
            data: rules.map(rule => ({
                userId: rule.targetUserId,
                eventType,
                title,
                body: body ?? null,
                link: link ?? null,
            })),
        })
    } catch (error) {
        console.error("[triggerNotification] Error:", error)
    }
}
