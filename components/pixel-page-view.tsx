"use client"
import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

// Dispara PageView en cada navegación SPA (el init script ya cubrió la primera carga)
export default function PixelPageView() {
  const pathname = usePathname()
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "PageView")
    }
  }, [pathname])

  return null
}
