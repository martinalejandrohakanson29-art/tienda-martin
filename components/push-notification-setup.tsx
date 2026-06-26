"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"

export function PushNotificationSetup() {
    const { data: session } = useSession()

    useEffect(() => {
        if (!session) return

        async function setup() {
            try {
                const { Capacitor } = await import("@capacitor/core")
                if (!Capacitor.isNativePlatform()) return

                const { PushNotifications } = await import("@capacitor/push-notifications")

                const permResult = await PushNotifications.requestPermissions()
                if (permResult.receive !== "granted") return

                await PushNotifications.register()

                PushNotifications.addListener("registration", async ({ value: token }) => {
                    try {
                        await fetch("/api/push-token", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token }),
                        })
                    } catch {
                        // ignorar errores de red
                    }
                })

                PushNotifications.addListener("pushNotificationReceived", notification => {
                    // La app está en foreground: el NotificationListener ya muestra el toast.
                    // No hacemos nada extra para evitar duplicados.
                    console.log("[Push] Notificación recibida en foreground:", notification)
                })

                PushNotifications.addListener("pushNotificationActionPerformed", action => {
                    const link = action.notification.data?.link
                    if (link) {
                        window.location.href = link
                    }
                })
            } catch {
                // No estamos en Capacitor o los permisos no están disponibles
            }
        }

        setup()
    }, [session])

    return null
}
