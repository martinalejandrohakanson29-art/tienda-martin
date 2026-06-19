"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { createPortal } from "react-dom"
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
        const t = ctx.currentTime
        // Primera repetición
        playTone(880,  t,        0.18)
        playTone(1100, t + 0.16, 0.22)
        // Segunda repetición (con pausa de 0.1s entre ambas)
        playTone(880,  t + 0.5,  0.18)
        playTone(1100, t + 0.66, 0.22)
    } catch {
        // AudioContext no disponible
    }
}

type NotifRow = {
    id: string
    eventType: string
    title: string
    body: string | null
    link: string | null
    createdAt: string
}

type DisplayNotif = NotifRow & { displayId: string }

function NotificationCard({ notif, onClose }: { notif: DisplayNotif; onClose: (id: string) => void }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
    }, [])

    function handleClose() {
        setVisible(false)
        setTimeout(() => onClose(notif.displayId), 300)
    }

    return (
        <div
            style={{
                transform: visible ? "translateX(0)" : "translateX(110%)",
                opacity: visible ? 1 : 0,
                transition: "transform 0.3s ease, opacity 0.3s ease",
            }}
            className="w-80 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden"
        >
            <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{notif.title}</p>
                    {notif.body && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{notif.body}</p>
                    )}
                </div>
            </div>
            <div className="px-4 pb-3.5 flex justify-end gap-2">
                {notif.link && (
                    <a
                        href={notif.link}
                        onClick={handleClose}
                        className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                        Ir a ver
                    </a>
                )}
                <button
                    onClick={handleClose}
                    className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-white transition-colors"
                >
                    Aceptar
                </button>
            </div>
        </div>
    )
}

export function NotificationListener() {
    const { data: session } = useSession()
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [notifs, setNotifs] = useState<DisplayNotif[]>([])
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    const dismiss = useCallback((displayId: string) => {
        setNotifs(prev => prev.filter(n => n.displayId !== displayId))
    }, [])

    useEffect(() => {
        if (!session) return

        async function poll() {
            try {
                const res = await fetch("/api/notifications/unread", { cache: "no-store" })
                if (!res.ok) return
                const notifications: NotifRow[] = await res.json()
                for (const notif of notifications) {
                    playNotificationSound()
                    setNotifs(prev => [
                        ...prev,
                        { ...notif, displayId: `${notif.id}-${Date.now()}` },
                    ])
                }
            } catch {
                // error de red, ignorar
            }
        }

        intervalRef.current = setInterval(poll, 5000)
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [session])

    if (!mounted || notifs.length === 0) return null

    return createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-2.5 pointer-events-none">
            {notifs.map(n => (
                <div key={n.displayId} className="pointer-events-auto">
                    <NotificationCard notif={n} onClose={dismiss} />
                </div>
            ))}
        </div>,
        document.body
    )
}
