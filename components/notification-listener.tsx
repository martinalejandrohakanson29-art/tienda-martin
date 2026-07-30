"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { createPortal } from "react-dom"
import { Bell } from "lucide-react"

// Ambas alertas (general y mayorista) reproducen dos tonos en dos repeticiones,
// solo cambian las frecuencias — esta función hace el trabajo común.
function reproducirParDeTonos(freqA: number, freqB: number) {
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
        playTone(freqA, t,        0.18)
        playTone(freqB, t + 0.16, 0.22)
        // Segunda repetición (con pausa de 0.1s entre ambas)
        playTone(freqA, t + 0.5,  0.18)
        playTone(freqB, t + 0.66, 0.22)
    } catch {
        // AudioContext no disponible
    }
}

function playNotificationSound() {
    reproducirParDeTonos(880, 1100)
}

// Sonido grave y distinto para pedidos mayoristas web, para que no se confunda
// con el beep agudo del resto de las alertas operativas.
function playAlertaMayoristaSound() {
    reproducirParDeTonos(330, 220)
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
                        onClick={() => onClose(notif.displayId)}
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

function NotificationSummaryCard({ count, onExpand }: { count: number; onExpand: () => void }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true))
    }, [])

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
                    <p className="font-semibold text-gray-900 text-sm leading-snug">Hay acciones pendientes</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{count} notificaciones sin revisar</p>
                </div>
            </div>
            <div className="px-4 pb-3.5 flex justify-end">
                <button
                    onClick={onExpand}
                    className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-white transition-colors"
                >
                    Ver
                </button>
            </div>
        </div>
    )
}

const SUMMARY_THRESHOLD = 2

export function NotificationListener() {
    const { data: session } = useSession()
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [notifs, setNotifs] = useState<DisplayNotif[]>([])
    const [mounted, setMounted] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const notifsRef = useRef<DisplayNotif[]>([])
    // Ids ya mostrados en esta sesión, para no repetir el toast en cada poll
    // (la notificación queda activa en el servidor hasta descartarla o resolverla).
    const shownIdsRef = useRef<Set<string>>(new Set())

    useEffect(() => { setMounted(true) }, [])
    useEffect(() => { notifsRef.current = notifs }, [notifs])

    // Al vaciarse la cola, resetea el colapso: la próxima tanda vuelve a arrancar resumida.
    useEffect(() => {
        if (notifs.length === 0) setExpanded(false)
    }, [notifs.length])

    // "Aceptar"/"Ir a ver": descarta el toast y marca la notificación como leída
    // (keepalive para que sobreviva a la navegación de "Ir a ver").
    const dismiss = useCallback((displayId: string) => {
        const notif = notifsRef.current.find(n => n.displayId === displayId)
        if (notif) {
            fetch("/api/notifications/read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({ id: notif.id }),
            }).catch(() => {})
        }
        setNotifs(prev => prev.filter(n => n.displayId !== displayId))
    }, [])

    useEffect(() => {
        if (!session) return

        async function poll() {
            try {
                const res = await fetch("/api/notifications/unread", { cache: "no-store" })
                if (res.ok) {
                    const notifications: NotifRow[] = await res.json()
                    for (const notif of notifications) {
                        // Evita repetir el toast si ya se mostró en esta sesión.
                        if (shownIdsRef.current.has(notif.id)) continue
                        shownIdsRef.current.add(notif.id)
                        if (notif.eventType === "PEDIDO_MAYORISTA_WEB") {
                            playAlertaMayoristaSound()
                        } else {
                            playNotificationSound()
                        }
                        setNotifs(prev => [
                            ...prev,
                            { ...notif, displayId: `${notif.id}-${Date.now()}` },
                        ])
                    }
                }
            } catch {
                // error de red, ignorar
            }

            // Retirar de la pantalla los toasts cuya notificación ya fue resuelta
            // (aprobada/rechazada) por otro usuario y por lo tanto eliminada en la BD.
            try {
                const actuales = notifsRef.current
                const ids = Array.from(new Set(actuales.map(n => n.id)))
                if (ids.length === 0) return
                const res = await fetch("/api/notifications/active", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    cache: "no-store",
                    body: JSON.stringify({ ids }),
                })
                if (!res.ok) return
                const activos: string[] = await res.json()
                const checked = new Set(ids)
                const activeSet = new Set(activos)
                // Conserva los que no chequeamos (recién agregados) y, de los chequeados, solo los activos.
                setNotifs(prev => prev.filter(n => !checked.has(n.id) || activeSet.has(n.id)))
            } catch {
                // error de red, ignorar
            }
        }

        intervalRef.current = setInterval(poll, 5000)
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [session])

    if (!mounted || notifs.length === 0) return null

    // Los pedidos mayoristas web tienen su propia cola, separada de las alertas
    // operativas generales, para que no se mezclen ni visual ni sonoramente.
    const notifsMayorista = notifs.filter(n => n.eventType === "PEDIDO_MAYORISTA_WEB")
    const notifsGenerales = notifs.filter(n => n.eventType !== "PEDIDO_MAYORISTA_WEB")
    const showSummary = notifsGenerales.length > SUMMARY_THRESHOLD && !expanded

    return createPortal(
        <>
            <div className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-2.5 pointer-events-none">
                {showSummary ? (
                    <div className="pointer-events-auto">
                        <NotificationSummaryCard count={notifsGenerales.length} onExpand={() => setExpanded(true)} />
                    </div>
                ) : (
                    notifsGenerales.map(n => (
                        <div key={n.displayId} className="pointer-events-auto">
                            <NotificationCard notif={n} onClose={dismiss} />
                        </div>
                    ))
                )}
            </div>
            {notifsMayorista.length > 0 && (
                <div className="fixed top-5 left-5 z-[9999] flex flex-col gap-2.5 pointer-events-none">
                    {notifsMayorista.map(n => (
                        <div key={n.displayId} className="pointer-events-auto">
                            <NotificationCard notif={n} onClose={dismiss} />
                        </div>
                    ))}
                </div>
            )}
        </>,
        document.body
    )
}
