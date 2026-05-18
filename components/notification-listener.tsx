"use client"

import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Bell } from "lucide-react"

function playNotificationSound() {
    try {
        const ctx = new AudioContext()

        const playTone = (freq: number, start: number, duration: number, volume = 0.25) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = "sine"
            osc.frequency.setValueAtTime(freq, start)
            gain.gain.setValueAtTime(0, start)
            gain.gain.linearRampToValueAtTime(volume, start + 0.01)
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
            osc.start(start)
            osc.stop(start + duration)
        }

        playTone(880, ctx.currentTime, 0.18)
        playTone(1100, ctx.currentTime + 0.16, 0.22)
    } catch {
        // AudioContext no disponible
    }
}

type NotifRow = {
    id: string
    eventType: string
    title: string
    body: string | null
    createdAt: string
}

export function NotificationListener() {
    const { data: session } = useSession()
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!session) return

        async function poll() {
            try {
                const res = await fetch("/api/notifications/unread", { cache: "no-store" })
                if (!res.ok) return
                const notifications: NotifRow[] = await res.json()

                for (const notif of notifications) {
                    playNotificationSound()
                    toast(notif.title, {
                        description: notif.body ?? undefined,
                        icon: <Bell className="w-4 h-4 text-amber-500" />,
                        duration: 10000,
                        className: "border border-amber-200 bg-amber-50",
                    })
                }
            } catch {
                // error de red, ignorar
            }
        }

        intervalRef.current = setInterval(poll, 5000)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [session])

    return null
}
