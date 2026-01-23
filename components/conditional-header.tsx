"use client"

import { usePathname } from "next/navigation"

// Este componente oculta el Header de la tienda en toda la sección de administración
export default function ConditionalHeader({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Ocultamos si la ruta empieza con /admin
  const isFullscreen = pathname?.startsWith("/admin")

  if (isFullscreen) return null

  return <>{children}</>
}
