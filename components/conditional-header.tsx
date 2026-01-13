"use client"

import { usePathname } from "next/navigation"

// Este componente solo renderizará sus hijos si NO estamos en una página "Full Screen"
export default function ConditionalHeader({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Lista de rutas donde queremos ocultar el Header y el AnnouncementBar
  const isFullscreen =
    pathname === "/admin/mercadolibre/importaciones" ||
    pathname === "/admin/mercadolibre/planning" ||
    pathname === "/admin/mercadolibre/articulos" ||
    pathname === "/admin/mercadolibre/costos"

  // Si es pantalla completa, no mostramos nada (return null)
  if (isFullscreen) return null

  // Si no, mostramos el contenido normal (Header, etc)
  return <>{children}</>
}
